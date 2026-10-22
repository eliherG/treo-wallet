import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { SignJWT } from 'jose';
import pino from 'pino';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createApp } from '../../../app.js';
import { createDataSource } from '../../../database/data-source.js';
import { HttpProblem } from '../../../http/http-problem.js';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import { AuthService } from '../auth.service.js';
import { createAuthRouter } from '../auth.routes.js';
import { RefreshTokenEntity } from '../entities/refresh-token.entity.js';
import { UserEntity } from '../entities/user.entity.js';
import { AccessTokens, refreshHash } from '../jwt.js';
import { authenticatedUserId, requireAccess } from '../middlewares/require-access.js';

const jwtSecret = 't09-integration-only-secret-not-for-production-1234';
const testPassword = 'TestOnlyPassword_12345!';
const db = createDataSource('app', 'test');
const migrator = createDataSource('migrator', 'test');
const createdIds = new Set<string>();
const tokens = new AccessTokens(jwtSecret);
const auth = new AuthService(db, tokens);
const app = createApp({
  logger: pino({ level: 'silent' }),
  registerRoutes(router) {
    router.use(createAuthRouter(auth));
    // This fixture route exists ONLY in the test process, not server.ts.
    router.get('/__test/me', requireAccess(db, tokens), (_req, res) => {
      res.status(200).json({ userId: authenticatedUserId(res) });
    });
    router.get('/__test/users/:userId', requireAccess(db, tokens), (req, res, next) => {
      if (req.params.userId !== authenticatedUserId(res)) {
        next(new HttpProblem(404, 'NOT_FOUND', 'Recurso no encontrado',
          'El recurso solicitado no existe.'));
        return;
      }
      res.status(200).json({ userId: authenticatedUserId(res) });
    });
  },
});

before(async () => {
  await db.initialize();
  await migrator.initialize();
});
after(async () => {
  try {
    if (createdIds.size > 0 && migrator.isInitialized) {
      const ids = [...createdIds];
      await migrator.query('DELETE FROM "refresh_tokens" WHERE "user_id" = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM "accounts" WHERE "user_id" = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM "users" WHERE "id" = ANY($1::uuid[])', [ids]);
    }
  } finally {
    if (db.isInitialized) await db.destroy();
    if (migrator.isInitialized) await migrator.destroy();
  }
});

function email(tag: string): string {
  return `${tag}-${randomUUID()}@treo.test`;
}
async function registerUser(address = email('register')) {
  const response = await request(app).post('/api/v1/auth/register')
    .send({ name: 'Persona Demo', email: address, password: testPassword }).expect(201);
  createdIds.add(response.body.user.id as string);
  return response;
}

function checkDigitValid(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) return false;
  const weights = [3, 7, 1];
  const sum = [...clabe.slice(0, 17)].reduce((total, digit, index) =>
    total + (Number(digit) * weights[index % 3]!) % 10, 0);
  return ((10 - sum % 10) % 10) === Number(clabe[17]);
}

test('T-09: registro válido almacena Argon2id y crea cuenta demo MXN con cero centavos', async () => {
  const address = email('valid');
  const response = await registerUser(address);
  assert.deepEqual(Object.keys(response.body.user).sort(), ['email', 'id', 'name']);
  const user = await db.getRepository(UserEntity).findOneByOrFail({ id: response.body.user.id });
  assert.equal(user.emailCanonical, address);
  assert.match(user.passwordHash, /^\$argon2id\$/);
  assert.notEqual(user.passwordHash, testPassword);
  assert.equal(await argon2.verify(user.passwordHash, testPassword), true);
  const accounts = await db.getRepository(AccountEntity).findBy({ userId: user.id });
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0]?.balanceCents, '0');
  assert.equal(accounts[0]?.currency.trim(), 'MXN');
  assert.equal(accounts[0]?.status, 'ACTIVE');
  assert.ok(checkDigitValid(accounts[0]!.clabe));
  assert.equal(JSON.stringify(response.body).includes(testPassword), false);
  assert.equal(JSON.stringify(response.body).includes('argon2'), false);
});

test('T-09: Zod rechaza nombre, correo, password y propiedades extra', async () => {
  const address = email('invalid');
  const base = { name: 'Persona Demo', email: address, password: testPassword };
  const invalid = [
    { ...base, name: 'X' },
    { ...base, email: 'no-email' },
    { ...base, password: 'corto' },
    { ...base, secret: 'sensitive' },
  ];
  for (const body of invalid) {
    const res = await request(app).post('/api/v1/auth/register').send(body).expect(400);
    assert.equal(res.body.code, 'INVALID_REQUEST');
    assert.equal(res.body.requestId, res.headers['x-request-id']);
    assert.equal(JSON.stringify(res.body).includes('sensitive'), false);
  }
  assert.equal(await db.getRepository(UserEntity).countBy({ emailCanonical: address }), 0);
});

test('T-09: email canónico duplicado responde 409 sin segunda cuenta', async () => {
  const address = email('duplicate');
  const first = await registerUser(address);
  const second = await request(app).post('/api/v1/auth/register').send({
    name: 'Persona Demo', email: address.toUpperCase(), password: testPassword,
  }).expect(409);
  assert.equal(second.body.code, 'EMAIL_ALREADY_REGISTERED');
  assert.equal(await db.getRepository(UserEntity).countBy({ emailCanonical: address }), 1);
  assert.equal(await db.getRepository(AccountEntity).countBy({ userId: first.body.user.id }), 1);
});

test('T-09: dos registros simultáneos crean solamente un usuario y una cuenta', async () => {
  const address = email('race');
  const payload = { name: 'Persona Demo', email: address, password: testPassword };
  const [a, b] = await Promise.all([
    request(app).post('/api/v1/auth/register').send(payload),
    request(app).post('/api/v1/auth/register').send(payload),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  const winner = a.status === 201 ? a : b;
  createdIds.add(winner.body.user.id as string);
  assert.equal(await db.getRepository(UserEntity).countBy({ emailCanonical: address }), 1);
  assert.equal(await db.getRepository(AccountEntity).countBy({ userId: winner.body.user.id }), 1);
});

test('T-09: login móvil entrega JWT corto y refresh aleatorio; DB almacena solo hash', async () => {
  const address = email('mobile');
  const { body: { user } } = await registerUser(address);
  const response = await request(app).post('/api/v1/auth/login')
    .send({ email: address, password: testPassword, client: 'MOBILE' }).expect(200);
  assert.equal(response.body.user.id, user.id);
  assert.equal(response.body.accessExpiresInSeconds, 900);
  assert.equal(typeof response.body.accessToken, 'string');
  assert.equal(typeof response.body.refreshToken, 'string');
  const actualUserId = await tokens.verify(response.body.accessToken as string);
  assert.equal(actualUserId, user.id);
  const sessions = await db.getRepository(RefreshTokenEntity).findBy({ userId: user.id });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.tokenHash, refreshHash(response.body.refreshToken as string));
  assert.equal(JSON.stringify(sessions).includes(response.body.refreshToken as string), false);
  assert.ok(sessions[0]!.expiresAt.getTime() > Date.now());
  assert.equal(response.headers['set-cookie'], undefined);
});

test('T-09: login web entrega refresh solo en cookie HttpOnly, nunca en JSON', async () => {
  const address = email('web');
  await registerUser(address);
  const response = await request(app).post('/api/v1/auth/login')
    .send({ email: address, password: testPassword, client: 'WEB' }).expect(200);
  assert.equal('refreshToken' in response.body, false);
  const cookie = JSON.stringify(response.headers['set-cookie'] ?? []);
  assert.match(cookie, /treo_refresh=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\/api\/v1\/auth/);
  assert.equal(response.body.accessExpiresInSeconds, 900);
});

test('T-09: credenciales incorrectas responden siempre con 401 genérico', async () => {
  const address = email('credentials');
  await registerUser(address);
  for (const [target, password] of [
    [address, 'WrongPassword12345'],
    [email('not-found'), testPassword],
  ]) {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: target, password, client: 'MOBILE' }).expect(401);
    assert.equal(res.body.code, 'INVALID_CREDENTIALS');
    assert.equal(res.body.detail, 'Correo o contraseña incorrectos.');
    assert.ok(password, 'La contraseña de prueba debe estar definida');
    assert.equal(JSON.stringify(res.body).includes(password), false);
  }
});

test('T-09: bearer verifica firma, expiración y usuario; no concede propiedad ajena', async () => {
  const a = await registerUser(email('owner-a'));
  const b = await registerUser(email('owner-b'));
  const login = await request(app).post('/api/v1/auth/login').send({
    email: a.body.user.email, password: testPassword, client: 'MOBILE',
  }).expect(200);
  const bearer = `Bearer ${login.body.accessToken as string}`;
  assert.equal((await request(app).get('/api/v1/__test/me').expect(401)).body.code, 'UNAUTHORIZED');
  await request(app).get('/api/v1/__test/me').set('Authorization', bearer).expect(200)
    .then((res) => assert.equal(res.body.userId, a.body.user.id));
  await request(app).get(`/api/v1/__test/users/${b.body.user.id}`)
    .set('Authorization', bearer).expect(404);
  const forged = await new SignJWT({ token_use: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().setIssuer('treo-wallet-api').setAudience('treo-wallet')
    .setSubject(a.body.user.id).setExpirationTime('15m')
    .sign(new TextEncoder().encode('wrong-signing-secret-for-testing-12345678'));
  await request(app).get('/api/v1/__test/me').set('Authorization', `Bearer ${forged}`).expect(401);
  const expired = await new SignJWT({ token_use: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
    .setIssuer('treo-wallet-api').setAudience('treo-wallet')
    .setSubject(a.body.user.id).setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(jwtSecret));
  await request(app).get('/api/v1/__test/me').set('Authorization', `Bearer ${expired}`).expect(401);
});

test('T-09: rate limit de login devuelve 429 después de cinco intentos', async () => {
  const address = email('rate');
  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/v1/auth/login')
      .send({ email: address, password: testPassword, client: 'MOBILE' }).expect(401);
  }
  const result = await request(app).post('/api/v1/auth/login')
    .send({ email: address, password: testPassword, client: 'MOBILE' }).expect(429);
  assert.equal(result.body.code, 'RATE_LIMITED');
  assert.equal(result.body.requestId, result.headers['x-request-id']);
});

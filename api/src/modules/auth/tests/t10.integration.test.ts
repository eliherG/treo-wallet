import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../../../app.js';
import { createDataSource } from '../../../database/data-source.js';
import { AuthService } from '../auth.service.js';
import { createAuthRouter } from '../auth.routes.js';
import { RefreshTokenEntity } from '../entities/refresh-token.entity.js';
import { AccessTokens, refreshHash } from '../jwt.js';
import { RefreshSessionService } from '../refresh-session.service.js';

const origin = 'http://localhost:5173';
const password = 'T10-Only-SafePassword!123';
const db = createDataSource('app', 'test');
const migrator = createDataSource('migrator', 'test');
const jwt = new AccessTokens('t10-integration-only-test-secret-123456789');
const auth = new AuthService(db, jwt);
const createdIds = new Set<string>();
const logLines: string[] = [];
const logger = pino({ base: null }, { write(line: string) { logLines.push(line); } });
const sessions = new RefreshSessionService(db, jwt, (event) => {
  logger.info(event, 'Authentication session event');
});
const app = createApp({
  webOrigin: origin,
  logger,
  registerRoutes(router) {
    router.use(createAuthRouter(auth, sessions, { webOrigin: origin }));
  },
});

before(async () => {
  await db.initialize();
  await migrator.initialize();
});

after(async () => {
  try {
    if (createdIds.size && migrator.isInitialized) {
      const ids = [...createdIds];
      // Break self-FK replacement links before deleting the test-only session tree.
      await migrator.query('UPDATE "refresh_tokens" SET replaced_by_id = NULL WHERE "user_id" = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM "refresh_tokens" WHERE "user_id" = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM "accounts" WHERE "user_id" = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM "users" WHERE "id" = ANY($1::uuid[])', [ids]);
    }
  } finally {
    if (db.isInitialized) await db.destroy();
    if (migrator.isInitialized) await migrator.destroy();
  }
});

async function register(tag: string): Promise<{ id: string; email: string }> {
  const email = `${tag}-${randomUUID()}@treo.test`;
  const response = await request(app).post('/api/v1/auth/register')
    .send({ name: 'Persona T10', email, password }).expect(201);
  const id = response.body.user.id as string;
  createdIds.add(id);
  return { id, email };
}

async function mobileLogin(email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/login')
    .send({ email, password, client: 'MOBILE' }).expect(200);
  return response.body.refreshToken as string;
}

function mobileRefresh(token: string) {
  return request(app).post('/api/v1/auth/refresh')
    .send({ client: 'MOBILE', refreshToken: token });
}

function refreshRow(token: string): Promise<RefreshTokenEntity | null> {
  return db.getRepository(RefreshTokenEntity).findOneBy({ tokenHash: refreshHash(token) });
}

function cookieFrom(setCookie: unknown): string {
  const cookies: string[] = Array.isArray(setCookie) ? setCookie as string[]
    : typeof setCookie === 'string' ? [setCookie] : [];
  const cookie = cookies.find((item) => item.startsWith('treo_refresh='));
  assert.ok(cookie, 'Expected treo_refresh cookie');
  return cookie.split(';')[0]!;
}

function webRequest(path: '/api/v1/auth/refresh' | '/api/v1/auth/logout', cookie: string) {
  return request(app).post(path).set('Origin', origin)
    .set('Cookie', cookie).send({ client: 'WEB' });
}

test('T-10: MOBILE renueva con nuevo token opaco y revoca el anterior dentro de una transacción', async () => {
  const user = await register('rotate');
  const first = await mobileLogin(user.email);
  const response = await mobileRefresh(first).expect(200);
  const second = response.body.refreshToken as string;
  assert.notEqual(second, first);
  assert.equal(response.body.accessExpiresInSeconds, 900);
  assert.equal(response.body.user.id, user.id);
  assert.equal(await jwt.verify(response.body.accessToken as string), user.id);
  const parent = await refreshRow(first);
  const child = await refreshRow(second);
  assert.ok(parent && child);
  assert.equal(parent.replacedById, child.id);
  assert.equal(parent.familyId, child.familyId);
  assert.ok(parent.revokedAt instanceof Date);
  assert.equal(child.revokedAt, null);
  assert.equal(child.replacedById, null);
  assert.equal(JSON.stringify([parent, child]).includes(second), false);
});

test('T-10: reutilizar un refresh rotado revoca la familia completa de modo persistente', async () => {
  const user = await register('reuse');
  const first = await mobileLogin(user.email);
  const second = (await mobileRefresh(first).expect(200)).body.refreshToken as string;
  const third = (await mobileRefresh(second).expect(200)).body.refreshToken as string;
  const failed = await mobileRefresh(first).expect(401);
  assert.equal(failed.body.code, 'INVALID_SESSION');
  assert.equal(failed.body.requestId, failed.headers['x-request-id']);
  const descendants = [await refreshRow(second), await refreshRow(third)];
  assert.ok(descendants.every((row) => row?.revokedAt instanceof Date));
  await mobileRefresh(third).expect(401);
});

test('T-10: dos refresh concurrentes no crean dos sesiones activas', async () => {
  const user = await register('race');
  const initial = await mobileLogin(user.email);
  const results = await Promise.all([mobileRefresh(initial), mobileRefresh(initial)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 401]);
  const good = results.find((result) => result.status === 200)!;
  const descendant = await refreshRow(good.body.refreshToken as string);
  assert.ok(descendant?.revokedAt instanceof Date,
    'The losing replay must revoke the winning rotation family');
  await mobileRefresh(good.body.refreshToken as string).expect(401);
});

test('T-10: un reuse no revoca otra familia del mismo usuario', async () => {
  const user = await register('families');
  const first = await mobileLogin(user.email);
  const independent = await mobileLogin(user.email);
  const firstChild = (await mobileRefresh(first).expect(200)).body.refreshToken as string;
  await mobileRefresh(first).expect(401);
  assert.ok((await refreshRow(firstChild))?.revokedAt);
  const independentNext = await mobileRefresh(independent).expect(200);
  assert.equal(independentNext.body.user.id, user.id);
});

test('T-10: logout MOBILE revoca su familia, es idempotente y respeta otras sesiones', async () => {
  const user = await register('logout-mobile');
  const first = await mobileLogin(user.email);
  const second = await mobileLogin(user.email);
  const out = await request(app).post('/api/v1/auth/logout')
    .send({ client: 'MOBILE', refreshToken: first }).expect(200);
  assert.deepEqual(out.body, { success: true });
  await mobileRefresh(first).expect(401);
  await request(app).post('/api/v1/auth/logout')
    .send({ client: 'MOBILE', refreshToken: first }).expect(200);
  await mobileRefresh(second).expect(200);
});

test('T-10: WEB rota exclusivamente cookie HttpOnly y rechaza ausencia de Origin', async () => {
  const user = await register('web-rotate');
  const login = await request(app).post('/api/v1/auth/login')
    .send({ client: 'WEB', email: user.email, password }).expect(200);
  const firstCookie = cookieFrom(login.headers['set-cookie']);
  const denied = await request(app).post('/api/v1/auth/refresh')
    .set('Cookie', firstCookie).send({ client: 'WEB' }).expect(403);
  assert.equal(denied.body.code, 'ORIGIN_FORBIDDEN');
  await request(app).post('/api/v1/auth/refresh')
    .set('Cookie', firstCookie).set('Origin', 'https://evil.example')
    .send({ client: 'WEB' }).expect(403);
  const rotated = await webRequest('/api/v1/auth/refresh', firstCookie).expect(200);
  assert.equal('refreshToken' in rotated.body, false);
  const nextCookie = cookieFrom(rotated.headers['set-cookie']);
  assert.notEqual(firstCookie, nextCookie);
  const encoded = JSON.stringify(rotated.headers['set-cookie']);
  assert.match(encoded, /HttpOnly/);
  assert.match(encoded, /SameSite=Lax/);
  assert.match(encoded, /Path=\/api\/v1\/auth/);
  assert.equal(rotated.body.user.id, user.id);
});

test('T-10: WEB logout requiere Origin válido, borra cookie y rechaza refresh posterior', async () => {
  const user = await register('web-logout');
  const login = await request(app).post('/api/v1/auth/login')
    .send({ client: 'WEB', email: user.email, password }).expect(200);
  const cookie = cookieFrom(login.headers['set-cookie']);
  await request(app).post('/api/v1/auth/logout')
    .set('Cookie', cookie).send({ client: 'WEB' }).expect(403);
  const logout = await webRequest('/api/v1/auth/logout', cookie).expect(200);
  assert.deepEqual(logout.body, { success: true });
  assert.match(JSON.stringify(logout.headers['set-cookie']), /Expires=Thu, 01 Jan 1970/);
  await webRequest('/api/v1/auth/refresh', cookie).expect(401);
  // Cookie-less repeated logout clears client state and succeeds.
  await request(app).post('/api/v1/auth/logout').set('Origin', origin)
    .send({ client: 'WEB' }).expect(200);
});

test('T-10: peticiones mal formadas, cliente cruzado y cookies duplicadas se rechazan', async () => {
  const user = await register('invalid');
  const token = await mobileLogin(user.email);
  await request(app).post('/api/v1/auth/refresh').send({ client: 'MOBILE' }).expect(400);
  await request(app).post('/api/v1/auth/logout').send({ client: 'MOBILE' }).expect(400);
  await request(app).post('/api/v1/auth/refresh').send({ client: 'TABLET', refreshToken: token }).expect(400);
  await request(app).post('/api/v1/auth/refresh').send({ client: 'MOBILE', refreshToken: 'bad' }).expect(401);
  await request(app).post('/api/v1/auth/refresh').set('Origin', origin)
    .send({ client: 'WEB', refreshToken: token }).expect(400);
  await request(app).post('/api/v1/auth/refresh').set('Origin', origin)
    .set('Cookie', `treo_refresh=${token}; treo_refresh=${token}`)
    .send({ client: 'WEB' }).expect(401);
  // Bad requests must not revoke unrelated/valid sessions.
  await mobileRefresh(token).expect(200);
});

test('T-10: expiración de refresh en base de datos produce 401 sin emitir reemplazo', async () => {
  const user = await register('expired');
  const token = await mobileLogin(user.email);
  await db.query("UPDATE \"refresh_tokens\" SET expires_at = now() - interval '1 minute' WHERE token_hash = $1",
    [refreshHash(token)]);
  const countBefore = await db.getRepository(RefreshTokenEntity).countBy({ userId: user.id });
  await mobileRefresh(token).expect(401);
  const countAfter = await db.getRepository(RefreshTokenEntity).countBy({ userId: user.id });
  assert.equal(countAfter, countBefore);
});

test('T-10: logs y errores no incluyen tokens ni cookies sensibles', async () => {
  const user = await register('logs');
  const token = await mobileLogin(user.email);
  const rotated = await mobileRefresh(token).expect(200);
  const next = rotated.body.refreshToken as string;
  const refused = await mobileRefresh(token).expect(401);
  const logs = logLines.join('');
  assert.match(logs, /auth\.refresh_rotated/);
  assert.match(logs, /auth\.refresh_reuse_detected/);
  assert.match(logs, /requestId/);
  for (const secret of [token, next, refreshHash(token), refreshHash(next)]) {
    assert.equal(logLines.join('').includes(secret), false);
    assert.equal(JSON.stringify(refused.body).includes(secret), false);
  }
});

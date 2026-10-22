import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { type Router } from 'express';
import pino from 'pino';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../../app.js';
import { HttpProblem } from '../http-problem.js';
import { validateBody } from '../middlewares/validate-body.js';

const SECRET_CLABE = '012345678901234567';
const SECRET_TOKEN = 'Bearer very-secret-session-token';

function fixture() {
  const messages: string[] = [];
  const logger = pino({ base: null, level: 'info' }, {
    write(line: string) { messages.push(line); },
  });
  const registerRoutes = (router: Router) => {
    router.post('/validation', validateBody(z.object({ label: z.string().min(2) }).strict()),
      (_req, res) => { res.status(200).json({ ok: true }); });
    router.get('/private', (_req, _res, next) => {
      next(new HttpProblem(401, 'UNAUTHORIZED', 'No autorizado',
        'Se requiere autenticación.'));
    });
    router.post('/explode', () => {
      throw new Error(`Internal ${SECRET_CLABE} ${SECRET_TOKEN} password=123456`);
    });
  };
  return { app: createApp({ logger, registerRoutes }), messages };
}

test('T-08: GET /health devuelve 200 con identificador UUID', async () => {
  const { app } = fixture();
  const response = await request(app).get('/health').expect(200);
  assert.deepEqual(response.body, { status: 'ok' });
  assert.match(response.headers['x-request-id'] as string, /^[0-9a-f-]{36}$/i);
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('T-08: conserva un X-Request-ID válido y sustituye uno inválido', async () => {
  const { app } = fixture();
  const id = randomUUID();
  const accepted = await request(app).get('/health').set('X-Request-ID', id).expect(200);
  assert.equal(accepted.headers['x-request-id'], id);
  const rejected = await request(app).get('/health')
    .set('X-Request-ID', '123456789012345678-secret').expect(200);
  assert.notEqual(rejected.headers['x-request-id'], '123456789012345678-secret');
});

test('T-08: Zod rechaza un cuerpo inválido sin exponer datos', async () => {
  const { app } = fixture();
  const response = await request(app).post('/api/v1/validation')
    .send({ label: 'a', clabe: SECRET_CLABE }).expect(400);
  assert.match(response.headers['content-type'] ?? '', /application\/problem\+json/);
  assert.equal(response.body.code, 'INVALID_REQUEST');
  assert.equal(response.body.status, 400);
  assert.equal(response.body.requestId, response.headers['x-request-id']);
  assert.equal(JSON.stringify(response.body).includes(SECRET_CLABE), false);
});

test('T-08: JSON malformado devuelve Problem Details 400', async () => {
  const { app } = fixture();
  const response = await request(app).post('/api/v1/validation')
    .set('Content-Type', 'application/json').send('{ "password": ').expect(400);
  assert.equal(response.body.code, 'INVALID_JSON');
  assert.equal(response.body.requestId, response.headers['x-request-id']);
  assert.equal(JSON.stringify(response.body).includes('password'), false);
});

test('T-08: 401 se comunica mediante RFC 7807', async () => {
  const { app } = fixture();
  const response = await request(app).get('/api/v1/private').expect(401);
  assert.equal(response.body.code, 'UNAUTHORIZED');
  assert.equal(response.body.requestId, response.headers['x-request-id']);
  assert.equal(response.body.type, 'about:blank');
});

test('T-08: error interno 500 no expone excepción, CLABE ni token', async () => {
  const { app } = fixture();
  const response = await request(app).post('/api/v1/explode').expect(500);
  assert.equal(response.body.code, 'INTERNAL_ERROR');
  assert.equal(response.body.requestId, response.headers['x-request-id']);
  const serialized = JSON.stringify(response.body);
  for (const secret of [SECRET_CLABE, SECRET_TOKEN, 'password=123456', 'Internal']) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('T-08: 404 también produce Problem Details sanitizado', async () => {
  const { app } = fixture();
  const response = await request(app).get(`/api/v1/${SECRET_CLABE}`).expect(404);
  assert.equal(response.body.code, 'NOT_FOUND');
  assert.equal(JSON.stringify(response.body).includes(SECRET_CLABE), false);
});

test('T-08: Swagger UI y contrato aprobado navegables', async () => {
  const { app } = fixture();
  const html = await request(app).get('/api-docs/').expect(200);
  assert.match(html.text, /swagger-ui/i);
  const spec = await request(app).get('/api-docs/openapi.json').expect(200);
  assert.equal(spec.body.openapi, '3.1.0');
  assert.equal(spec.body.info.title, 'Treo Wallet API');
  assert.ok(spec.body.paths['/transfers']);
});

test('T-08: logs JSON no incluyen body, CLABE, Authorization ni excepción', async () => {
  const { app, messages } = fixture();
  await request(app).post('/api/v1/explode')
    .set('Authorization', SECRET_TOKEN)
    .send({ clabe: SECRET_CLABE, password: '123456' }).expect(500);
  const output = messages.join('');
  assert.ok(messages.length >= 2, 'Debe existir un log HTTP y uno de error');
  for (const secret of [SECRET_CLABE, SECRET_TOKEN, 'password', 'Internal 0123']) {
    assert.equal(output.includes(secret), false);
  }
  for (const line of messages) {
    const record = JSON.parse(line) as { requestId?: string; event?: string };
    assert.ok(record.requestId);
    assert.ok(record.event);
  }
});

test('T-08: CORS restringe los orígenes permitidos', async () => {
  const { app } = fixture();
  const allowed = await request(app).get('/health').set('Origin', 'http://localhost:5173').expect(200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');
  const denied = await request(app).get('/health').set('Origin', 'https://attacker.example').expect(200);
  assert.notEqual(denied.headers['access-control-allow-origin'], 'https://attacker.example');
});

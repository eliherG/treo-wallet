import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MobileAuthController, MobileAuthError } from '../controller';
import type { AuthTransport, MobileAuthReply, TokenStorage } from '../types';

const demo: MobileAuthReply = {
  accessToken: 'access-in-memory', refreshToken: 'opaque-secret', accessExpiresInSeconds: 900,
  user: { id: 'user-1', name: 'Demo A', email: 'demo@treo.test' },
};
function setup(initial: string | null = null) {
  let value = initial;
  const calls: string[] = [];
  const storage: TokenStorage = {
    read: async () => value,
    write: async next => { value = next; calls.push('secure-write'); },
    remove: async () => { value = null; calls.push('secure-remove'); },
  };
  const api: AuthTransport = {
    login: async input => { assert.equal(input.email, 'demo@treo.test'); calls.push('mobile-login'); return demo; },
    refresh: async secret => { assert.equal(secret, 'opaque-secret'); calls.push('mobile-refresh');
      return { ...demo, refreshToken: 'rotated-secret' }; },
    logout: async secret => { calls.push(`mobile-logout:${secret}`); },
  };
  return { controller: new MobileAuthController(storage, api), storage, api, calls,
    getStored: () => value };
}

test('T-26: login stores ONLY refresh; access stays in memory', async () => {
  const x = setup();
  const user = await x.controller.login({ email: 'demo@treo.test', password: 'test-password' });
  assert.equal(user.id, 'user-1');
  assert.equal(x.getStored(), 'opaque-secret');
  assert.equal(x.controller.access, 'access-in-memory');
  assert.deepEqual(x.calls, ['mobile-login', 'secure-write']);
});

test('T-26: app restart rotates stored refresh before restoring session', async () => {
  const x = setup('opaque-secret');
  const user = await x.controller.restore();
  assert.equal(user?.email, 'demo@treo.test');
  assert.equal(x.getStored(), 'rotated-secret');
  assert.deepEqual(x.calls, ['mobile-refresh', 'secure-write']);
});

test('T-26: logout revokes server session before removing secure token', async () => {
  const x = setup('opaque-secret');
  await x.controller.logout();
  assert.equal(x.getStored(), null);
  assert.deepEqual(x.calls, ['mobile-logout:opaque-secret', 'secure-remove']);
});

test('T-26: remote logout failure preserves session for retry', async () => {
  const x = setup('opaque-secret');
  x.api.logout = async () => { throw new MobileAuthError(0, 'NETWORK_ERROR', 'Sin red'); };
  await assert.rejects(x.controller.logout(), /Sin red/);
  assert.equal(x.getStored(), 'opaque-secret');
  assert.deepEqual(x.calls, []);
});

test('T-26: revoked refresh clears credentials and returns guest', async () => {
  const x = setup('opaque-secret');
  x.api.refresh = async () => { throw new MobileAuthError(401, 'INVALID_SESSION', 'Caducó'); };
  assert.equal(await x.controller.restore(), null);
  assert.equal(x.getStored(), null);
  assert.equal(x.controller.user, null);
});

test('T-26: network loss does not delete refresh token', async () => {
  const x = setup('opaque-secret');
  x.api.refresh = async () => { throw new MobileAuthError(0, 'NETWORK_ERROR', 'Sin red'); };
  await assert.rejects(x.controller.restore(), /Sin red/);
  assert.equal(x.getStored(), 'opaque-secret');
});

test('T-26: repeated refresh requests share one in-flight rotation', async () => {
  const x = setup('opaque-secret');
  let resolves!: (reply: MobileAuthReply) => void;
  let signalStarted!: () => void;
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  x.api.refresh = async () => { signalStarted(); return new Promise<MobileAuthReply>(resolve => { resolves = resolve; }); };
  const a = x.controller.renew();
  const b = x.controller.renew();
  await started;
  resolves({ ...demo, refreshToken: 'new-secret' });
  const users = await Promise.all([a, b]);
  assert.equal(users[0]?.id, users[1]?.id);
  assert.equal(x.getStored(), 'new-secret');
  assert.equal(x.calls.filter(c => c === 'secure-write').length, 1);
});

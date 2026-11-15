import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SessionService } from '../apps/gateway/src/auth/session.service';
import { ThingsBoardClient, type Tokens } from '../apps/gateway/src/thingsboard/thingsboard.client';

const jwt = (expires: number) =>
  `header.${Buffer.from(JSON.stringify({ exp: expires })).toString('base64url')}.fake-signature`;
class FakeThingsBoard extends ThingsBoardClient {
  refreshCalls = 0;
  failRefresh = false;
  override async login(): Promise<Tokens> {
    return { token: jwt(Math.floor(Date.now() / 1000) + 5), refreshToken: 'fake-refresh-only' };
  }
  override async refresh(): Promise<Tokens> {
    this.refreshCalls++;
    await Promise.resolve();
    if (this.failRefresh) throw new Error('Fake refresh denied');
    return {
      token: jwt(Math.floor(Date.now() / 1000) + 3600),
      refreshToken: 'fake-refreshed-token',
    };
  }
  override async request<T>(path: string): Promise<T> {
    assert.equal(path, '/api/auth/user');
    return {
      id: { id: 'fake-user' },
      tenantId: { id: 'fake-tenant' },
      authority: 'TENANT_ADMIN',
    } as T;
  }
}
test('concurrent token requests share one upstream refresh', async () => {
  const upstream = new FakeThingsBoard();
  const sessions = new SessionService(upstream);
  const session = await sessions.login('fake', 'not-a-real-password');
  const tokens = await Promise.all([sessions.accessToken(session), sessions.accessToken(session)]);
  assert.equal(upstream.refreshCalls, 1);
  assert.equal(tokens[0], tokens[1]);
  assert.equal(tokens[0], session.tokens.token);
});
test('failed refresh revokes the session and announces revocation', async () => {
  const upstream = new FakeThingsBoard();
  upstream.failRefresh = true;
  const sessions = new SessionService(upstream);
  const session = await sessions.login('fake', 'not-a-real-password');
  const revoked: string[] = [];
  const subscription = sessions.revoked.subscribe((id) => revoked.push(id));
  try {
    await assert.rejects(() => sessions.accessToken(session), /Fake refresh denied/);
    assert.throws(() => sessions.get(session.id));
    assert.deepEqual(revoked, [session.id]);
  } finally {
    subscription.unsubscribe();
  }
});
test('absolute session expiry revokes access even with a valid token', async () => {
  const sessions = new SessionService(new FakeThingsBoard());
  const session = await sessions.login('fake', 'not-a-real-password');
  const clock = mock.method(Date, 'now', () => session.expiresAt + 1);
  try {
    assert.throws(() => sessions.get(session.id));
  } finally {
    clock.mock.restore();
  }
});

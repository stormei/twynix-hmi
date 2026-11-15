import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { isolatedGateway, waitUntil } from './support/isolated-gateway';

let fixture: Awaited<ReturnType<typeof isolatedGateway>>;
before(async () => {
  fixture = await isolatedGateway();
});
after(async () => {
  await fixture?.stop();
});
async function browser() {
  const session = await fixture.login();
  const socket = new WebSocket(`${fixture.base.replace('http:', 'ws:')}/api/realtime`, {
    origin: fixture.origin,
    headers: { Cookie: session.cookie },
  });
  const messages: {
    type?: string;
    message?: string;
    values?: Record<string, { value: string }>;
  }[] = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await once(socket, 'open');
  return { socket, messages };
}
const subscription = () => ({
  type: 'subscribe',
  alarms: false,
  bindings: [
    {
      entityId: fixture.entityId,
      entityType: 'DEVICE',
      key: 'pressure',
      unit: '',
      staleAfterMs: 30000,
    },
  ],
});

test('commands-disabled gateway refuses command requests without calling upstream RPC', async () => {
  const session = await fixture.login();
  const result = await fetch(
    `${fixture.base}/api/projects/${crypto.randomUUID()}/releases/${crypto.randomUUID()}/commands`,
    {
      method: 'POST',
      headers: {
        Origin: fixture.origin,
        Cookie: session.cookie,
        'X-CSRF-Token': session.csrf,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );
  assert.equal(result.status, 403);
  assert.match(await result.text(), /commands are disabled/);
  assert.equal(fixture.rpcCalls, 0);
});
test('malformed client subscription is rejected without opening an upstream socket', async () => {
  const { socket, messages } = await browser();
  const initial = fixture.connections;
  try {
    socket.send('{invalid');
    await waitUntil(() => messages.some((message) => message.type === 'error'));
    assert.equal(fixture.connections, initial);
    assert.equal(socket.readyState, WebSocket.OPEN);
  } finally {
    socket.close();
  }
});
test('malformed upstream data reports an error while valid telemetry can still arrive', async () => {
  const { socket, messages } = await browser();
  try {
    socket.send(JSON.stringify(subscription()));
    await waitUntil(() => messages.some((message) => message.type === 'telemetry'));
    for (const upstream of fixture.upstreamWs.clients) upstream.send('{invalid');
    await waitUntil(() =>
      messages.some(
        (message) =>
          message.type === 'error' && message.message?.includes('Unexpected ThingsBoard'),
      ),
    );
    messages.length = 0;
    for (const upstream of fixture.upstreamWs.clients) upstream.send(fixture.telemetry());
    await waitUntil(() => messages.some((message) => message.type === 'telemetry'));
  } finally {
    socket.close();
  }
});
test('upstream interruption reconnects and resubscribes the existing browser session', async () => {
  const { socket, messages } = await browser();
  try {
    socket.send(JSON.stringify(subscription()));
    await waitUntil(() => messages.some((message) => message.type === 'telemetry'));
    const initial = fixture.connections;
    messages.length = 0;
    for (const upstream of fixture.upstreamWs.clients) upstream.close();
    await waitUntil(() => fixture.connections > initial);
    await waitUntil(() => messages.some((message) => message.type === 'telemetry'));
    assert.equal(socket.readyState, WebSocket.OPEN);
  } finally {
    socket.close();
  }
});

test('changing a binding reissues the subscription and delivers its new key', async () => {
  const { socket, messages } = await browser();
  try {
    socket.send(JSON.stringify(subscription()));
    await waitUntil(() => messages.some((message) => message.type === 'telemetry'));
    // Subscription updates are intentionally rate limited by the gateway to 200 ms.
    await new Promise((resolve) => setTimeout(resolve, 225));
    const changed = subscription();
    changed.bindings[0].key = 'temperature';
    messages.length = 0;
    socket.send(JSON.stringify(changed));
    await waitUntil(() => fixture.requestedKeys.includes('temperature'));
    await waitUntil(() =>
      messages.some((message) =>
        Object.keys(message.values ?? {}).some((key) => key.endsWith(':temperature')),
      ),
    );
    assert.equal(socket.readyState, WebSocket.OPEN);
  } finally {
    socket.close();
  }
});

test('authenticated discovery supports asset pages and validated telemetry/attribute samples', async () => {
  const session = await fixture.login();
  const headers = { Cookie: session.cookie };
  const page = await fetch(`${fixture.base}/api/entities?type=ASSET&search=Tank&page=2`, {
    headers,
  });
  assert.equal(page.status, 200);
  const query = fixture.discoveryQueries.at(-1) as {
    entityFilter: { entityType: string };
    pageLink: { page: number; textSearch: string };
  };
  assert.equal(query.entityFilter.entityType, 'ASSET');
  assert.equal(query.pageLink.page, 2);
  assert.equal(query.pageLink.textSearch, 'Tank');
  const url = `${fixture.base}/api/entities/ASSET/${fixture.entityId}/catalog`;
  assert.equal((await fetch(url)).status, 401);
  const catalog = await fetch(url, { headers });
  assert.equal(catalog.status, 200);
  assert.deepEqual(await catalog.json(), {
    telemetry: [{ key: 'pressure', value: '4.2', timestamp: 1000 }],
    attributes: [{ key: 'description', value: 'Fixture pump', timestamp: 2000 }],
  });
  assert.equal((await fetch(`${fixture.base}/api/entities?type=USER`, { headers })).status, 400);
  fixture.setMalformedCatalog(true);
  try {
    assert.equal((await fetch(url, { headers })).status, 502);
  } finally {
    fixture.setMalformedCatalog(false);
  }
  assert.equal(fixture.rpcCalls, 0);
});

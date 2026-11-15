import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { createStarterProject, Project, Release, TagValue, Alarm } from '../packages/model/src';

const origin = 'http://127.0.0.1:4200';
const tenantId = crypto.randomUUID(),
  userA = crypto.randomUUID(),
  userB = crypto.randomUUID();
const token = (id: string) =>
  `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, sub: id })).toString('base64url')}.signature`;
let rpcCalls = 0,
  gateway: ChildProcess,
  base = '',
  dataDir = '';
let lastRpc: unknown;
const upstream = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : undefined;
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/auth/login') {
    if (body.password !== 'test-password') {
      res.statusCode = 401;
      res.end('{}');
      return;
    }
    res.end(
      JSON.stringify({
        token: token(body.username === 'b@test' ? userB : userA),
        refreshToken: 'test-refresh',
      }),
    );
    return;
  }
  if (req.url === '/api/auth/user') {
    const isB = req.headers['x-authorization'] === `Bearer ${token(userB)}`;
    res.end(
      JSON.stringify({
        id: { id: isB ? userB : userA },
        tenantId: { id: tenantId },
        email: isB ? 'b@test' : 'a@test',
        authority: 'TENANT_ADMIN',
      }),
    );
    return;
  }
  if (req.url?.startsWith('/api/rpc/twoway/')) {
    rpcCalls++;
    lastRpc = body;
    if (body.method === 'simulateTimeout') {
      res.statusCode = 504;
      res.end('{}');
      return;
    }
    res.end(JSON.stringify({ accepted: true }));
    return;
  }
  if (req.url?.endsWith('/ack')) {
    res.end('{}');
    return;
  }
  res.statusCode = 404;
  res.end('{}');
});
const upstreamWs = new WebSocketServer({ server: upstream });
upstreamWs.on('connection', (ws) =>
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    for (const command of message.cmds ?? []) {
      if (command.type === 'ENTITY_DATA') {
        ws.send(
          JSON.stringify({
            cmdId: command.cmdId,
            errorCode: 0,
            data: {
              data: [
                {
                  entityId: command.query.entityFilter.singleEntity,
                  latest: { TIME_SERIES: { pressure: { ts: Date.now(), value: '4.2' } } },
                },
              ],
            },
          }),
        );
      }
      if (command.type === 'ALARM_DATA')
        ws.send(
          JSON.stringify({
            cmdId: 1000,
            errorCode: 0,
            data: {
              data: [
                {
                  id: 'alarm-1',
                  type: 'Pressure high',
                  severity: 'MAJOR',
                  status: 'ACTIVE_UNACK',
                  createdTime: Date.now(),
                },
              ],
            },
          }),
        );
    }
  }),
);

before(async () => {
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  base = `http://127.0.0.1:${port}`;
  dataDir = await mkdtemp(join(tmpdir(), 'twynix-test-'));
  gateway = spawn(process.execPath, ['dist/gateway/apps/gateway/src/main.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      APP_ORIGIN: origin,
      THINGSBOARD_URL: `http://127.0.0.1:${(upstream.address() as { port: number }).port}`,
      PROJECT_DATA_DIR: dataDir,
      DATABASE_URL: '',
      ENABLE_DEVICE_COMMANDS: 'true',
    },
    stdio: 'pipe',
  });
  let output = '';
  gateway.stdout?.on('data', (chunk) => {
    output += chunk;
  });
  gateway.stderr?.on('data', (chunk) => {
    output += chunk;
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      /* Wait for startup. */
    }
    if (gateway.exitCode !== null) throw new Error(output);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Gateway failed to start: ${output}`);
});
after(async () => {
  if (gateway && gateway.exitCode === null) {
    gateway.kill('SIGTERM');
    await once(gateway, 'exit');
  }
  for (const client of upstreamWs.clients) client.terminate();
  await new Promise<void>((resolve) => upstreamWs.close(() => resolve()));
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});
async function login(username = 'a@test') {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'test-password' }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { csrf: string; user: unknown };
  assert.equal('token' in body, false);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  return { cookie: cookie.split(';')[0], csrf: body.csrf };
}
function request(
  path: string,
  session: { cookie: string; csrf: string },
  method = 'GET',
  body?: unknown,
  extra: Record<string, string> = {},
) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      Origin: origin,
      Cookie: session.cookie,
      'X-CSRF-Token': session.csrf,
      'Content-Type': 'application/json',
      ...extra,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test('gateway requires a session, same origin and CSRF for writes', async () => {
  assert.equal((await fetch(`${base}/api/projects`)).status, 401);
  const session = await login();
  const project = createStarterProject();
  assert.equal(
    (
      await request(`/api/projects/${project.id}`, session, 'PUT', project, {
        Origin: 'http://evil.test',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/api/projects/${project.id}`, session, 'PUT', project, {
        'X-CSRF-Token': 'bad',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/api/projects/${project.id}`, session, 'PUT', {
        ...project,
        schemaVersion: 999,
      })
    ).status,
    400,
  );
});

test('save conflicts, user isolation and immutable publication are enforced', async () => {
  const session = await login(),
    other = await login('b@test');
  const project = createStarterProject();
  const saved = (await (
    await request(`/api/projects/${project.id}`, session, 'PUT', project)
  ).json()) as Project;
  assert.equal(saved.revision, 1);
  assert.equal((await request(`/api/projects/${project.id}`, session, 'PUT', project)).status, 409);
  assert.equal((await request(`/api/projects/${project.id}`, other)).status, 404);
  const release = (await (
    await request(`/api/projects/${project.id}/releases`, session, 'POST', { revision: 1 })
  ).json()) as Release;
  assert.equal(release.project.name, project.name);
  await request(`/api/projects/${project.id}`, session, 'PUT', { ...saved, name: 'Changed draft' });
  const stored = (await (await request(`/api/projects/${project.id}`, session)).json()) as {
    releases: Release[];
  };
  assert.equal(stored.releases[0].project.name, project.name);
});

test('commands use published configuration, deduplicate requests and refuse unconfigured widgets', async () => {
  const session = await login(),
    project = createStarterProject(),
    deviceId = crypto.randomUUID();
  project.screens[0].widgets[0].action = {
    type: 'command',
    deviceId,
    method: 'setState',
    params: { enabled: true },
    confirmation: 'Confirm?',
  };
  const saved = (await (
    await request(`/api/projects/${project.id}`, session, 'PUT', project)
  ).json()) as Project;
  const release = (await (
    await request(`/api/projects/${project.id}/releases`, session, 'POST', {
      revision: saved.revision,
    })
  ).json()) as Release;
  const path = `/api/projects/${project.id}/releases/${release.id}/commands`;
  const body = {
    screenId: 'overview',
    widgetId: project.screens[0].widgets[0].id,
    requestId: crypto.randomUUID(),
    method: 'malicious-method',
    params: {},
  };
  const initialCalls = rpcCalls;
  assert.equal((await request(path, session, 'POST', body)).status, 201);
  assert.equal((await request(path, session, 'POST', body)).status, 201);
  assert.equal(rpcCalls, initialCalls + 1);
  assert.deepEqual(lastRpc, { method: 'setState', params: { enabled: true }, timeout: 10000 });
  assert.equal(
    (
      await request(path, session, 'POST', {
        ...body,
        widgetId: project.screens[0].widgets[1].id,
        requestId: crypto.randomUUID(),
      })
    ).status,
    403,
  );
});

test('authenticated realtime subscriptions deliver values and alarms; logout closes the socket', async () => {
  const session = await login();
  const browser = new WebSocket(`${base.replace('http:', 'ws:')}/api/realtime`, {
    origin,
    headers: { Cookie: session.cookie },
  });
  const messages: (
    | { type: 'telemetry'; values: Record<string, TagValue> }
    | { type: 'alarms'; alarms: Alarm[] }
    | { type: 'connection'; state: string }
    | { type: 'error'; message: string }
    | { type: 'session-expired' }
  )[] = [];
  browser.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await once(browser, 'open');
  browser.send(
    JSON.stringify({
      type: 'subscribe',
      bindings: [
        {
          entityId: crypto.randomUUID(),
          entityType: 'DEVICE',
          key: 'pressure',
          unit: 'bar',
          staleAfterMs: 30000,
        },
      ],
      alarms: true,
    }),
  );
  for (let i = 0; i < 100 && !messages.some((m) => m.type === 'alarms'); i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(
    messages.some(
      (m) => m.type === 'telemetry' && Object.values(m.values).some((v) => v.value === '4.2'),
    ),
  );
  assert.ok(messages.some((m) => m.type === 'alarms' && m.alarms[0].name === 'Pressure high'));
  const closed = once(browser, 'close');
  assert.equal((await request('/api/auth/logout', session, 'POST', {})).status, 201);
  const [code] = await closed;
  assert.equal(code, 4401);
  assert.equal((await request('/api/projects', session)).status, 401);
});

test('published double-click commands are resolved separately from activation commands', async () => {
  const session = await login(),
    project = createStarterProject();
  const widget = project.screens[0].widgets[0];
  widget.doubleClickAction = {
    type: 'command',
    deviceId: crypto.randomUUID(),
    method: 'doubleClickMethod',
    params: { speed: 12 },
    confirmation: 'Apply speed?',
  };
  const saved = (await (
    await request(`/api/projects/${project.id}`, session, 'PUT', project)
  ).json()) as Project;
  const release = (await (
    await request(`/api/projects/${project.id}/releases`, session, 'POST', {
      revision: saved.revision,
    })
  ).json()) as Release;
  const path = `/api/projects/${project.id}/releases/${release.id}/commands`;
  const input = { screenId: 'overview', widgetId: widget.id, requestId: crypto.randomUUID() };
  assert.equal((await request(path, session, 'POST', input)).status, 403);
  assert.equal(
    (await request(path, session, 'POST', { ...input, event: 'doubleClick' })).status,
    201,
  );
  assert.deepEqual(lastRpc, { method: 'doubleClickMethod', params: { speed: 12 }, timeout: 10000 });
  assert.equal(
    (await request(path, session, 'POST', { ...input, event: 'unsupported' })).status,
    400,
  );
});

test('mapped commands validate values and authorities against the published widget and bind deduplication to the value', async () => {
  const session = await login(),
    project = createStarterProject();
  const widget = {
    ...project.screens[0].widgets[0],
    kind: 'slider' as const,
    dashboard: { type: 'slider' as const, minimum: 10, maximum: 80, step: 5, unit: 'rpm' },
    binding: null,
  };
  widget.action = {
    type: 'command',
    deviceId: crypto.randomUUID(),
    method: 'setSpeed',
    params: { channel: 2 },
    confirmation: 'Apply speed?',
    policy: {
      mapping: {
        parameter: 'speed',
        valueType: 'number',
        minimum: 10,
        maximum: 80,
        step: 5,
        allowedValues: [],
      },
      timeoutMs: 5000,
      authorities: ['TENANT_ADMIN'],
      feedback: null,
      replyCheck: null,
    },
  };
  project.screens = [{ ...project.screens[0], widgets: [widget], connections: [], groups: {} }];
  const saved = (await (
    await request(`/api/projects/${project.id}`, session, 'PUT', project)
  ).json()) as Project;
  const release = (await (
    await request(`/api/projects/${project.id}/releases`, session, 'POST', {
      revision: saved.revision,
    })
  ).json()) as Release;
  const path = `/api/projects/${project.id}/releases/${release.id}/commands`,
    body = {
      screenId: project.screens[0].id,
      widgetId: widget.id,
      requestId: crypto.randomUUID(),
      value: 35,
      method: 'forged',
      params: { channel: 99 },
    };
  const before = rpcCalls;
  for (const value of [true, '35', 5, 85, 32, null])
    assert.equal(
      (await request(path, session, 'POST', { ...body, value, requestId: crypto.randomUUID() }))
        .status,
      400,
    );
  assert.equal(rpcCalls, before);
  assert.equal((await request(path, session, 'POST', body)).status, 201);
  assert.deepEqual(lastRpc, {
    method: 'setSpeed',
    params: { channel: 2, speed: 35 },
    timeout: 5000,
  });
  assert.equal((await request(path, session, 'POST', body)).status, 201);
  assert.equal(rpcCalls, before + 1);
  assert.equal((await request(path, session, 'POST', { ...body, value: 40 })).status, 409);
  assert.equal(rpcCalls, before + 1);
  const denied = {
    ...saved,
    screens: saved.screens.map((screen) => ({
      ...screen,
      widgets: screen.widgets.map((widget) => ({
        ...widget,
        action:
          widget.action.type === 'command'
            ? {
                ...widget.action,
                policy: { ...widget.action.policy!, authorities: ['CUSTOMER_USER' as const] },
              }
            : widget.action,
      })),
    })),
  };
  const next = (await (
    await request(`/api/projects/${project.id}`, session, 'PUT', denied)
  ).json()) as Project;
  const deniedRelease = (await (
    await request(`/api/projects/${project.id}/releases`, session, 'POST', {
      revision: next.revision,
    })
  ).json()) as Release;
  assert.equal(
    (
      await request(
        `/api/projects/${project.id}/releases/${deniedRelease.id}/commands`,
        session,
        'POST',
        { ...body, requestId: crypto.randomUUID() },
      )
    ).status,
    403,
  );
  assert.equal(rpcCalls, before + 1);
});

test('RPC timeout and configured reply rejection remain distinct outcomes', async () => {
  const session = await login(),
    project = createStarterProject(),
    widget = project.screens[0].widgets[0];
  widget.action = {
    type: 'command',
    deviceId: crypto.randomUUID(),
    method: 'simulateTimeout',
    params: {},
    confirmation: 'Fixture only',
  };
  let saved = (await (
    await request(`/api/projects/${project.id}`, session, 'PUT', project)
  ).json()) as Project;
  let release = (await (
    await request(`/api/projects/${project.id}/releases`, session, 'POST', {
      revision: saved.revision,
    })
  ).json()) as Release;
  const body = {
    screenId: project.screens[0].id,
    widgetId: widget.id,
    requestId: crypto.randomUUID(),
  };
  assert.equal(
    (
      await request(
        `/api/projects/${project.id}/releases/${release.id}/commands`,
        session,
        'POST',
        body,
      )
    ).status,
    504,
  );
  saved.screens[0].widgets[0].action = {
    ...widget.action,
    method: 'setState',
    policy: {
      mapping: null,
      timeoutMs: 10000,
      authorities: [],
      feedback: null,
      replyCheck: { field: 'success', expectedValue: true },
    },
  };
  saved = (await (
    await request(`/api/projects/${project.id}`, session, 'PUT', saved)
  ).json()) as Project;
  release = (await (
    await request(`/api/projects/${project.id}/releases`, session, 'POST', {
      revision: saved.revision,
    })
  ).json()) as Release;
  const reply = await request(
    `/api/projects/${project.id}/releases/${release.id}/commands`,
    session,
    'POST',
    { ...body, requestId: crypto.randomUUID() },
  );
  assert.equal(reply.status, 201);
  assert.equal(((await reply.json()) as { state: string }).state, 'rejected');
});

test('published Preview examples remain blocked even when assigned a valid-looking device target', async () => {
  const { createCommandPreviewWidgets } =
    await import('../packages/editor/src/examples/command-preview');
  const session = await login(),
    project = createStarterProject(),
    widgets = createCommandPreviewWidgets();
  const slider = widgets.find((widget) => widget.kind === 'slider')!;
  if (slider.action.type !== 'command') throw new Error('Example command missing');
  slider.action.deviceId = crypto.randomUUID();
  project.screens = [
    {
      id: 'preview-only',
      name: 'Preview only',
      width: 1280,
      height: 800,
      widgets,
      groups: {},
      connections: [],
    },
  ];
  const saved = (await (
    await request(`/api/projects/${project.id}`, session, 'PUT', project)
  ).json()) as Project;
  const release = (await (
    await request(`/api/projects/${project.id}/releases`, session, 'POST', {
      revision: saved.revision,
    })
  ).json()) as Release;
  const before = rpcCalls;
  const result = await request(
    `/api/projects/${project.id}/releases/${release.id}/commands`,
    session,
    'POST',
    { screenId: 'preview-only', widgetId: slider.id, value: 35, requestId: crypto.randomUUID() },
  );
  assert.equal(result.status, 403);
  assert.match(await result.text(), /Preview-only/);
  assert.equal(rpcCalls, before);
});

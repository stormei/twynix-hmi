import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';

export async function waitUntil(predicate: () => boolean, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Isolated fixture condition timed out.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return (server.address() as { port: number }).port;
}
export async function isolatedGateway() {
  const origin = 'http://127.0.0.1:4200';
  const entityId = crypto.randomUUID();
  const userId = crypto.randomUUID(),
    tenantId = crypto.randomUUID();
  const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fake`;
  let rpcCalls = 0;
  let connections = 0;
  let requestedKeys: string[] = [];
  const discoveryQueries: unknown[] = [];
  let malformedCatalog = false;
  const upstream = createServer(async (request, response) => {
    const chunks: string[] = [];
    for await (const chunk of request) chunks.push(String(chunk));
    const body = chunks.length ? JSON.parse(chunks.join('')) : null;
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/auth/login')
      return response.end(JSON.stringify({ token, refreshToken: 'fake-refresh' }));
    if (request.url === '/api/auth/user')
      return response.end(
        JSON.stringify({
          id: { id: userId },
          tenantId: { id: tenantId },
          authority: 'TENANT_ADMIN',
        }),
      );
    if (request.url === '/api/entitiesQuery/find') {
      discoveryQueries.push(body);
      return response.end(
        JSON.stringify({
          data: [
            {
              entityId: { id: entityId },
              latest: { ENTITY_FIELD: { name: { value: 'Fixture equipment' } } },
            },
          ],
          hasNext: false,
        }),
      );
    }
    if (request.url?.endsWith('/keys/timeseries'))
      return response.end(JSON.stringify(malformedCatalog ? { invalid: true } : ['pressure']));
    if (request.url?.endsWith('/values/timeseries'))
      return response.end(JSON.stringify({ pressure: [{ ts: 1000, value: '4.2' }] }));
    if (request.url?.endsWith('/values/attributes'))
      return response.end(
        JSON.stringify([{ key: 'description', value: 'Fixture pump', lastUpdateTs: 2000 }]),
      );
    if (request.url?.startsWith('/api/rpc/')) {
      rpcCalls++;
      return response.end('{}');
    }
    response.writeHead(404).end('{}');
  });
  const upstreamWs = new WebSocketServer({ server: upstream });
  const telemetry = (key = 'pressure') =>
    JSON.stringify({
      cmdId: 1,
      data: {
        data: [
          {
            entityId: { id: entityId, entityType: 'DEVICE' },
            latest: { TIME_SERIES: { [key]: { ts: Date.now(), value: '4.2' } } },
          },
        ],
      },
    });
  upstreamWs.on('connection', (socket) => {
    connections++;
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as {
        cmds?: { type?: string; latestCmd?: { keys?: { key: string }[] } }[];
      };
      const commands = message.cmds?.filter((command) => command.type === 'ENTITY_DATA') ?? [];
      if (commands.length) {
        requestedKeys = commands.flatMap(
          (command) => command.latestCmd?.keys?.map((item) => item.key) ?? [],
        );
        socket.send(telemetry(requestedKeys[0]));
      }
    });
  });
  const upstreamPort = await listen(upstream);
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const directory = await mkdtemp(join(tmpdir(), 'twynix-regression-'));
  const gateway = spawn(process.execPath, ['dist/gateway/apps/gateway/src/main.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      APP_ORIGIN: origin,
      THINGSBOARD_URL: `http://127.0.0.1:${upstreamPort}`,
      PROJECT_DATA_DIR: directory,
      DATABASE_URL: '',
      ENABLE_DEVICE_COMMANDS: 'false',
    },
    stdio: 'pipe',
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  try {
    const deadline = Date.now() + 5000;
    while (!ready) {
      await probe();
      if (Date.now() > deadline || gateway.exitCode !== null)
        throw new Error('Isolated gateway did not start.');
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } catch (error) {
    await stop();
    throw error;
  }
  async function stop() {
    if (gateway.exitCode === null) {
      gateway.kill('SIGTERM');
      await once(gateway, 'exit');
    }
    for (const socket of upstreamWs.clients) socket.terminate();
    await new Promise<void>((resolve) => upstreamWs.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
  return {
    base,
    origin,
    entityId,
    upstreamWs,
    discoveryQueries,
    setMalformedCatalog(value: boolean) {
      malformedCatalog = value;
    },
    telemetry,
    stop,
    get requestedKeys() {
      return requestedKeys;
    },
    get rpcCalls() {
      return rpcCalls;
    },
    get connections() {
      return connections;
    },
    async login() {
      const response = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'fake-only', password: 'fake-only' }),
      });
      if (!response.ok) throw new Error('Fake login failed.');
      const result = (await response.json()) as { csrf: string };
      return { cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: result.csrf };
    },
  };

  // Probe only this owned ephemeral process; no shared developer service is reused.
  async function probe() {
    try {
      ready = (await fetch(`${base}/api/health`)).ok;
    } catch {
      /* Startup pending. */
    }
  }
}

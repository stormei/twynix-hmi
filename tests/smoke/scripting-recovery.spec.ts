import { test, expect, type Page } from '@playwright/test';
import { createStarterProject, newWidget } from '../../packages/model/src';
declare global {
  interface Window {
    scriptRecovery: {
      hasHeld: () => boolean;
      fail: () => void;
      allow: () => void;
      created: () => number;
    };
  }
}
async function seedRecovery(page: Page) {
  const project = createStarterProject();
  project.screens[0].connections = [];
  project.screens[0].widgets = [
    {
      ...newWidget('label', 0),
      id: 'recovery-widget',
      name: 'Recovery',
      x: 100,
      y: 100,
      text: 'Saved baseline',
      behaviorConfig: {
        apiVersion: 1,
        resultMode: 'appearance',
        inputs: {},
        outputs: ['text', 'color'],
        fallback: 'baseline',
      },
      behavior: 'return {text:"Recovered",color:"#123456"};',
    },
  ];
  await page.addInitScript(
    (serialized) =>
      localStorage.setItem(
        'twynix.local-project.v1:smoke',
        JSON.stringify({ project: JSON.parse(serialized), dirty: true }),
      ),
    JSON.stringify(project),
  );
  await page.goto('/?workspace=smoke');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page
    .getByRole('button', { name: /Script console/ })
    .first()
    .click();
}
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && url.port === '4300' ? route.continue() : route.abort();
  });
});
test('Worker failures quarantine visibly, keep baseline and recover through explicit retry without source edits', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let hold = true,
      created = 0;
    const held = new Set<RecoveryWorker>();
    class RecoveryWorker extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        created++;
      }
      override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        if (
          hold &&
          message &&
          typeof message === 'object' &&
          'mode' in message &&
          message.mode === 'behavior'
        ) {
          held.clear();
          held.add(this);
          return;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
      override terminate() {
        held.delete(this);
        super.terminate();
      }
    }
    window.Worker = RecoveryWorker;
    window.scriptRecovery = {
      hasHeld: () => held.size > 0,
      created: () => created,
      fail: () => {
        const worker = held.values().next().value;
        held.clear();
        worker?.dispatchEvent(new ErrorEvent('error', { message: 'Synthetic worker failure' }));
      },
      allow: () => {
        hold = false;
      },
    };
  });
  await seedRecovery(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect.poll(() => page.evaluate(() => window.scriptRecovery.hasHeld())).toBe(true);
    await page.evaluate(() => window.scriptRecovery.fail());
  }
  await expect(page.locator('.console-row').filter({ hasText: 'QUARANTINED' })).toContainText(
    'Baseline restored',
  );
  await expect(page.locator('[data-widget-id="recovery-widget"]')).toContainText('Saved baseline');
  await page.evaluate(() => window.scriptRecovery.allow());
  await page.getByRole('button', { name: 'Retry behavior Recovery', exact: true }).click();
  await expect(page.locator('[data-widget-id="recovery-widget"]')).toContainText('Recovered');
  expect(await page.evaluate(() => window.scriptRecovery.created())).toBeGreaterThanOrEqual(4);
});
test('failed WASM initialization can recover after the asset becomes available', async ({
  page,
}) => {
  let available = false,
    failures = 0;
  await page.route('**/assets/emscripten-module.wasm', (route) => {
    if (available) return route.continue();
    failures++;
    return route.fulfill({ status: 503, body: 'Synthetic unavailable WASM asset' });
  });
  await seedRecovery(page);
  await expect(page.locator('.console-row').filter({ hasText: 'QUARANTINED' })).toContainText(
    'Baseline restored',
  );
  expect(failures).toBeGreaterThan(0);
  available = true;
  await page.getByRole('button', { name: 'Retry behavior Recovery', exact: true }).click();
  await expect(page.locator('[data-widget-id="recovery-widget"]')).toContainText('Recovered');
});

test('published Runtime keeps its source and geometry when the draft behavior changes', async ({
  page,
}) => {
  const project = createStarterProject();
  project.screens[0].connections = [];
  project.screens[0].widgets = [
    {
      ...newWidget('label', 0),
      id: 'published-behavior',
      name: 'Published behavior',
      x: 300,
      y: 300,
      behaviorConfig: {
        apiVersion: 1,
        resultMode: 'appearance',
        inputs: {},
        outputs: ['text', 'position', 'rotation'],
        fallback: 'baseline',
        template: { id: 'quality-fallback', version: 1 },
      },
      behavior:
        'return {text:"Published source",position:{offsetX:80,offsetY:0},rotation:{offsetDegrees:30}};',
    },
  ];
  const saved = { ...project, revision: 1 };
  const release = {
    id: '20000000-0000-4000-8000-000000000001',
    publishedAt: new Date().toISOString(),
    project: saved,
  };
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: { id: '30000000-0000-4000-8000-000000000001' },
          tenantId: { id: '40000000-0000-4000-8000-000000000001' },
          authority: 'TENANT_ADMIN',
          email: 'fixture@example.invalid',
        },
        csrf: 'synthetic',
        commandsEnabled: false,
      },
    }),
  );
  await page.route(`**/api/projects/${project.id}`, (route) => route.fulfill({ json: saved }));
  await page.route(`**/api/projects/${project.id}/releases`, (route) =>
    route.fulfill({ json: release }),
  );
  await page.routeWebSocket('**/api/realtime', (socket) =>
    socket.onMessage(() => socket.send(JSON.stringify({ type: 'connection', state: 'connected' }))),
  );
  await page.addInitScript(
    (serialized) =>
      localStorage.setItem(
        'twynix.local-project.v1:smoke',
        JSON.stringify({ project: JSON.parse(serialized), dirty: true }),
      ),
    JSON.stringify(project),
  );
  await page.goto('/?workspace=smoke');
  await page.getByRole('button', { name: project.name, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Publish release…', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Published revision 1');
  await page.locator('[data-widget-id="published-behavior"]').click();
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'JavaScript source', exact: true })
    .fill('return {text:"Draft source"};');
  await page.getByRole('textbox', { name: 'JavaScript source', exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('[data-widget-id="published-behavior"]')).toContainText('Draft source');
  await page.getByRole('button', { name: project.name, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open published runtime', exact: true }).click();
  const widget = page.locator('[data-widget-id="published-behavior"]');
  await expect(widget).toContainText('Published source');
  await expect(widget).not.toContainText('Draft source');
  await expect(widget.locator('.widget-content')).toHaveCSS('transform', /0.866025/);
});

test('overloaded expression batches do not retain an old good binding result and recover to latest telemetry', async ({
  page,
}) => {
  const project = createStarterProject();
  const sources = Array.from({ length: 12 }, (_, index) => ({
    entityId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    entityType: 'DEVICE' as const,
    key: 'value',
    unit: '',
    staleAfterMs: 10000,
  }));
  project.screens = [
    {
      id: 'overload',
      name: 'Overload fixture',
      width: 1920,
      height: 1000,
      groups: {},
      connections: [],
      widgets: sources.map((binding, index) => ({
        ...newWidget('value', index),
        id: `overload-${index}`,
        x: 100 + (index % 4) * 400,
        y: 100 + Math.floor(index / 4) * 200,
        binding,
        propertyBindings: {
          text: {
            type: 'expression',
            enabled: true,
            source: null,
            expression: '(()=>{while(true){}})()',
          },
        },
      })),
    },
  ];
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: { id: '30000000-0000-4000-8000-000000000001' },
          tenantId: { id: '40000000-0000-4000-8000-000000000001' },
          authority: 'TENANT_ADMIN',
        },
        csrf: 'synthetic',
        commandsEnabled: false,
      },
    }),
  );
  let socket: import('@playwright/test').WebSocketRoute | undefined;
  await page.routeWebSocket('**/api/realtime', (ws) => {
    socket = ws;
    ws.onMessage(() => ws.send(JSON.stringify({ type: 'connection', state: 'connected' })));
  });
  await page.addInitScript(
    (serialized) =>
      localStorage.setItem(
        'twynix.local-project.v1:smoke',
        JSON.stringify({ project: JSON.parse(serialized), dirty: true }),
      ),
    JSON.stringify(project),
  );
  await page.goto('/?workspace=smoke');
  await expect.poll(() => !!socket).toBe(true);
  const send = (value: number) =>
    socket!.send(
      JSON.stringify({
        type: 'telemetry',
        values: Object.fromEntries(
          sources.map((source) => [
            `DEVICE:${source.entityId}:value`,
            { value, timestamp: Date.now(), quality: 'good' },
          ]),
        ),
      }),
    );
  send(42);
  const first = page.locator('[data-widget-id="overload-0"]');
  await expect(first).toContainText('42');
  let value = 50;
  const interval = setInterval(() => send(value++), 50);
  try {
    await expect(first).toContainText('UNKNOWN');
    await expect(first).not.toContainText('42');
  } finally {
    clearInterval(interval);
  }
  send(999);
  await expect(first).toContainText('999');
});

test('legacy time-dependent property expressions refresh with unchanged live inputs', async ({
  page,
}) => {
  const project = createStarterProject();
  project.screens[0].connections = [];
  project.screens[0].widgets = [
    {
      ...newWidget('label', 0),
      id: 'expression-clock',
      x: 100,
      y: 100,
      binding: null,
      propertyBindings: {
        value: { type: 'constant', enabled: true, value: 1 },
        text: {
          type: 'expression',
          enabled: true,
          source: null,
          expression: '"Clock " + Date.now()',
        },
      },
    },
  ];
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: { id: '30000000-0000-4000-8000-000000000001' },
          tenantId: { id: '40000000-0000-4000-8000-000000000001' },
          authority: 'TENANT_ADMIN',
        },
        csrf: 'synthetic',
        commandsEnabled: false,
      },
    }),
  );
  await page.routeWebSocket('**/api/realtime', (socket) =>
    socket.onMessage(() => socket.send(JSON.stringify({ type: 'connection', state: 'connected' }))),
  );
  await page.addInitScript(
    (serialized) =>
      localStorage.setItem(
        'twynix.local-project.v1:smoke',
        JSON.stringify({ project: JSON.parse(serialized), dirty: true }),
      ),
    JSON.stringify(project),
  );
  await page.goto('/?workspace=smoke');
  const widget = page.locator('[data-widget-id="expression-clock"]');
  await expect(widget).toContainText('Clock');
  const first = await widget.textContent();
  await expect.poll(() => widget.textContent()).not.toBe(first);
});

import { test, expect, type WebSocketRoute } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createStarterProject, newWidget, bindingKey } from '../../packages/model/src';

test('50 synthetic telemetry tags render a burst and recover stale state without replacing nodes', async ({
  page,
  context,
}) => {
  const project = createStarterProject();
  const widgets = Array.from({ length: 50 }, (_, index) => ({
    ...newWidget('value', index),
    id: `load-${index}`,
    name: `Load value ${index}`,
    x: (index % 10) * 180,
    y: Math.floor(index / 10) * 130,
    width: 160,
    height: 100,
    binding: {
      entityId: crypto.randomUUID(),
      entityType: 'DEVICE' as const,
      key: 'load',
      unit: '',
      staleAfterMs: 1000,
    },
  }));
  project.screens = [
    {
      id: 'load',
      name: 'Synthetic telemetry',
      width: 1920,
      height: 800,
      groups: {},
      connections: [],
      widgets,
    },
  ];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' || url.port !== '4300') return route.abort();
    if (url.pathname === '/api/auth/session')
      return route.fulfill({
        json: {
          user: {
            id: { id: 'synthetic-user' },
            tenantId: { id: 'synthetic-tenant' },
            authority: 'TENANT_ADMIN',
          },
          csrf: 'synthetic',
          commandsEnabled: false,
        },
      });
    return route.continue();
  });
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/api/realtime', (route) => {
    socket = route;
    route.onMessage(() => route.send(JSON.stringify({ type: 'connection', state: 'connected' })));
  });
  await page.addInitScript((serialized) => {
    localStorage.setItem(
      'twynix.local-project.v1:load',
      JSON.stringify({ project: JSON.parse(serialized), dirty: true }),
    );
  }, JSON.stringify(project));
  await page.goto('/?workspace=load');
  await expect(page.locator('.canvas-widget')).toHaveCount(50);
  await expect.poll(() => !!socket).toBe(true);
  const first = page.locator('[data-widget-id="load-0"]');
  const originalNode = await first.elementHandle();
  const started = performance.now();
  for (let batch = 0; batch < 20; batch++) {
    const values = Object.fromEntries(
      widgets.map((widget) => [
        bindingKey(widget.binding),
        { value: 1000 + batch, timestamp: Date.now(), quality: 'good' },
      ]),
    );
    socket!.send(JSON.stringify({ type: 'telemetry', values }));
  }
  await expect(first).toContainText('1,019');
  const burstToVisibleMs = performance.now() - started;
  expect(await originalNode!.evaluate((node) => node.isConnected)).toBe(true);
  socket!.send(JSON.stringify({ type: 'connection', state: 'disconnected' }));
  await expect(first).toContainText('STALE');
  await expect(first).toContainText('1,019'); // Existing value-display behavior retains the visibly stale last sample.
  expect(errors).toEqual([]);
  mkdirSync('artifacts/benchmarks', { recursive: true });
  writeFileSync(
    'artifacts/benchmarks/browser-telemetry.json',
    JSON.stringify(
      {
        tags: 50,
        batches: 20,
        valuesDelivered: 1000,
        burstToVisibleMs: Number(burstToVisibleMs.toFixed(2)),
        nodeIdentityPreserved: true,
        limitation:
          'Synthetic short burst and stale recovery; not sustained load, FPS, or live ThingsBoard validation.',
      },
      null,
      2,
    ) + '\n',
  );
});

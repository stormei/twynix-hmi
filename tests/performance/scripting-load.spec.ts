import { test, expect, type WebSocketRoute } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance as clock } from 'node:perf_hooks';
import { bindingKey, createStarterProject, newWidget } from '../../packages/model/src';

declare global {
  interface Window {
    scriptingLoad: {
      started: number;
      posted: number;
      inflight: number;
      maxInflight: number;
      completed: number;
      latencies: number[];
      modes: Record<string, number>;
      frames: number[];
      longTasks: number[];
      heapStart: number | null;
      heapEnd: number | null;
    };
  }
}

test('sustained multi-input scripting and expressions coalesce, preserve nodes and catch up after overload', async ({
  page,
  context,
}) => {
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
  await page.addInitScript(() => {
    const heap = () =>
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize ?? null;
    const stats = (window.scriptingLoad = {
      started: performance.now(),
      posted: 0,
      inflight: 0,
      maxInflight: 0,
      completed: 0,
      latencies: [] as number[],
      modes: {} as Record<string, number>,
      frames: [] as number[],
      longTasks: [] as number[],
      heapStart: heap(),
      heapEnd: heap(),
    });
    const NativeWorker = window.Worker;
    class MeasuredWorker extends NativeWorker {
      private times = new Map<number, number>();
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', ({ data }) => {
          const start = this.times.get(data.id);
          if (start === undefined) return;
          this.times.delete(data.id);
          stats.inflight--;
          stats.completed++;
          stats.latencies.push(performance.now() - start);
        });
      }
      override postMessage(
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        if (
          message &&
          typeof message === 'object' &&
          'id' in message &&
          typeof message.id === 'number' &&
          'mode' in message &&
          typeof message.mode === 'string'
        ) {
          this.times.set(message.id, performance.now());
          stats.posted++;
          stats.inflight++;
          stats.maxInflight = Math.max(stats.maxInflight, stats.inflight);
          stats.modes[message.mode] = (stats.modes[message.mode] ?? 0) + 1;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
      override terminate() {
        stats.inflight -= this.times.size;
        this.times.clear();
        super.terminate();
      }
    }
    window.Worker = MeasuredWorker;
    let last = performance.now();
    const frame = (now: number) => {
      stats.frames.push(now - last);
      last = now;
      stats.heapEnd = heap();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
      new PerformanceObserver((list) =>
        stats.longTasks.push(...list.getEntries().map((entry) => entry.duration)),
      ).observe({ type: 'longtask' });
  });
  const project = createStarterProject();
  const sources = Array.from({ length: 12 }, (_, index) => ({
    entityId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    entityType: 'DEVICE' as const,
    key: 'value',
    unit: '%',
    staleAfterMs: 5000,
  }));
  const widgets = sources.map((binding, index) => ({
    ...newWidget('pump', index),
    id: `script-load-${index}`,
    name: `Load ${index}`,
    x: 100 + (index % 4) * 400,
    y: 100 + Math.floor(index / 4) * 240,
    width: 160,
    height: 125,
    binding,
    propertyBindings: {
      text: {
        type: 'expression' as const,
        enabled: true,
        source: null,
        expression: '"Value " + context.value',
      },
    },
    ...(index < 10
      ? {
          behaviorConfig: {
            apiVersion: 1 as const,
            resultMode: 'appearance' as const,
            inputs: { primary: binding, secondary: sources[(index + 1) % 12] },
            outputs: ['color' as const, 'position' as const, 'rotation' as const],
            fallback: 'baseline' as const,
          },
          behavior:
            'if(inputs.primary.quality!=="good" || inputs.secondary.quality!=="good") return {}; return {color:inputs.primary.value>50?"#329c8c":"#da8054",position:{offsetX:inputs.primary.value/5,offsetY:0},rotation:{offsetDegrees:inputs.secondary.value/10}};',
        }
      : { behavior: 'hmi.setColor(Number(context.value)>50?"#123456":"#da8054");' }),
  }));
  project.screens = [
    {
      id: 'scripting-load',
      name: 'Sustained scripting fixture',
      width: 1920,
      height: 1000,
      groups: {},
      widgets,
      connections: [
        {
          id: 'load-route',
          from: { widgetId: widgets[0].id, port: 'outlet' },
          to: { widgetId: widgets[1].id, port: 'inlet' },
          bendPoints: [],
        },
      ],
    },
  ];
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/api/realtime', (route) => {
    socket = route;
    route.onMessage(() => route.send(JSON.stringify({ type: 'connection', state: 'connected' })));
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    (serialized) =>
      localStorage.setItem(
        'twynix.local-project.v1:script-load',
        JSON.stringify({ project: JSON.parse(serialized), dirty: true }),
      ),
    JSON.stringify(project),
  );
  await page.goto('/?workspace=script-load');
  await expect(page.locator('.canvas-widget')).toHaveCount(12);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect.poll(() => !!socket).toBe(true);
  const original = await page.locator('[data-widget-id="script-load-0"]').elementHandle();
  let batches = 0;
  const send = (value: number) =>
    socket!.send(
      JSON.stringify({
        type: 'telemetry',
        values: Object.fromEntries(
          sources.map((source) => [
            bindingKey(source),
            { value, timestamp: Date.now(), quality: 'good' },
          ]),
        ),
      }),
    );
  const start = clock.now();
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      send(batches++ % 100);
      if (clock.now() - start >= 30000) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
  const injectionDurationMs = clock.now() - start;
  const drainStarted = clock.now();
  send(137.5);
  for (const widget of widgets)
    await expect(page.locator(`[data-widget-id="${widget.id}"]`)).toContainText('Value 137.5');
  for (const widget of widgets.slice(0, 10))
    await expect(page.locator(`[data-widget-id="${widget.id}"] .widget-content`)).toHaveAttribute(
      'style',
      /rotate\(13\.75/,
    );
  for (const widget of widgets.slice(10))
    await expect(
      page.locator(`[data-widget-id="${widget.id}"] svg path[fill="#123456"]`).first(),
    ).toBeAttached();
  const catchUpMs = clock.now() - drainStarted;
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  const stats = await page.evaluate(() => window.scriptingLoad);
  expect(stats.maxInflight).toBe(1);
  expect(stats.modes.expression).toBeGreaterThan(100);
  expect(stats.modes.script).toBeGreaterThan(0);
  expect(stats.frames.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  const percentile = (values: number[], fraction: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return Number(
      (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0).toFixed(2),
    );
  };
  mkdirSync('artifacts/benchmarks', { recursive: true });
  writeFileSync(
    'artifacts/benchmarks/scripting-load.json',
    JSON.stringify(
      {
        tags: 12,
        scriptedWidgets: 12,
        appearanceWidgets: 10,
        legacyWidgets: 2,
        propertyExpressions: 12,
        targetHz: 20,
        finalValue: 137.5,
        observedHz: Number(((batches * 1000) / injectionDurationMs).toFixed(2)),
        batches,
        valuesDelivered: (batches + 1) * 12,
        injectionDurationMs: Number(injectionDurationMs.toFixed(2)),
        durationMs: Number((clock.now() - start).toFixed(2)),
        catchUpMs: Number(catchUpMs.toFixed(2)),
        worker: {
          posted: stats.posted,
          completed: stats.completed,
          maxInflight: stats.maxInflight,
          modes: stats.modes,
          p50Ms: percentile(stats.latencies, 0.5),
          p95Ms: percentile(stats.latencies, 0.95),
          maxMs: percentile(stats.latencies, 1),
        },
        mainThread: {
          frameGapP95Ms: percentile(stats.frames, 0.95),
          longTasks: stats.longTasks.length,
          maxLongTaskMs: percentile(stats.longTasks, 1),
        },
        heap: {
          startBytes: stats.heapStart,
          endBytes: stats.heapEnd,
          limitation:
            'Chromium heap observations may be rounded and include caches/uncollected objects; not a memory-leak proof.',
        },
        sampledNodeIdentityPreserved: true,
        sampledNodes: 1,
        pageErrors: errors,
        limitation:
          '30-second synthetic loopback run on this machine. No real ThingsBoard/equipment, production SLA or long-duration soak claimed.',
      },
      null,
      2,
    ) + '\n',
  );
});

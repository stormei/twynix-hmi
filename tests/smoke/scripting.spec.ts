import { test, expect } from '@playwright/test';
import { createStarterProject, newWidget } from '../../packages/model/src';

test('real QuickJS behavior replaces text/color, restores baseline on invalid output, and preserves legacy behavior', async ({
  page,
  context,
}) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && url.port === '4300' ? route.continue() : route.abort();
  });
  const project = createStarterProject();
  const base = newWidget('label', 0);
  project.screens[0].widgets = [
    {
      ...base,
      id: 'versioned',
      x: 100,
      y: 100,
      text: 'Baseline',
      behaviorConfig: {
        apiVersion: 1,
        resultMode: 'appearance',
        inputs: {},
        outputs: ['text', 'color'],
        fallback: 'baseline',
      },
      behavior: 'return {text:"Versioned result", color:"#123456"};',
    },
    {
      ...base,
      id: 'legacy',
      x: 100,
      y: 250,
      text: 'Legacy baseline',
      behaviorConfig: {
        apiVersion: 1,
        inputs: {
          temperature: {
            entityId: '00000000-0000-4000-8000-000000000001',
            entityType: 'DEVICE',
            key: 'temperature',
            unit: '',
            staleAfterMs: 1000,
          },
        },
        outputs: ['text'],
        fallback: 'baseline',
      },
      behavior: 'hmi.setText("Legacy result " + inputs.temperature.quality + " " + Date.now());',
    },
    {
      ...base,
      id: 'invalid',
      x: 100,
      y: 400,
      text: 'Invalid baseline',
      behaviorConfig: {
        apiVersion: 1,
        resultMode: 'appearance',
        inputs: {},
        outputs: ['text', 'color'],
        fallback: 'baseline',
      },
      behavior: 'return {text:"Partial invalid", color:"red"};',
    },
  ];
  project.screens[0].connections = [];
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
  const versioned = page.locator('[data-widget-id="versioned"]');
  await expect(versioned).toContainText('Versioned result');
  await expect(versioned.locator('text').first()).toHaveAttribute('fill', '#123456');
  await expect(page.locator('[data-widget-id="legacy"]')).toContainText(
    'Legacy result disconnected',
  );
  const firstLegacyText = await page.locator('[data-widget-id="legacy"]').textContent();
  await expect
    .poll(() => page.locator('[data-widget-id="legacy"]').textContent())
    .not.toBe(firstLegacyText);
  const invalid = page.locator('[data-widget-id="invalid"]');
  await expect(invalid).toContainText('Invalid baseline');
  await expect(invalid).not.toContainText('Partial invalid');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(versioned).toContainText('Baseline');
});

test('runtime geometry preserves SVG process/signal attachments at multiple zooms and resets in Design', async ({
  page,
  context,
}) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && url.port === '4300' ? route.continue() : route.abort();
  });
  const project = createStarterProject();
  const valve = {
    ...newWidget('valve', 0),
    id: 'moving-valve',
    x: 300,
    y: 300,
    width: 240,
    height: 150,
    propertyBindings: { value: { type: 'constant' as const, enabled: true, value: 30 } },
    behaviorConfig: {
      apiVersion: 1 as const,
      resultMode: 'appearance' as const,
      inputs: {},
      outputs: ['position' as const, 'rotation' as const],
      fallback: 'baseline' as const,
    },
    behavior: 'return {position:{offsetX:80,offsetY:-50},rotation:{offsetDegrees:context.value}};',
  };
  const pump = { ...newWidget('pump', 1), id: 'fixed-pump', x: 900, y: 550 };
  const sensor = { ...newWidget('sensor', 2), id: 'fixed-sensor', x: 850, y: 100 };
  const clock = {
    ...newWidget('label', 3),
    id: 'geometry-clock',
    x: 100,
    y: 650,
    behavior: 'hmi.setText(String(Date.now()));',
  };
  project.screens = [
    {
      id: 'geometry-screen',
      name: 'Geometry',
      width: 1600,
      height: 1000,
      groups: {},
      widgets: [valve, pump, sensor, clock],
      connections: [
        {
          id: 'process-runtime',
          from: { widgetId: valve.id, port: 'outlet' },
          to: { widgetId: pump.id, port: 'inlet' },
          bendPoints: [{ x: 750, y: 500 }],
        },
        {
          id: 'signal-runtime',
          medium: 'electrical',
          from: { widgetId: sensor.id, port: 'signal-out' },
          to: { widgetId: valve.id, port: 'actuator' },
          bendPoints: [],
        },
      ],
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
  const moving = page.locator('[data-widget-id="moving-valve"]');
  await expect(moving.locator('.widget-content')).toHaveCSS('transform', /0.866025/);
  const initialPosition = await moving.evaluate((el) => ({
    left: (el as HTMLElement).style.left,
    top: (el as HTMLElement).style.top,
  }));
  const checkAttachments = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const svg = document.querySelector(
            '[data-widget-id="moving-valve"] svg[twynixSymbol]',
          ) as SVGSVGElement;
          const process = document.querySelector(
            '[data-connection-id="process-runtime"]',
          ) as SVGPathElement;
          const signal = document.querySelector(
            '[data-connection-id="signal-runtime"]',
          ) as SVGPathElement;
          if (!svg || !process || !signal) return 1000;
          const face = new DOMPoint(158, 52).matrixTransform(svg.getScreenCTM()!);
          const actuator = new DOMPoint(80, 8).matrixTransform(svg.getScreenCTM()!);
          const start = process.getPointAtLength(0).matrixTransform(process.getScreenCTM()!);
          const end = signal
            .getPointAtLength(signal.getTotalLength())
            .matrixTransform(signal.getScreenCTM()!);
          return Math.max(
            Math.hypot(face.x - start.x, face.y - start.y),
            Math.hypot(actuator.x - end.x, actuator.y - end.y),
          );
        }),
      )
      .toBeLessThan(0.75);
  };
  await checkAttachments();
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
  await checkAttachments();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await checkAttachments();
  await page.screenshot({ path: 'artifacts/verification/runtime-geometry.png' });
  const clockElement = page.locator('[data-widget-id="geometry-clock"]');
  const clockText = await clockElement.textContent();
  await expect.poll(() => clockElement.textContent()).not.toBe(clockText);
  expect(
    await moving.evaluate((el) => ({
      left: (el as HTMLElement).style.left,
      top: (el as HTMLElement).style.top,
    })),
  ).toEqual(initialPosition);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(moving).toHaveCSS('left', '300px');
  await expect(moving).toHaveCSS('top', '300px');
  await expect(moving.locator('.widget-content')).toHaveCSS('transform', /matrix\(1, 0, 0, 1,/);
  await checkAttachments();
  const recovery = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('twynix.local-project.v1:smoke')!),
  );
  expect(recovery.project.screens[0].widgets[0].x).toBe(300);
  expect(recovery.project.screens[0].widgets[0].rotation).toBe(0);
});

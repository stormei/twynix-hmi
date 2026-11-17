import { test, expect, type WebSocketRoute } from '@playwright/test';
import { bindingKey, createStarterProject, newWidget } from '../../packages/model/src';

test('behavior editor shows changing ThingsBoard subscriptions, isolates simulation, and applies versioned templates compatibly', async ({
  page,
  context,
}) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && url.port === '4300' ? route.continue() : route.abort();
  });
  const entityId = '10000000-0000-4000-8000-000000000001';
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: { id: '20000000-0000-4000-8000-000000000001' },
          tenantId: { id: '30000000-0000-4000-8000-000000000001' },
          authority: 'TENANT_ADMIN',
          email: 'fixture@example.invalid',
        },
        csrf: 'fake-only',
        commandsEnabled: false,
      },
    }),
  );
  await page.route('**/api/entities?*', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            entityId: { id: entityId },
            latest: { ENTITY_FIELD: { name: { value: 'Fixture pump' } } },
          },
        ],
        hasNext: false,
      },
    }),
  );
  await page.route('**/api/entities/*/*/catalog', (route) =>
    route.fulfill({
      json: {
        telemetry: [
          { key: 'pressure', value: 999, timestamp: Date.now() },
          { key: 'temperature', value: 888, timestamp: Date.now() },
        ],
        attributes: [],
      },
    }),
  );
  let draftSocket: WebSocketRoute | undefined,
    draftCloses = 0,
    pressure = 4.2;
  const sends: {
    alarms: boolean;
    bindings: { entityId: string; entityType: 'DEVICE'; dataType?: 'TIME_SERIES'; key: string }[];
  }[] = [];
  const updates = (bindings: (typeof sends)[number]['bindings']) =>
    Object.fromEntries(
      bindings.map((binding) => [
        bindingKey(binding as Parameters<typeof bindingKey>[0]),
        {
          value: binding.key === 'pressure' ? String(pressure) : 20,
          timestamp: Date.now(),
          quality: 'good',
        },
      ]),
    );
  await page.routeWebSocket('**/api/realtime', (socket) => {
    let isDraft = false;
    socket.onMessage((data) => {
      const request = JSON.parse(String(data)) as (typeof sends)[number];
      sends.push(request);
      isDraft = !request.alarms;
      if (isDraft) draftSocket = socket;
      socket.send(JSON.stringify({ type: 'connection', state: 'connected' }));
      socket.send(JSON.stringify({ type: 'telemetry', values: updates(request.bindings) }));
    });
    socket.onClose(() => {
      if (isDraft) draftCloses++;
    });
  });
  const commandRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/commands|\/rpc/.test(request.url())) commandRequests.push(request.url());
  });
  const project = createStarterProject();
  project.screens[0].connections = [];
  project.screens[0].widgets = [
    {
      ...newWidget('label', 0),
      id: 'authoring-widget',
      x: 200,
      y: 150,
      text: 'Saved baseline',
      behavior: 'hmi.setText("Legacy source");',
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
  await page.locator('[data-widget-id="authoring-widget"]').click();
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  await page.getByRole('button', { name: 'Open behavior editor', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Widget behavior editor', exact: true });
  await expect(dialog.getByRole('combobox', { name: 'Behavior API', exact: true })).toHaveValue(
    'effects',
  );
  await expect(
    dialog.getByRole('textbox', { name: 'Behavior JavaScript source', exact: true }),
  ).toHaveValue('hmi.setText("Legacy source");');
  await dialog
    .getByRole('textbox', { name: 'Behavior JavaScript source', exact: true })
    .fill('hmi.set');
  await expect(dialog.getByRole('listbox', { name: 'JavaScript completions' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(
    dialog.getByRole('textbox', { name: 'Behavior JavaScript source', exact: true }),
  ).toHaveValue('hmi.setText(context.value);');
  const addPressure = async () => {
    await dialog.getByRole('textbox', { name: 'Input alias', exact: true }).fill('pressure');
    await dialog.getByRole('button', { name: 'Search sources', exact: true }).click();
    await dialog.getByRole('button', { name: '▸ Fixture pump', exact: true }).click();
    await dialog.getByRole('button', { name: 'pressure 999', exact: true }).click();
    await dialog.getByRole('button', { name: 'Use selected source', exact: true }).click();
    await expect(dialog.locator('[data-live-alias="pressure"]')).toContainText('4.2');
    await expect(dialog.locator('[data-live-alias="pressure"]')).toContainText('good');
    await expect(dialog.locator('[data-live-alias="pressure"]')).not.toContainText('999');
  };
  await addPressure();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => draftCloses).toBeGreaterThan(0);
  await expect(page.getByRole('textbox', { name: 'JavaScript source', exact: true })).toHaveValue(
    'hmi.setText("Legacy source");',
  );
  await page.getByRole('button', { name: 'Open behavior editor', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Widget behavior editor', exact: true });
  await expect(dialog.getByRole('table', { name: 'Live telemetry inputs' })).toContainText(
    'No telemetry inputs configured',
  );
  await addPressure();
  await dialog.getByRole('textbox', { name: 'Input alias', exact: true }).fill('temperature');
  await dialog.getByRole('button', { name: 'temperature 888', exact: true }).click();
  await dialog.getByRole('button', { name: 'Use selected source', exact: true }).click();
  await expect(dialog.locator('[data-live-alias="temperature"]')).toContainText('20');
  pressure = 5.7;
  await expect
    .poll(() => sends.filter((send) => !send.alarms && send.bindings.length === 2).length)
    .toBeGreaterThan(0);
  draftSocket!.send(
    JSON.stringify({
      type: 'telemetry',
      values: updates(sends.filter((send) => !send.alarms).at(-1)!.bindings),
    }),
  );
  await expect(dialog.locator('[data-live-alias="pressure"]')).toContainText('5.7');
  await dialog.getByText('Reusable templates', { exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Behavior template', exact: true })
    .selectOption('formatted-text');
  await dialog
    .getByRole('combobox', { name: 'Template input value', exact: true })
    .selectOption('pressure');
  await dialog.getByRole('textbox', { name: 'Suffix', exact: true }).fill(' bar');
  await dialog.getByRole('spinbutton', { name: 'Decimal places (0–6)', exact: true }).fill('2');
  await dialog
    .getByRole('button', { name: 'Insert template · replace draft source', exact: true })
    .click();
  await expect(dialog.getByRole('combobox', { name: 'Behavior API', exact: true })).toHaveValue(
    'appearance',
  );
  await dialog.getByRole('button', { name: 'Test behavior', exact: true }).click();
  await expect(dialog.getByLabel('Behavior test result', { exact: true })).toContainText(
    '5.70 bar',
  );
  draftSocket!.send(JSON.stringify({ type: 'connection', state: 'disconnected' }));
  await expect(dialog.locator('[data-live-alias="pressure"]')).toContainText('disconnected');
  await dialog.getByRole('button', { name: 'Test behavior', exact: true }).click();
  await expect(dialog.getByLabel('Behavior test result', { exact: true })).toContainText(
    'Unavailable',
  );
  draftSocket!.send(JSON.stringify({ type: 'connection', state: 'connected' }));
  draftSocket!.send(
    JSON.stringify({
      type: 'telemetry',
      values: updates(sends.filter((send) => !send.alarms).at(-1)!.bindings),
    }),
  );
  await expect(dialog.locator('[data-live-alias="pressure"]')).toContainText('good');
  await dialog.getByRole('button', { name: 'Test behavior', exact: true }).click();
  await expect(dialog.getByLabel('Behavior test result', { exact: true })).toContainText(
    '5.70 bar',
  );
  await page.screenshot({ path: 'artifacts/verification/behavior-live-editor.png' });
  await dialog
    .getByRole('combobox', { name: 'Test input mode', exact: true })
    .selectOption('simulation');
  await dialog.getByRole('textbox', { name: 'Sample value pressure', exact: true }).fill('123.4');
  await dialog
    .getByRole('combobox', { name: 'Sample quality pressure', exact: true })
    .selectOption('good');
  await dialog.getByRole('button', { name: 'Test behavior', exact: true }).click();
  await expect(dialog.getByLabel('Behavior test result', { exact: true })).toContainText(
    '123.40 bar',
  );
  await expect(dialog.locator('[data-live-alias="pressure"]')).toContainText('5.7');
  await dialog
    .getByRole('textbox', { name: 'Behavior JavaScript source', exact: true })
    .fill('return {text: ;');
  await dialog.getByRole('button', { name: 'Test behavior', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(/expect|syntax|token/i);
  await dialog
    .getByRole('button', { name: 'Insert template · replace draft source', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Apply behavior', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('[data-widget-id="authoring-widget"]')).toContainText('5.70 bar');
  await expect
    .poll(() => sends.some((send) => send.alarms && send.bindings.length === 2))
    .toBe(true);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'JavaScript source', exact: true })).toHaveValue(
    'hmi.setText("Legacy source");',
  );
  expect(commandRequests).toEqual([]);
});

test('signed-out live tests never use demo values and valid prototype-named aliases simulate correctly', async ({
  page,
  context,
}) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && url.port === '4300' ? route.continue() : route.abort();
  });
  const project = createStarterProject();
  project.screens[0].connections = [];
  project.screens[0].widgets = [
    {
      ...newWidget('label', 0),
      id: 'offline-authoring',
      x: 100,
      y: 100,
      demoValue: 9876,
      behavior: 'hmi.setText(String(context.value) + "/" + context.quality);',
      behaviorConfig: {
        apiVersion: 1,
        inputs: {
          toString: {
            entityType: 'DEVICE' as const,
            entityId: '10000000-0000-4000-8000-000000000001',
            key: 'level',
            unit: '',
            staleAfterMs: 30000,
          },
        },
        outputs: ['text'],
        fallback: 'baseline',
      },
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
  await page.locator('[data-widget-id="offline-authoring"]').click();
  await page.getByRole('button', { name: 'Script', exact: true }).click();
  await page.getByRole('button', { name: 'Open behavior editor', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Widget behavior editor', exact: true });
  await expect(dialog.locator('[data-live-alias="toString"]')).toContainText('disconnected');
  await dialog.getByRole('button', { name: 'Test behavior', exact: true }).click();
  await expect(dialog.getByLabel('Behavior test result', { exact: true })).toContainText(
    'null/unknown',
  );
  await expect(dialog.getByLabel('Behavior test result', { exact: true })).not.toContainText(
    '9876',
  );
  await dialog
    .getByRole('combobox', { name: 'Test input mode', exact: true })
    .selectOption('simulation');
  await dialog
    .getByRole('textbox', { name: 'Behavior JavaScript source', exact: true })
    .fill('hmi.setText(String(inputs.toString.value));');
  await dialog.getByRole('button', { name: 'Test behavior', exact: true }).click();
  await expect(dialog.getByLabel('Behavior test result', { exact: true })).toContainText('null');
  await dialog.getByRole('textbox', { name: 'Sample value toString', exact: true }).fill('7');
  await dialog
    .getByRole('combobox', { name: 'Sample quality toString', exact: true })
    .selectOption('good');
  await dialog.getByRole('button', { name: 'Test behavior', exact: true }).click();
  await expect(dialog.getByLabel('Behavior test result', { exact: true })).toContainText('"7"');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
});

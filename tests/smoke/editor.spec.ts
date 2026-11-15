import { test, expect, type Page } from '@playwright/test';
import {
  createStarterProject,
  createDashboardWidgets,
  newWidget,
  type Project,
} from '../../packages/model/src';

declare global {
  interface Window {
    commandScriptFixture?: { pending: () => number; release: () => void };
  }
}

async function seed(page: Page, project: Project) {
  await page.addInitScript((serialized) => {
    localStorage.setItem(
      'twynix.local-project.v1:smoke',
      JSON.stringify({ project: JSON.parse(serialized), dirty: true }),
    );
  }, JSON.stringify(project));
  await page.goto('/?workspace=smoke');
}
async function fit(page: Page) {
  const close = page.getByRole('button', { name: 'Close inspector', exact: true });
  if (await close.isVisible()) await close.click();
  await page.getByRole('button', { name: 'Fit screen', exact: true }).click();
}

test.beforeEach(async ({ context }) => {
  // No browser request can reach a non-loopback site, including embedded content.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && url.port === '4300' ? route.continue() : route.abort();
  });
});

test('symbol search and explicit category choices survive tabs and a refresh', async ({ page }) => {
  await page.goto('/?workspace=smoke');
  await page.getByRole('button', { name: 'Symbols', exact: true }).click();
  await page.getByRole('button', { name: 'Dashboard widgets 7', exact: true }).click();
  await page.getByRole('button', { name: 'Process equipment 6', exact: true }).click();
  await page.getByRole('button', { name: 'Pipes & connections 4', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Search symbol library', exact: true });
  await search.fill('pressure');
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.getByRole('button', { name: 'Faceplates', exact: true }).click();
  await page.getByRole('button', { name: 'Symbols', exact: true }).click();
  await expect(search).toHaveValue('pressure');
  await page.reload();
  await expect(search).toHaveValue('pressure');
  await page.getByRole('button', { name: 'Clear symbol search', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Process equipment 6', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('button', { name: 'Pipes & connections 4', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('button', { name: 'Dashboard widgets 7', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
});

test('drag ghost, zoom, resize and undo preserve target-pixel geometry', async ({ page }) => {
  const project = createStarterProject();
  project.screens = [
    {
      id: 'smoke',
      name: 'Smoke',
      width: 1280,
      height: 800,
      groups: {},
      connections: [],
      widgets: [
        {
          ...newWidget('value', 0),
          id: 'smoke-value',
          name: 'Smoke value',
          x: 200,
          y: 200,
          width: 200,
          height: 100,
        },
      ],
    },
  ];
  await seed(page, project);
  await fit(page);
  const widget = page.locator('[data-widget-id="smoke-value"]');
  await widget.hover();
  const original = await widget.boundingBox();
  expect(original).not.toBeNull();
  await page.locator('button[aria-label="Snap to grid"]').click();
  await widget.hover();
  await page.mouse.move(original!.x + 60, original!.y + 35);
  await page.mouse.down();
  await page.mouse.move(original!.x + 100, original!.y + 65, { steps: 8 });
  await expect(page.locator('.drag-ghost')).toHaveCount(1);
  await expect(widget).toHaveCSS('left', '200px');
  await page.mouse.up();
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await expect(widget).not.toHaveCSS('left', '200px');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(widget).toHaveCSS('left', '200px');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(widget).not.toHaveCSS('left', '200px');
  const handle = page.locator('.selection-handle.handle-se');
  const corner = await handle.boundingBox();
  expect(corner).not.toBeNull();
  await page.mouse.move(corner!.x + corner!.width / 2, corner!.y + corner!.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner!.x + 40, corner!.y + 25, { steps: 6 });
  await page.mouse.up();
  await expect(widget).not.toHaveCSS('width', '200px');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(widget).toHaveCSS('width', '200px');
  const beforeZoom = await widget.boundingBox();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect
    .poll(async () => (await widget.boundingBox())!.width)
    .toBeGreaterThan(beforeZoom!.width);
  await expect(widget).toHaveCSS('width', '200px');
});

test('dashboard settings persist independently and HTML stays sandboxed in Preview', async ({
  page,
}) => {
  const project = createStarterProject();
  const widgets = createDashboardWidgets().map((widget) => ({
    ...widget,
    id: `smoke-${widget.kind}`,
  }));
  project.screens = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      width: 1280,
      height: 800,
      groups: {},
      connections: [],
      widgets,
    },
  ];
  await seed(page, project);
  await fit(page);
  await page.locator('[data-widget-id="smoke-chart"]').click({ position: { x: 25, y: 20 } });
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await page.getByRole('combobox', { name: 'Chart style', exact: true }).selectOption('bar');
  await expect.poll(() => page.locator('tx-chart-widget svg rect').count()).toBeGreaterThan(0);
  await fit(page);
  await page.locator('[data-widget-id="smoke-gauge"]').click({ position: { x: 25, y: 20 } });
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Warning threshold', exact: true }).fill('40');
  await expect(page.locator('tx-gauge-widget footer')).toContainText('Warning range');
  await fit(page);
  await page.locator('[data-widget-id="smoke-markdown"]').click({ position: { x: 25, y: 20 } });
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Markdown content', exact: true })
    .fill('## Verified notes\n\n- Review alarms');
  await expect(page.locator('tx-markdown-widget')).toContainText('Verified notes');
  await fit(page);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('tx-html-widget iframe')).toHaveAttribute('sandbox', '');
  await expect(page.locator('tx-html-widget iframe')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('tx-html-widget iframe')).toHaveAttribute(
    'srcdoc',
    /Content-Security-Policy/,
  );
  await page.screenshot({ path: test.info().outputPath('dashboard-preview.png'), fullPage: false });
});

test('deferred setup dialogs and inspector controls keep their edit and cancel behavior', async ({
  page,
}) => {
  const project = createStarterProject();
  project.screens = [
    {
      id: 'setup',
      name: 'Setup smoke',
      width: 1280,
      height: 800,
      groups: {},
      connections: [],
      widgets: [
        {
          ...newWidget('value', 0),
          id: 'setup-value',
          name: 'Setup value',
          x: 200,
          y: 200,
          width: 200,
          height: 100,
        },
        {
          ...newWidget('tank', 1),
          id: 'setup-tank',
          name: 'Setup tank',
          x: 650,
          y: 200,
          width: 160,
          height: 220,
        },
      ],
    },
  ];
  await seed(page, project);
  await page.getByRole('button', { name: 'Add screen', exact: true }).click();
  const screenDialog = page.getByRole('dialog', { name: 'New screen', exact: true });
  await expect(screenDialog).toBeVisible();
  await screenDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(screenDialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Add screen', exact: true }).click();
  await expect(screenDialog).toBeVisible();
  await screenDialog.getByLabel('Screen name', { exact: true }).fill('Deferred screen');
  await screenDialog.getByRole('button', { name: 'Create screen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deferred screen 0', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Setup smoke 2', exact: true }).click();
  await page.getByRole('treeitem').filter({ hasText: 'Setup value' }).click();
  await page.getByRole('button', { name: 'Configure value binding', exact: true }).click();
  const binding = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: 'Value binding', exact: true }) });
  await expect(binding).toBeVisible();
  await binding.getByRole('button', { name: 'Constant', exact: true }).click();
  await binding.getByLabel('Fixed value', { exact: true }).fill('73');
  await binding.getByRole('button', { name: 'Apply binding', exact: true }).click();
  await expect(page.locator('[data-widget-id="setup-value"]')).toContainText('73');
  await page.getByRole('button', { name: 'Configure value binding', exact: true }).click();
  await expect(binding.getByLabel('Fixed value', { exact: true })).toHaveValue('73');
  await binding.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('tx-operating-range summary').click();
  await page.getByRole('spinbutton', { name: 'Range scale maximum', exact: true }).fill('120');
  await page.getByRole('button', { name: 'Apply range', exact: true }).click();
  await page.getByRole('treeitem').filter({ hasText: 'Setup tank' }).click();
  await page.getByRole('treeitem').filter({ hasText: 'Setup value' }).click();
  await page.locator('tx-operating-range summary').click();
  await expect(
    page.getByRole('spinbutton', { name: 'Range scale maximum', exact: true }),
  ).toHaveValue('120');
  await page.getByRole('treeitem').filter({ hasText: 'Setup tank' }).click();
  await page.getByRole('button', { name: 'Create reusable faceplate', exact: true }).click();
  const faceplate = page.getByRole('dialog', { name: 'Create faceplate type', exact: true });
  await expect(faceplate).toBeVisible();
  await faceplate.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Create reusable faceplate', exact: true }).click();
  await expect(faceplate).toBeVisible();
  await faceplate.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page
    .getByRole('treeitem')
    .filter({ hasText: 'Setup value' })
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('tx-multi-inspector')).toContainText('2');
});

test('rotation, layer ordering and new controls work in an isolated draft', async ({ page }) => {
  const project = createStarterProject();
  const kinds = [
    'dropdown',
    'slider',
    'radio',
    'toggle',
    'segmented',
    'sparkline',
    'linear-gauge',
  ] as const;
  const widgets = kinds.map((kind, index) => ({
    ...newWidget(kind, index),
    id: `control-${kind}`,
    onClick: kind === 'toggle' ? 'hmi.notify("Requested " + context.value);' : '',
    name: `Test ${kind}`,
    text: `Test ${kind}`,
    x: 80 + (index % 3) * 360,
    y: 80 + Math.floor(index / 3) * 180,
  }));
  project.screens = [
    {
      id: 'controls',
      name: 'Controls',
      width: 1280,
      height: 800,
      widgets,
      connections: [],
      groups: {},
    },
  ];
  await seed(page, project);
  await fit(page);
  const dropdown = page.locator('[data-widget-id="control-dropdown"]');
  await dropdown.click({ position: { x: 20, y: 15 } });
  await page.getByRole('button', { name: 'Rotate clockwise', exact: true }).click();
  await expect(dropdown.locator('.widget-content')).toHaveCSS(
    'transform',
    /matrix\(0.996195, 0.0871557, -0.0871557, 0.996195,/,
  );
  await page.getByRole('button', { name: 'Bring to front', exact: true }).click();
  await expect(page.locator('.canvas-widget').last()).toHaveAttribute(
    'data-widget-id',
    'control-dropdown',
  );
  await page.getByRole('button', { name: 'Bring to back', exact: true }).click();
  await expect(page.locator('.canvas-widget').first()).toHaveAttribute(
    'data-widget-id',
    'control-dropdown',
  );
  await page.getByRole('button', { name: 'Rotate counterclockwise', exact: true }).click();
  await expect(dropdown).toHaveCSS('width', '300px');
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Options (value = Label)', exact: true })
    .fill('0 = Manual\n1 = Automatic\n2 = Off');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = localStorage.getItem('twynix.local-project.v1:smoke');
        return saved
          ? JSON.parse(saved).project.screens[0].widgets[0].dashboard.options[1].label
          : '';
      }),
    )
    .toBe('Automatic');
  await fit(page);
  const toolbar = page.getByRole('toolbar', { name: 'Drawing tools' });
  expect(await toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Test dropdown', exact: true })).toHaveValue('0');
  await page.getByRole('combobox', { name: 'Test dropdown', exact: true }).selectOption('1');
  await expect(page.getByRole('combobox', { name: 'Test dropdown', exact: true })).toHaveValue('1');
  const slider = page.getByRole('slider', { name: 'Test slider', exact: true });
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('1');
  await page
    .locator('tx-radio-widget')
    .getByRole('radio', { name: 'Automatic', exact: true })
    .check();
  await expect(
    page.locator('tx-radio-widget').getByRole('radio', { name: 'Automatic', exact: true }),
  ).toBeChecked();
  await page.getByRole('switch', { name: 'Test toggle', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Test toggle', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page
    .locator('tx-segmented-widget')
    .getByRole('radio', { name: 'Automatic', exact: true })
    .click();
  await expect(
    page.locator('tx-segmented-widget').getByRole('radio', { name: 'Automatic', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.toast')).toContainText('Requested true');
  await expect(page.locator('tx-sparkline-widget polyline')).toBeVisible();
  await expect(page.locator('tx-linear-gauge-widget')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('controls-preview.png') });
});

test('reusable grouped components expose independent inputs and persist after reopening', async ({
  page,
}) => {
  const project = createStarterProject();
  const pump = {
    ...newWidget('pump', 0),
    id: 'panel-pump',
    name: 'Pump symbol',
    x: 100,
    y: 100,
    groupId: 'panel',
  };
  const display = {
    ...newWidget('value', 1),
    id: 'panel-readout',
    name: 'Pressure readout',
    x: 300,
    y: 100,
    groupId: 'panel',
  };
  project.screens = [
    {
      id: 'components',
      name: 'Components',
      width: 1280,
      height: 800,
      widgets: [pump, display],
      groups: { panel: 'Pump panel' },
      connections: [],
    },
  ];
  await seed(page, project);
  await fit(page);
  await page.locator('[data-widget-id="panel-pump"]').click();
  await page.getByRole('button', { name: 'Faceplates', exact: true }).click();
  await page.getByRole('button', { name: 'Create component from selection', exact: true }).click();
  const typeDialog = page.getByRole('dialog', { name: 'Reusable component type', exact: true });
  await typeDialog.getByLabel('Component name', { exact: true }).fill('Pump panel');
  const readout = typeDialog.locator('details').filter({ hasText: 'Pressure readout' });
  await readout.locator('summary').click();
  await readout.getByRole('checkbox', { name: 'value', exact: true }).check();
  await typeDialog
    .getByRole('textbox', { name: 'Pressure readout value input name', exact: true })
    .fill('pressure');
  await typeDialog
    .getByRole('spinbutton', { name: 'Pressure readout value default', exact: true })
    .fill('51');
  await typeDialog.getByRole('button', { name: 'Publish component', exact: true }).click();
  const card = page
    .locator('tx-component-library .faceplate-card')
    .filter({ hasText: 'Pump panel' });
  await card.getByRole('button', { name: 'Add', exact: true }).click();
  const inputs = page.getByRole('dialog', { name: 'Component instance inputs', exact: true });
  await expect(inputs.getByRole('spinbutton', { name: 'pressure', exact: true })).toHaveValue('51');
  await inputs.getByRole('spinbutton', { name: 'pressure', exact: true }).fill('57');
  await inputs.getByRole('button', { name: 'Add component', exact: true }).click();
  await expect(page.locator('.canvas-widget')).toHaveCount(4);
  await page.getByRole('button', { name: 'Configure selected instance', exact: true }).click();
  await expect(inputs.getByRole('spinbutton', { name: 'pressure', exact: true })).toHaveValue('57');
  await inputs.getByRole('spinbutton', { name: 'pressure', exact: true }).fill('63');
  await inputs.getByRole('button', { name: 'Apply inputs', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('twynix.local-project.v1:smoke')!);
        return saved.project.screens[0].widgets
          .filter(
            (widget: { component: { values: { pressure: number } } | null }) => widget.component,
          )
          .map(
            (widget: { component: { values: { pressure: number } } }) =>
              widget.component.values.pressure,
          );
      }),
    )
    .toEqual([63, 63]);
  await card.getByRole('button', { name: 'New version from selection', exact: true }).click();
  await typeDialog.getByRole('button', { name: 'Publish component', exact: true }).click();
  await page.getByRole('button', { name: 'Configure selected instance', exact: true }).click();
  await inputs.getByRole('button', { name: 'Upgrade to v2', exact: true }).click();
  await expect(inputs.getByRole('spinbutton', { name: 'pressure', exact: true })).toHaveValue('63');
  await inputs.getByRole('button', { name: 'Apply inputs', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('twynix.local-project.v1:smoke')!)
          .project.screens[0].widgets.filter((widget: { component: unknown }) => widget.component)
          .map((widget: { component: { version: number } }) => widget.component.version),
      ),
    )
    .toEqual([2, 2]);
  // A fresh page has no seeding script and uses the saved recovery in this context.
  const reopened = await page.context().newPage();
  await reopened.goto('/?workspace=smoke');
  await expect(reopened.locator('.canvas-widget')).toHaveCount(4);
  await reopened.getByRole('button', { name: 'Faceplates', exact: true }).click();
  await expect(reopened.locator('tx-component-library')).toContainText('Pump panel');
  await page.screenshot({ path: test.info().outputPath('reusable-components.png') });
});

test('binding browser searches devices and assets and applies an attribute without modifying on cancel', async ({
  page,
}) => {
  const entityId = '10000000-0000-4000-8000-000000000001';
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: { id: '20000000-0000-4000-8000-000000000001' },
          tenantId: { id: '30000000-0000-4000-8000-000000000001' },
          authority: 'TENANT_ADMIN',
        },
        csrf: 'fake-only',
        commandsEnabled: false,
      },
    }),
  );
  await page.routeWebSocket('**/api/realtime', (socket) => {
    socket.onMessage(() => socket.send(JSON.stringify({ type: 'connection', state: 'connected' })));
  });
  await page.route('**/api/entities?*', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            entityId: { id: entityId },
            latest: {
              ENTITY_FIELD: {
                name: {
                  value:
                    new URL(route.request().url()).searchParams.get('type') === 'ASSET'
                      ? 'Tank asset'
                      : 'Pump device',
                },
              },
            },
          },
        ],
        hasNext: false,
      },
    }),
  );
  await page.route('**/api/entities/*/*/keys', (route) => route.fulfill({ json: ['pressure'] }));
  await page.route('**/api/entities/*/*/catalog', (route) =>
    route.fulfill({
      json: {
        telemetry: [{ key: 'pressure', value: '4.2', timestamp: Date.now() }],
        attributes: [{ key: 'description', value: 'Feed pump', timestamp: Date.now() }],
      },
    }),
  );
  const project = createStarterProject();
  project.screens[0].connections = [];
  project.screens[0].widgets = [
    { ...newWidget('value', 0), id: 'binding-readout', name: 'Readout', x: 100, y: 100 },
  ];
  await seed(page, project);
  await fit(page);
  await page.locator('[data-widget-id="binding-readout"]').click();
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await page.getByRole('button', { name: 'Configure display text binding', exact: true }).click();
  const dialog = page.locator('dialog.binding-dialog');
  await dialog.getByRole('button', { name: 'Data source', exact: true }).click();
  await dialog.getByRole('button', { name: 'Search sources', exact: true }).click();
  await dialog.getByRole('button', { name: '▸ Pump device', exact: true }).click();
  await dialog.getByRole('button', { name: 'pressure 4.2', exact: true }).click();
  await expect(dialog.locator('.source-sample')).toContainText('available');
  await dialog
    .getByRole('combobox', { name: 'Browse entity type', exact: true })
    .selectOption('ASSET');
  await dialog.getByRole('button', { name: '▸ Tank asset', exact: true }).click();
  await dialog.getByRole('button', { name: 'description Feed pump', exact: true }).click();
  await dialog.getByRole('button', { name: 'Use selected source', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Source kind', exact: true })).toHaveValue(
    'ATTRIBUTE',
  );
  await page.screenshot({ path: test.info().outputPath('binding-browser.png') });
  await dialog.getByRole('button', { name: 'Apply binding', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('twynix.local-project.v1:smoke')!).project.screens[0]
            .widgets[0].propertyBindings.text.source.dataType,
      ),
    )
    .toBe('ATTRIBUTE');
  await page.getByRole('button', { name: 'Configure display text binding', exact: true }).click();
  await dialog
    .getByRole('combobox', { name: 'Source kind', exact: true })
    .selectOption('TIME_SERIES');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Configure display text binding', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Source kind', exact: true })).toHaveValue(
    'ATTRIBUTE',
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Faceplates', exact: true }).click();
  await page.getByRole('button', { name: 'Create component from selection', exact: true }).click();
  const typeDialog = page.getByRole('dialog', { name: 'Reusable component type', exact: true });
  await typeDialog.getByLabel('Component name', { exact: true }).fill('Bound readout');
  await typeDialog.getByRole('button', { name: 'Publish component', exact: true }).click();
  await page
    .locator('tx-component-library .faceplate-card')
    .filter({ hasText: 'Bound readout' })
    .getByRole('button', { name: 'Add', exact: true })
    .click();
  const inputs = page.getByRole('dialog', { name: 'Component instance inputs', exact: true });
  await inputs
    .getByRole('combobox', { name: 'Browse entity type', exact: true })
    .selectOption('ASSET');
  await inputs.getByRole('button', { name: '▸ Tank asset', exact: true }).click();
  await expect(
    inputs.getByRole('textbox', { name: 'Component equipment entity ID', exact: true }),
  ).toHaveValue(entityId);
  await inputs.getByRole('button', { name: 'Add component', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem('twynix.local-project.v1:smoke')!,
          ).project.screens[0].widgets.find((widget: { component: unknown }) => widget.component)
            ?.propertyBindings.text.source.entityType,
      ),
    )
    .toBe('ASSET');
});

test('rotation handle snaps to five degrees with oriented bounds, local resizing and undo', async ({
  page,
}) => {
  const project = createStarterProject();
  const valve = {
    ...newWidget('valve', 0),
    id: 'handle-valve',
    name: 'Handle valve',
    x: 400,
    y: 300,
    width: 160,
    height: 100,
  };
  const pipe = {
    ...newWidget('pipe', 1),
    id: 'handle-pipe',
    x: 850,
    y: 300,
    width: 240,
    height: 100,
  };
  project.screens = [
    {
      id: 'rotation-handles',
      name: 'Rotation handles',
      width: 1280,
      height: 800,
      widgets: [valve, pipe],
      groups: {},
      connections: [
        {
          id: 'attached',
          from: { widgetId: valve.id, port: 'outlet' },
          to: { widgetId: pipe.id, port: 'inlet' },
        },
      ],
    },
  ];
  await seed(page, project);
  await fit(page);
  const widget = page.locator('[data-widget-id="handle-valve"]');
  await widget.click();
  const handle = page.getByRole('button', { name: 'Rotate selection', exact: true });
  const angle = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('twynix.local-project.v1:smoke')!).project.screens[0]
          .widgets[0].rotation,
    );
  async function drag(degrees: number) {
    const expected = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('twynix.local-project.v1:smoke')!).project.screens[0]
          .widgets[0],
    );
    await expect
      .poll(() =>
        widget.evaluate((el, expected) => {
          const style = getComputedStyle(el),
            content = getComputedStyle(el.querySelector('.widget-content')!),
            matrix = new DOMMatrix(content.transform);
          return (
            Math.abs(parseFloat(style.width) - expected.width) < 0.05 &&
            Math.abs(parseFloat(style.height) - expected.height) < 0.05 &&
            Math.abs(parseFloat(style.left) - expected.x) < 0.05 &&
            Math.abs(parseFloat(style.top) - expected.y) < 0.05 &&
            Math.abs(matrix.a - Math.cos((expected.rotation * Math.PI) / 180)) < 0.00001
          );
        }, expected),
      )
      .toBe(true);
    // Undo/redo restores the document before the child handle's next paint.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const box = (await widget.boundingBox())!,
      button = (await handle.boundingBox())!;
    const cx = box.x + box.width / 2,
      cy = box.y + box.height / 2;
    const x = button.x + button.width / 2,
      y = button.y + button.height / 2;
    const dx = x - cx,
      dy = y - cy,
      radians = (degrees * Math.PI) / 180;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(
      cx + dx * Math.cos(radians) - dy * Math.sin(radians),
      cy + dx * Math.sin(radians) + dy * Math.cos(radians),
      { steps: 12 },
    );
  }
  await drag(37);
  await expect(page.locator('tx-rotation-handle [role="status"]')).toContainText('°');
  expect(await angle()).toBe(0);
  await page.mouse.up();
  await expect.poll(angle).toBe(35);
  await expect(widget).toHaveCSS('outline-style', 'none');
  await expect(page.locator('.selection-outline')).toHaveCSS(
    'transform',
    /matrix\(0.819152, 0.573576, -0.573576, 0.819152,/,
  );
  const selectedBox = (await widget.boundingBox())!,
    corner = (await page
      .getByRole('button', { name: 'Resize selection nw', exact: true })
      .boundingBox())!;
  const scale = await page
    .locator('.screen-canvas')
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  const radians = (35 * Math.PI) / 180;
  const border = await page
    .locator('.selection-outline')
    .evaluate((el) => parseFloat(getComputedStyle(el).borderLeftWidth));
  expect(corner.x + corner.width / 2).toBeCloseTo(
    selectedBox.x +
      selectedBox.width / 2 +
      ((-80 + border) * Math.cos(radians) - (-50 + border) * Math.sin(radians)) * scale,
    0,
  );
  expect(corner.y + corner.height / 2).toBeCloseTo(
    selectedBox.y +
      selectedBox.height / 2 +
      ((-80 + border) * Math.sin(radians) + (-50 + border) * Math.cos(radians)) * scale,
    0,
  );

  await page.getByRole('button', { name: 'Snap to grid', exact: true }).click();
  const se = (await page
    .getByRole('button', { name: 'Resize selection se', exact: true })
    .boundingBox())!;
  const fixedBefore = (await page
    .getByRole('button', { name: 'Resize selection nw', exact: true })
    .boundingBox())!;
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    se.x + se.width / 2 + (40 * Math.cos(radians) - 20 * Math.sin(radians)) * scale,
    se.y + se.height / 2 + (40 * Math.sin(radians) + 20 * Math.cos(radians)) * scale,
    { steps: 10 },
  );
  await page.mouse.up();
  const size = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('twynix.local-project.v1:smoke')!).project.screens[0]
        .widgets[0].rotationSize,
  );
  expect(size.width).toBeCloseTo(200, 0);
  expect(size.height).toBeCloseTo(120, 0);
  const fixedAfter = (await page
    .getByRole('button', { name: 'Resize selection nw', exact: true })
    .boundingBox())!;
  expect(fixedAfter.x).toBeCloseTo(fixedBefore.x, 0);
  expect(fixedAfter.y).toBeCloseTo(fixedBefore.y, 0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const first = await angle();
  await drag(25);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await angle()).toBe(first);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(angle).toBe(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(angle).toBe(first);
  await page.keyboard.down('Shift');
  await drag(22);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect.poll(angle).toBe(55);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect(
    await handle.evaluate(
      (el) =>
        parseFloat(getComputedStyle(el).width) *
        new DOMMatrix(getComputedStyle(el.closest('.screen-canvas')!).transform).a,
    ),
  ).toBeCloseTo(22, 0);
  await handle.focus();
  await handle.press('ArrowRight');
  await expect.poll(angle).toBe(60);
  await page.screenshot({ path: test.info().outputPath('rotation-handle.png') });
  await widget.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Rotate clockwise', exact: true })).toBeVisible();
});

test('rotation handles stay reachable at the top-left screen edge', async ({ page }) => {
  const project = createStarterProject();
  project.screens = [
    {
      id: 'edge-handle',
      name: 'Edge handle',
      width: 1280,
      height: 800,
      widgets: [{ ...newWidget('pump', 0), id: 'edge-pump', x: 0, y: 0 }],
      groups: {},
      connections: [],
    },
  ];
  await seed(page, project);
  await fit(page);
  await page.locator('[data-widget-id="edge-pump"]').click();
  const handle = page.getByRole('button', { name: 'Rotate selection', exact: true });
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!,
    canvas = (await page.locator('.screen-canvas').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(canvas.x);
  expect(box.y).toBeGreaterThanOrEqual(canvas.y);
  expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  await handle.focus();
  await handle.press('ArrowRight');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('twynix.local-project.v1:smoke')!).project.screens[0]
            .widgets[0].rotation,
      ),
    )
    .toBe(5);
});

test('action editor maps control values, validates limits and runs Preview without RPC', async ({
  page,
}) => {
  const project = createStarterProject(),
    widget = {
      ...newWidget('slider', 0),
      id: 'speed-command',
      name: 'Speed target',
      x: 160,
      y: 160,
      demoValue: 10,
      dashboard: { type: 'slider' as const, minimum: 10, maximum: 80, step: 5, unit: 'rpm' },
    };
  project.screens = [
    {
      id: 'commands',
      name: 'Command test',
      width: 1280,
      height: 800,
      widgets: [widget],
      connections: [],
      groups: {},
    },
  ];
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/commands')) requests++;
  });
  await seed(page, project);
  await fit(page);
  await page.locator('[data-widget-id="speed-command"]').click();
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  const editor = page.locator('tx-action-editor');
  await editor.getByRole('combobox', { name: 'Action', exact: true }).selectOption('command');
  await editor
    .getByRole('textbox', { name: 'Command device ID', exact: true })
    .fill('10000000-0000-4000-8000-000000000001');
  await editor.getByRole('textbox', { name: 'RPC method', exact: true }).fill('setSpeed');
  await editor
    .getByRole('textbox', { name: 'Static parameters', exact: true })
    .fill('{"channel":2}');
  await editor.getByRole('checkbox', { name: 'Map control value', exact: true }).check();
  await editor.getByRole('textbox', { name: 'Command parameter name', exact: true }).fill('speed');
  await editor.getByRole('spinbutton', { name: 'Command minimum', exact: true }).fill('10');
  await editor.getByRole('spinbutton', { name: 'Command maximum', exact: true }).fill('80');
  await editor.getByRole('spinbutton', { name: 'Command step', exact: true }).fill('5');
  await editor.getByRole('button', { name: 'Save action', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Save action', exact: true })).toBeDisabled();
  await editor.getByRole('textbox', { name: 'Preview command value', exact: true }).fill('95');
  await editor.getByRole('button', { name: 'Test command mapping', exact: true }).click();
  const feedback = page.getByRole('region', { name: 'Command feedback', exact: true });
  await expect(feedback).toContainText('at most 80');
  await page.getByRole('button', { name: 'Dismiss command feedback', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Preview command value', exact: true }).fill('35');
  await editor.getByRole('button', { name: 'Test command mapping', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm command', exact: true });
  await expect(confirm).toContainText('"speed": 35');
  await expect(confirm).toContainText('"channel": 2');
  await confirm
    .getByRole('combobox', { name: 'Simulate result', exact: true })
    .selectOption('failed');
  await confirm.getByRole('button', { name: 'Simulate command', exact: true }).click();
  await expect(feedback).toContainText('Simulated device failure');
  await page.getByRole('button', { name: 'Dismiss command feedback', exact: true }).click();
  await editor.getByRole('button', { name: 'Test command mapping', exact: true }).click();
  await confirm
    .getByRole('combobox', { name: 'Simulate result', exact: true })
    .selectOption('timeout');
  await confirm.getByRole('button', { name: 'Simulate command', exact: true }).click();
  await expect(feedback).toContainText('Simulated timeout');
  await page.screenshot({ path: test.info().outputPath('action-editor.png') });
  await page.getByRole('button', { name: 'Dismiss command feedback', exact: true }).click();
  await fit(page);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Speed target', exact: true });
  await expect(slider).toHaveAttribute('tabindex', '0');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(confirm).toContainText('"speed": 15');
  await confirm
    .getByRole('combobox', { name: 'Simulate result', exact: true })
    .selectOption('accepted');
  await confirm.getByRole('button', { name: 'Simulate command', exact: true }).click();
  await expect(feedback).toContainText('accepted');
  expect(requests).toBe(0);
});

test('Runtime command feedback waits for a fresh matching telemetry value after the reply', async ({
  page,
}) => {
  const entityId = '10000000-0000-4000-8000-000000000001',
    project = createStarterProject();
  const widget = {
    ...newWidget('slider', 0),
    id: 'runtime-speed',
    name: 'Runtime speed',
    x: 200,
    y: 200,
    demoValue: 10,
    dashboard: { type: 'slider' as const, minimum: 10, maximum: 80, step: 5, unit: 'rpm' },
    binding: {
      entityId,
      entityType: 'DEVICE' as const,
      key: 'speed',
      unit: 'rpm',
      staleAfterMs: 30000,
    },
  };
  widget.action = {
    type: 'command',
    deviceId: entityId,
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
      feedback: { timeoutMs: 5000, tolerance: 0 },
      replyCheck: { field: 'success', expectedValue: true },
    },
  };
  project.screens = [
    {
      id: 'runtime-commands',
      name: 'Runtime commands',
      width: 1280,
      height: 800,
      widgets: [widget],
      groups: {},
      connections: [],
    },
  ];
  const release = {
    id: '20000000-0000-4000-8000-000000000001',
    publishedAt: new Date().toISOString(),
    project: { ...project, revision: 1 },
  };
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: { id: '30000000-0000-4000-8000-000000000001' },
          tenantId: { id: '40000000-0000-4000-8000-000000000001' },
          authority: 'TENANT_ADMIN',
          email: 'fixture@test',
        },
        csrf: 'fake-only',
        commandsEnabled: true,
      },
    }),
  );
  await page.route(`**/api/projects/${project.id}`, (route) =>
    route.fulfill({ json: { ...project, revision: 1 } }),
  );
  await page.route(`**/api/projects/${project.id}/releases`, (route) =>
    route.fulfill({ json: release }),
  );
  const sent: Record<string, unknown>[] = [];
  await page.route(
    `**/api/projects/${project.id}/releases/${release.id}/commands`,
    async (route) => {
      sent.push(route.request().postDataJSON());
      await route.fulfill({ json: { state: 'accepted', reply: { success: true } } });
    },
  );
  let socket: import('@playwright/test').WebSocketRoute | undefined;
  await page.routeWebSocket('**/api/realtime', (ws) => {
    socket = ws;
    ws.onMessage(() => {
      ws.send(JSON.stringify({ type: 'connection', state: 'connected' }));
      ws.send(
        JSON.stringify({
          type: 'telemetry',
          values: {
            [`DEVICE:${entityId}:speed`]: {
              value: '10',
              quality: 'good',
              timestamp: Date.now() - 1000,
            },
          },
        }),
      );
    });
  });
  await seed(page, project);
  await fit(page);
  await page.getByRole('button', { name: project.name, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Publish release…', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Published revision 1');
  await page.getByRole('button', { name: project.name, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open published runtime', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Runtime speed', exact: true });
  await expect(slider).toBeEnabled();
  await expect(slider).toHaveAttribute('tabindex', '0');
  await slider.focus();
  await slider.press('ArrowRight');
  const confirm = page.getByRole('dialog', { name: 'Confirm command', exact: true });
  await expect(confirm).toContainText('"speed": 15');
  await confirm.getByRole('button', { name: 'Send command', exact: true }).click();
  const feedback = page.getByRole('region', { name: 'Command feedback', exact: true });
  await expect(feedback).toContainText('Waiting for a fresh matching reported value');
  expect(sent).toHaveLength(1);
  expect(sent[0].value).toBe(15);
  expect(sent[0]).not.toHaveProperty('params');
  expect(sent[0]).not.toHaveProperty('deviceId');
  socket!.send(
    JSON.stringify({
      type: 'telemetry',
      values: {
        [`DEVICE:${entityId}:speed`]: { value: '15', quality: 'good', timestamp: Date.now() + 1 },
      },
    }),
  );
  await expect(feedback).toContainText('Fresh reported value matches');
  await expect(slider).toHaveValue('15');
  await page.screenshot({ path: test.info().outputPath('command-feedback.png') });
});

test('a late Preview activation script is discarded after changing workspace mode', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const queued: { worker: FixtureWorker; id: number }[] = [];
    class FixtureWorker {
      onmessage:
        | ((event: { data: { id: number; result: { type: string; value: string }[] } }) => void)
        | null = null;
      postMessage(message: { id: number }) {
        queued.push({ worker: this, id: message.id });
      }
      terminate() {}
    }
    Object.defineProperty(window, 'Worker', { value: FixtureWorker });
    Object.defineProperty(window, 'commandScriptFixture', {
      value: {
        pending: () => queued.length,
        release: () => {
          for (const { worker, id } of queued.splice(0))
            worker.onmessage?.({ data: { id, result: [{ type: 'action', value: '' }] } });
        },
      },
    });
  });
  const project = createStarterProject();
  const action = {
    type: 'command' as const,
    deviceId: '10000000-0000-4000-8000-000000000001',
    method: 'setState',
    params: { enabled: true },
    confirmation: 'Fixture Preview command',
  };
  project.screens = [
    {
      id: 'script-context',
      name: 'Script context',
      width: 1280,
      height: 800,
      groups: {},
      connections: [],
      widgets: [
        {
          ...newWidget('button', 0),
          id: 'warm-command',
          name: 'Warm command',
          x: 160,
          y: 160,
          action,
        },
        {
          ...newWidget('button', 1),
          id: 'script-command',
          name: 'Script command',
          x: 460,
          y: 160,
          action,
          onClick: 'hmi.runAction();',
        },
      ],
    },
  ];
  await seed(page, project);
  await fit(page);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  // Preload the command dialog so the negative assertion cannot race a lazy module load.
  await page.locator('[data-widget-id="warm-command"]').click();
  const confirm = page.getByRole('dialog', { name: 'Confirm command', exact: true });
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss command feedback', exact: true }).click();
  await page.locator('[data-widget-id="script-command"]').click();
  await expect.poll(() => page.evaluate(() => window.commandScriptFixture!.pending())).toBe(1);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.evaluate(async () => {
    window.commandScriptFixture!.release();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Command feedback', exact: true })).toHaveCount(0);
});

test('command Preview example is inserted without replacing screens and works offline', async ({
  page,
}) => {
  const project = createStarterProject(),
    originalScreens = project.screens.map((screen) => ({
      id: screen.id,
      name: screen.name,
      widgets: screen.widgets.length,
    }));
  let rpcRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/commands')) rpcRequests++;
  });
  await seed(page, project);
  await page.getByRole('button', { name: 'Symbols', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search symbol library', exact: true }).fill('command');
  await page.getByRole('button', { name: 'Add command Preview example', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const slider = page.getByRole('slider', { name: 'Speed setpoint', exact: true });
  const history = page.getByRole('region', { name: 'Preview command history', exact: true });
  await expect(history).toContainText('No attempts yet');
  await expect(slider).toHaveAttribute('tabindex', '0');
  await expect(slider).toHaveValue('30');
  await slider.focus();
  await slider.press('ArrowRight');
  const confirm = page.getByRole('dialog', { name: 'Confirm command', exact: true });
  await expect(confirm).toContainText('"speed": 35');
  await confirm
    .getByRole('combobox', { name: 'Simulate result', exact: true })
    .selectOption('confirmed');
  await confirm.getByRole('button', { name: 'Simulate command', exact: true }).click();
  const feedback = page.getByRole('region', { name: 'Command feedback', exact: true });
  await expect(feedback).toContainText('Simulated reported value matches');
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await expect(history).toContainText('35');
  await expect(history).toContainText('Reply + matching value');
  await page.getByRole('button', { name: 'Dismiss command feedback', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Pump enable', exact: true });
  await toggle.click();
  await expect(confirm).toContainText('"enabled": true');
  await confirm.getByRole('button', { name: 'Simulate command', exact: true }).click();
  await expect(feedback).toContainText('confirmed');
  await page.getByRole('button', { name: 'Dismiss command feedback', exact: true }).click();
  const dropdown = page.getByRole('combobox', { name: 'Operating mode', exact: true });
  await dropdown.selectOption('2');
  await expect(feedback).toContainText('allowed command value');
  await expect(history.locator('tbody tr')).toHaveCount(3);
  await expect(history.locator('tbody tr').first()).toContainText('maintenance');
  await expect(history.locator('tbody tr').first()).toContainText('invalid');
  await expect(history.locator('tbody tr').first()).toContainText('Not simulated');
  await expect(confirm).toHaveCount(0);
  await page.getByRole('button', { name: 'Dismiss command feedback', exact: true }).click();
  await dropdown.selectOption('1');
  await expect(confirm).toContainText('"mode": "auto"');
  await confirm
    .getByRole('combobox', { name: 'Simulate result', exact: true })
    .selectOption('accepted');
  await confirm.getByRole('button', { name: 'Simulate command', exact: true }).click();
  await expect(feedback).toContainText('Waiting for a fresh matching');
  await expect(feedback).toContainText('did not match in time');
  await expect(history.locator('tbody tr')).toHaveCount(4);
  await expect(history.locator('tbody tr').first()).toContainText('Reply only');
  await expect(history.locator('tbody tr').first()).toContainText('timeout');
  await page.screenshot({ path: test.info().outputPath('command-history.png') });
  const reset = page.getByRole('button', { name: 'Reset example', exact: true });
  await reset.click();
  await expect(slider).toHaveValue('30');
  await expect(toggle).not.toBeChecked();
  await expect(dropdown).toHaveValue('0');
  await expect(feedback).toHaveCount(0);
  await expect(history).toContainText('No attempts yet');
  // Reset also cancels an in-flight simulated readback and its timer.
  await dropdown.selectOption('1');
  await expect(confirm.getByRole('combobox', { name: 'Simulate result', exact: true })).toHaveValue(
    'confirmed',
  );
  await confirm
    .getByRole('combobox', { name: 'Simulate result', exact: true })
    .selectOption('accepted');
  await confirm.getByRole('button', { name: 'Simulate command', exact: true }).click();
  await expect(feedback).toContainText('Waiting for a fresh matching');
  await reset.click();
  await expect(dropdown).toHaveValue('0');
  await expect(feedback).toHaveCount(0);
  await page.waitForTimeout(2200);
  await expect(feedback).toHaveCount(0);
  await expect(history.locator('tbody tr')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('command-preview-lab.png') });
  const saved = (await page.evaluate(
    () => JSON.parse(localStorage.getItem('twynix.local-project.v1:smoke')!).project,
  )) as Project;
  expect(
    saved.screens
      .slice(0, originalScreens.length)
      .map((screen) => ({ id: screen.id, name: screen.name, widgets: screen.widgets.length })),
  ).toEqual(originalScreens);
  expect(saved.screens).toHaveLength(originalScreens.length + 1);
  expect(saved.screens.slice(0, originalScreens.length)).toEqual(project.screens);
  expect(rpcRequests).toBe(0);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(reset).toHaveCount(0);
  await page
    .locator(
      '[data-widget-id="' +
        saved.screens.at(-1)!.widgets.find((widget) => widget.kind === 'slider')!.id +
        '"]',
    )
    .click();
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  const editor = page.locator('tx-action-editor');
  await expect(editor).toContainText('Preview-only example');
  await expect(
    editor.getByRole('checkbox', { name: 'Map control value', exact: true }),
  ).toBeChecked();
  await editor.getByRole('textbox', { name: 'Preview command value', exact: true }).fill('95');
  await editor.getByRole('button', { name: 'Test command mapping', exact: true }).click();
  await expect(feedback).toContainText('at most 80');
  expect(rpcRequests).toBe(0);
});

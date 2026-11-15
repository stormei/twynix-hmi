import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDashboardWidgets,
  createStarterProject,
  dashboardConfigSchema,
  dashboardKinds,
  parseControlOptions,
  controlKinds,
  newWidget,
  projectSchema,
  widgetSchema,
} from '../packages/model/src';

test('each dashboard widget has independent typed defaults and survives project roundtrip', () => {
  const project = createStarterProject();
  project.screens.push({
    id: 'dashboard',
    name: 'Dashboard',
    width: 1280,
    height: 800,
    widgets: createDashboardWidgets(),
    connections: [],
    groups: {},
  });
  const roundtrip = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(
    roundtrip.screens.at(-1)!.widgets.map((w) => w.kind),
    ['chart', 'gauge', 'markdown', 'html', 'iframe'],
  );
  for (const kind of dashboardKinds) {
    const widget = newWidget(kind, 0);
    assert.equal(widgetSchema.parse(widget).dashboard?.type, kind);
  }
});
test('legacy symbols import without a dashboard configuration', () => {
  const { dashboard, ...legacy } = newWidget('pump', 0);
  assert.equal(dashboard, null);
  assert.equal(widgetSchema.parse(legacy).dashboard, null);
});
test('dashboard configuration rejects invalid scales, thresholds and unsafe iframe URLs', () => {
  assert.equal(
    dashboardConfigSchema.safeParse({ type: 'chart', minimum: 100, maximum: 1 }).success,
    false,
  );
  assert.equal(
    dashboardConfigSchema.safeParse({
      type: 'gauge',
      minimum: 0,
      maximum: 100,
      warning: 90,
      critical: 50,
    }).success,
    false,
  );
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'not a url',
  ])
    assert.equal(dashboardConfigSchema.safeParse({ type: 'iframe', url }).success, false);
  assert.equal(
    dashboardConfigSchema.safeParse({ type: 'iframe', url: 'http://192.168.1.148:8080' }).success,
    true,
  );
});
test('dashboard configuration cannot be attached to a different widget kind', () => {
  const project = createStarterProject();
  project.screens[0].widgets[0].dashboard = dashboardConfigSchema.parse({ type: 'chart' });
  assert.equal(projectSchema.safeParse(project).success, false);
});

test('controls have usable defaults, typed options and conservative scale validation', () => {
  for (const kind of controlKinds) assert.equal(newWidget(kind, 0).demoValue, 0);
  assert.deepEqual(
    parseControlOptions('0 = Manual\n1 = Automatic\ntrue = Enabled\nremote = Remote'),
    [
      { value: 0, label: 'Manual' },
      { value: 1, label: 'Automatic' },
      { value: true, label: 'Enabled' },
      { value: 'remote', label: 'Remote' },
    ],
  );
  assert.throws(() => parseControlOptions('1 = One\n1 = Duplicate'));
  assert.throws(() => parseControlOptions('missing separator'));
  assert.equal(
    dashboardConfigSchema.safeParse({ type: 'slider', minimum: 10, maximum: 5 }).success,
    false,
  );
  assert.equal(dashboardConfigSchema.safeParse({ type: 'slider', step: 0 }).success, false);
  assert.equal(
    dashboardConfigSchema.safeParse({ type: 'linear-gauge', warning: 90, critical: 80 }).success,
    false,
  );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQuickJS } from 'quickjs-emscripten';
import {
  bindingKey,
  createStarterProject,
  newWidget,
  projectSchema,
  propertyBinding,
  validatePropertyValue,
  widgetBindings,
} from '../packages/model/src';
import { BindingEnvironment, resolveWidgetProperties } from '../packages/bindings/src/resolve';
import { evaluateExpression } from '../packages/scripting/src/evaluate';
const environment: BindingEnvironment = {
  simulation: true,
  connected: false,
  values: {},
  demoValue: 82,
  now: 10000,
};
const source = {
  entityId: crypto.randomUUID(),
  entityType: 'DEVICE' as const,
  key: 'pressure',
  unit: 'bar',
  staleAfterMs: 1000,
};
async function evaluate() {
  const engine = await getQuickJS();
  return async (expression: string, context: { value: unknown; quality: string; name: string }) =>
    evaluateExpression(engine, expression, context);
}

test('legacy project imports gain property defaults and preserve their value subscription', () => {
  const project = createStarterProject();
  const raw = JSON.parse(JSON.stringify(project));
  for (const screen of raw.screens)
    for (const widget of screen.widgets) {
      delete widget.visible;
      delete widget.enabled;
      delete widget.propertyBindings;
    }
  raw.screens[0].widgets[0].binding = source;
  const widget = projectSchema.parse(raw).screens[0].widgets[0];
  assert.equal(widget.visible, true);
  assert.equal(widget.enabled, true);
  assert.deepEqual(propertyBinding(widget, 'value'), { type: 'telemetry', enabled: true, source });
  assert.deepEqual(widgetBindings(widget), [source]);
});

test('invalid constant property values are rejected by the project schema', () => {
  const project = createStarterProject();
  project.screens[0].widgets[0].propertyBindings.color = {
    type: 'constant',
    value: 'red',
    enabled: true,
  };
  assert.equal(projectSchema.safeParse(project).success, false);
  assert.throws(() => validatePropertyValue('enabled', 'not-a-boolean'));
  assert.throws(() => validatePropertyValue('value', ''));
  assert.equal(validatePropertyValue('visible', 'false'), false);
  assert.equal(validatePropertyValue('enabled', '0'), false);
});

test('constants preserve zero, empty text and explicit false states', async () => {
  const widget = newWidget('button', 0);
  widget.propertyBindings = {
    value: { type: 'constant', value: 0, enabled: true },
    text: { type: 'constant', value: '', enabled: true },
    visible: { type: 'constant', value: false, enabled: true },
    enabled: { type: 'constant', value: false, enabled: true },
  };
  const result = await resolveWidgetProperties(widget, environment, await evaluate());
  assert.equal(result.value.value, 0);
  assert.equal(result.text.value, '');
  assert.equal(result.visible.value, false);
  assert.equal(result.enabled.value, false);
});

test('property expressions use the resolved main value and report simulation quality', async () => {
  const widget = newWidget('tank', 0);
  widget.propertyBindings = {
    value: { type: 'constant', value: 82, enabled: true },
    color: {
      type: 'expression',
      expression: 'context.value > 75 ? "#da8054" : "#329c8c"',
      source: null,
      enabled: true,
    },
    text: {
      type: 'expression',
      expression: '"Level: " + context.value + "%"',
      source: null,
      enabled: true,
    },
  };
  const result = await resolveWidgetProperties(widget, environment, await evaluate());
  assert.equal(result.color.value, '#da8054');
  assert.equal(result.text.value, 'Level: 82%');
  assert.equal(result.color.quality, 'good');
});

test('separate telemetry inputs share one subscription and retain freshness per property', async () => {
  const widget = newWidget('tank', 0);
  widget.propertyBindings = {
    value: { type: 'telemetry', source, enabled: true },
    color: {
      type: 'expression',
      source: { ...source, staleAfterMs: 10000 },
      expression: 'context.value > 75 ? "#da8054" : "#329c8c"',
      enabled: true,
    },
  };
  const subscriptions = widgetBindings(widget);
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].staleAfterMs, 1000);
  const live = {
    ...environment,
    simulation: false,
    connected: true,
    values: { [bindingKey(source)]: { value: '82', timestamp: 8000, quality: 'stale' as const } },
  };
  const result = await resolveWidgetProperties(widget, live, await evaluate());
  assert.equal(result.value.quality, 'stale');
  assert.equal(result.value.value, 82);
  assert.equal(result.color.quality, 'good');
  assert.equal(result.color.value, '#da8054');
});

test('stale sources cannot hide equipment or enable operator actions', async () => {
  const widget = newWidget('button', 0);
  widget.propertyBindings = {
    visible: { type: 'telemetry', source, enabled: true },
    enabled: { type: 'telemetry', source, enabled: true },
  };
  const disconnected = {
    ...environment,
    simulation: false,
    values: { [bindingKey(source)]: { value: false, timestamp: 10000, quality: 'good' as const } },
  };
  const result = await resolveWidgetProperties(widget, disconnected, await evaluate());
  assert.equal(result.visible.value, true);
  assert.equal(result.enabled.value, false);
  assert.equal(result.visible.quality, 'stale');
  assert.equal(result.enabled.quality, 'stale');
});

test('disabling a migrated value binding suppresses the legacy subscription', async () => {
  const widget = newWidget('tank', 0);
  widget.binding = source;
  widget.propertyBindings.value = { type: 'telemetry', source, enabled: false };
  assert.deepEqual(widgetBindings(widget), []);
  const result = await resolveWidgetProperties(widget, environment, await evaluate());
  assert.equal(result.value.value, 82);
  assert.equal(result.value.quality, 'simulation');
});

test('missing telemetry never substitutes simulated samples for a configured source', async () => {
  const widget = newWidget('tank', 0);
  widget.propertyBindings.value = { type: 'telemetry', source, enabled: true };
  const result = await resolveWidgetProperties(widget, environment, await evaluate());
  assert.equal(result.value.value, null);
  assert.equal(result.value.quality, 'unknown');
});

test('expression errors produce diagnostics and conservative visibility and enablement', async () => {
  const widget = newWidget('button', 0);
  widget.propertyBindings = {
    enabled: { type: 'expression', expression: 'missingFunction()', source: null, enabled: true },
    visible: { type: 'expression', expression: '({})', source: null, enabled: true },
  };
  const result = await resolveWidgetProperties(widget, environment, await evaluate());
  assert.equal(result.visible.value, true);
  assert.equal(result.enabled.value, false);
  assert.match(result.enabled.error!, /missingFunction/);
  assert.equal(result.visible.quality, 'bad');
});

test('expressions cannot access host APIs or return objects, and infinite loops are interrupted', async () => {
  const engine = await getQuickJS();
  const context = { value: 1, quality: 'good', name: 'Pump' };
  assert.equal(
    evaluateExpression(
      engine,
      '[typeof fetch, typeof document, typeof process, typeof hmi].join(",")',
      context,
    ),
    'undefined,undefined,undefined,undefined',
  );
  assert.throws(() => evaluateExpression(engine, '({ x: 1 })', context), /Expressions must return/);
  assert.throws(
    () => evaluateExpression(engine, '(() => { while(true) {} })()', context),
    /interrupt/,
  );
});

test('control readback accepts boolean and declared text options without relaxing numeric symbols', async () => {
  const { resolveProperty } = await import('../packages/bindings/src/resolve');
  const evaluate = async () => null;
  const definition = { type: 'telemetry' as const, enabled: true, source };
  const live = {
    ...environment,
    simulation: false,
    connected: true,
    now: 10000,
    values: { [bindingKey(source)]: { value: 'true', quality: 'good' as const, timestamp: 10000 } },
  };
  const toggle = newWidget('toggle', 0),
    fallback = { value: null, quality: 'unknown' as const };
  assert.equal(
    (await resolveProperty('value', definition, toggle, live, fallback, fallback, evaluate)).value,
    true,
  );
  const dropdown = newWidget('dropdown', 0);
  dropdown.dashboard = {
    type: 'dropdown',
    options: [
      { label: 'Auto', value: 'auto' },
      { label: 'Manual', value: 'manual' },
    ],
  };
  const textLive = {
    ...live,
    values: { [bindingKey(source)]: { value: 'auto', quality: 'good' as const, timestamp: 10000 } },
  };
  assert.equal(
    (await resolveProperty('value', definition, dropdown, textLive, fallback, fallback, evaluate))
      .value,
    'auto',
  );
  assert.equal(
    (
      await resolveProperty(
        'value',
        definition,
        newWidget('pump', 0),
        textLive,
        fallback,
        fallback,
        evaluate,
      )
    ).quality,
    'bad',
  );
});

test('numeric control choices accept ThingsBoard decimal wire values while exact text choices retain their type', async () => {
  const { resolveProperty } = await import('../packages/bindings/src/resolve');
  const widget = newWidget('dropdown', 0),
    definition = { type: 'telemetry' as const, enabled: true, source };
  const live = {
    ...environment,
    simulation: false,
    connected: true,
    now: 10000,
    values: { [bindingKey(source)]: { value: '1.0', quality: 'good' as const, timestamp: 10000 } },
  };
  const fallback = { value: null, quality: 'unknown' as const };
  assert.equal(
    (await resolveProperty('value', definition, widget, live, fallback, fallback, async () => null))
      .value,
    1,
  );
  widget.dashboard = {
    type: 'dropdown',
    options: [
      { label: 'Numeric', value: 1 },
      { label: 'Text', value: '1.0' },
    ],
  };
  assert.equal(
    (await resolveProperty('value', definition, widget, live, fallback, fallback, async () => null))
      .value,
    '1.0',
  );
});

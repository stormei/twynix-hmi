import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQuickJS } from 'quickjs-emscripten';
import {
  behaviorConfigSchema,
  bindingKey,
  createStarterProject,
  projectSchema,
  widgetBindings,
} from '../packages/model/src';
import { scriptInputs } from '../packages/scripting/src/inputs';
import { evaluateScript } from '../packages/scripting/src/evaluate';
const source = {
  entityId: '00000000-0000-4000-8000-000000000001',
  entityType: 'DEVICE' as const,
  key: 'temperature',
  unit: '°C',
  staleAfterMs: 1000,
};
const config = behaviorConfigSchema.parse({
  apiVersion: 1,
  inputs: { temperature: source, other: { ...source, key: 'other' } },
  outputs: ['text'],
  fallback: 'baseline',
});
test('legacy documents remain valid; versioned configuration survives round trip and contributes subscriptions', () => {
  const project = createStarterProject();
  assert.equal(projectSchema.safeParse(project).success, true);
  project.screens[0].widgets[0].behaviorConfig = config;
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.screens[0].widgets[0].behaviorConfig, config);
  assert.ok(widgetBindings(restored.screens[0].widgets[0]).some((b) => b.key === 'other'));
  assert.equal(behaviorConfigSchema.safeParse({ ...config, apiVersion: 2 }).success, false);
  assert.equal(
    behaviorConfigSchema.safeParse({ ...config, outputs: ['text', 'text'] }).success,
    false,
  );
  assert.equal(
    behaviorConfigSchema.safeParse({ ...config, inputs: { constructor: source } }).success,
    false,
  );
});
test('inputs copy only declared sources and distinguish missing, disconnected, stale and invalid data', () => {
  const values = {
    [bindingKey(source)]: { value: 82, timestamp: 1000, quality: 'good' as const },
    secret: { value: 'hidden', timestamp: 1000, quality: 'good' as const },
  };
  const inputs = scriptInputs(config, values, true, 1500);
  assert.deepEqual(Object.keys(inputs), ['temperature', 'other']);
  assert.equal(inputs.temperature.value, 82);
  assert.equal(inputs.other.quality, 'missing');
  assert.equal(scriptInputs(config, values, false, 1500).temperature.quality, 'disconnected');
  assert.equal(scriptInputs(config, values, true, 2500).temperature.quality, 'stale');
  assert.equal(
    scriptInputs(
      config,
      { [bindingKey(source)]: { value: Infinity, timestamp: 1000, quality: 'good' } },
      true,
      1500,
    ).temperature.quality,
    'invalid',
  );
});
test('named inputs work in QuickJS without changing legacy context and are immutable', async () => {
  const engine = await getQuickJS();
  const context = {
    value: 5,
    quality: 'good',
    name: 'Tank',
    inputs: scriptInputs(config, {}, true, 0),
  };
  assert.deepEqual(
    evaluateScript(
      engine,
      'hmi.setText(context.value); hmi.setText(inputs.other.quality);',
      context,
    ),
    [
      { type: 'text', value: '5' },
      { type: 'text', value: 'missing' },
    ],
  );
  assert.throws(() => evaluateScript(engine, 'inputs.other.value = 99;', context));
  assert.throws(() => evaluateScript(engine, 'context.inputs.other = null;', context));
});

test('named subscriptions deduplicate with property sources and keep the strictest freshness', () => {
  const widget = createStarterProject().screens[0].widgets[0];
  widget.binding = source;
  widget.behaviorConfig = { ...config, inputs: { temperature: { ...source, staleAfterMs: 2000 } } };
  const matches = widgetBindings(widget).filter(
    (binding) => bindingKey(binding) === bindingKey(source),
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].staleAfterMs, 1000);
});

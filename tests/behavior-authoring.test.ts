import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQuickJS } from 'quickjs-emscripten';
import { createStarterProject, projectSchema, type BehaviorConfig } from '../packages/model/src';
import {
  behaviorDraft,
  behaviorTemplates,
  instantiateTemplate,
  liveAuthoringContext,
  parseSample,
} from '../packages/scripting/src/authoring';
import { evaluateBehavior, validateAppearance } from '../packages/scripting/src/evaluate';
import { EditorStore } from '../apps/editor/src/app/editor.store';
const config: BehaviorConfig = {
  apiVersion: 1,
  resultMode: 'appearance',
  inputs: {},
  outputs: ['text'],
  fallback: 'baseline',
};

test('reviewed templates execute as versioned local copies with quality-aware fallback', async () => {
  const engine = await getQuickJS();
  for (const template of behaviorTemplates) {
    const aliases = Object.fromEntries(
      template.inputs.map((slot, index) => [slot, `signal${index}`]),
    );
    const inputs = Object.fromEntries(
      template.inputs.map((slot, index) => [
        `signal${index}`,
        {
          value: slot === 'running' ? true : slot === 'fault' ? false : 50,
          quality: 'good' as const,
          timestamp: 1000,
          unit: '',
        },
      ]),
    );
    const source = instantiateTemplate(template, aliases, {});
    const result = evaluateBehavior(engine, source, {
      value: 50,
      quality: 'good',
      name: 'Fixture',
      inputs,
    });
    assert.deepEqual(validateAppearance(result, template.outputs), result, template.id);
    const missing = Object.fromEntries(
      Object.entries(inputs).map(([alias, sample]) => [
        alias,
        { ...sample, quality: 'missing' as const, value: null },
      ]),
    );
    assert.doesNotThrow(
      () =>
        evaluateBehavior(engine, source, {
          value: null,
          quality: 'unknown',
          name: 'Fixture',
          inputs: missing,
        }),
      template.id,
    );
  }
});
test('template parameter serialization and alias mapping cannot inject code or cascade slot replacements', async () => {
  const engine = await getQuickJS();
  const template = behaviorTemplates.find((template) => template.id === 'multi-input-label')!;
  const source = instantiateTemplate(
    template,
    { primary: 'secondary', secondary: 'primary' },
    { separator: '"; throw new Error("injected"); "' },
  );
  const inputs = {
    primary: { value: 'B', quality: 'good' as const, timestamp: 1, unit: '' },
    secondary: { value: 'A', quality: 'good' as const, timestamp: 1, unit: '' },
  };
  assert.deepEqual(
    evaluateBehavior(engine, source, { value: 0, quality: 'good', name: 'Fixture', inputs }),
    { text: 'A"; throw new Error("injected"); "B' },
  );
  assert.throws(() =>
    instantiateTemplate(template, { primary: 'constructor', secondary: 'valid' }, {}),
  );
  assert.throws(() =>
    instantiateTemplate(behaviorTemplates[0], { value: 'valid' }, { normal: 'red' }),
  );
});
test('authoring validates ownership, aliases and screen-wide subscription capacity', () => {
  const project = createStarterProject(),
    screen = project.screens[0],
    widget = screen.widgets[0];
  const source = 'return {text:"Draft"};';
  assert.deepEqual(behaviorDraft(widget, source, config, screen), { source, config });
  assert.throws(() =>
    behaviorDraft(widget, source, { ...config, inputs: { 'bad alias': {} } }, screen),
  );
  assert.throws(
    () =>
      behaviorDraft(
        {
          ...widget,
          propertyBindings: { text: { type: 'constant', enabled: true, value: 'Bound' } },
        },
        source,
        config,
        screen,
      ),
    /already/,
  );
  const binding = {
    entityType: 'DEVICE' as const,
    entityId: '00000000-0000-4000-8000-000000000001',
    key: 'signal',
    unit: '',
    staleAfterMs: 1000,
  };
  screen.widgets = Array.from({ length: 100 }, (_, index) => ({
    ...widget,
    id: `widget${index}`,
    binding: { ...binding, key: `key${index}` },
  }));
  assert.throws(
    () =>
      behaviorDraft(screen.widgets[0], source, { ...config, inputs: { extra: binding } }, screen),
    /100 distinct/,
  );
  assert.doesNotThrow(() =>
    behaviorDraft(
      screen.widgets[0],
      source,
      { ...config, inputs: { duplicate: { ...binding, key: 'key0' } } },
      screen,
    ),
  );
});
test('behavior draft apply is one undoable edit and simulation data is never serialized', () => {
  const store = new EditorStore(),
    widget = store.screen().widgets[0];
  store.selectOnly(widget.id);
  const before = JSON.stringify(store.project());
  const draft = behaviorDraft(
    widget,
    'return {text:"Draft"};',
    { ...config, template: { id: 'formatted-text', version: 1 } },
    store.screen(),
  );
  assert.equal(JSON.stringify(store.project()), before);
  store.updateWidget({ behavior: draft.source, behaviorConfig: draft.config });
  const roundtrip = projectSchema.parse(JSON.parse(JSON.stringify(store.project())));
  assert.deepEqual(roundtrip.screens[0].widgets[0].behaviorConfig?.template, {
    id: 'formatted-text',
    version: 1,
  });
  assert.equal(JSON.stringify(roundtrip).includes('sampleValues'), false);
  store.undo();
  assert.equal(JSON.stringify(store.project()), before);
  store.redo();
  assert.equal(store.selected()!.behavior, draft.source);
});
test('simulation parsing accepts bounded primitives and rejects structured or oversized values', () => {
  for (const [text, value] of [
    ['42', 42],
    ['false', false],
    ['null', null],
    ['"hello"', 'hello'],
    ['plain text', 'plain text'],
  ] as const)
    assert.equal(parseSample(text), value);
  for (const text of ['{}', '[]', '1e999', '"' + 'x'.repeat(4001) + '"'])
    assert.throws(() => parseSample(text));
});

test('interpreter diagnostics identify authored source lines instead of wrapper locations', async () => {
  const engine = await getQuickJS();
  assert.throws(
    () =>
      evaluateBehavior(engine, 'const valid = true;\nthrow new Error("Fixture");', {
        value: 0,
        quality: 'good',
        name: 'Fixture',
      }),
    /Line 2: Fixture/,
  );
});

test('numeric templates accept ThingsBoard numeric strings without converting empty text or booleans to zero', async () => {
  const engine = await getQuickJS(),
    template = behaviorTemplates.find((template) => template.id === 'formatted-text')!;
  const source = instantiateTemplate(template, { value: 'pressure' }, { suffix: ' bar' });
  for (const [value, text] of [
    ['4.2', '4.2 bar'],
    [false, 'Unavailable'],
    ['', 'Unavailable'],
    ['not a number', 'Unavailable'],
  ] as const) {
    assert.deepEqual(
      evaluateBehavior(engine, source, {
        name: 'Fixture',
        value: null,
        quality: 'unknown',
        inputs: { pressure: { value, quality: 'good', timestamp: 1, unit: 'bar' } },
      }),
      { text },
    );
  }
});

test('live authoring excludes unbound and signed-out demo primary values', () => {
  const widget = createStarterProject().screens[0].widgets[0];
  widget.binding = null;
  widget.propertyBindings = {};
  const simulated = { value: 82, quality: 'simulation', name: widget.name };
  assert.equal(liveAuthoringContext(widget, simulated, {}, false).value, null);
  assert.equal(liveAuthoringContext(widget, simulated, {}, true).value, null);
  widget.binding = {
    entityType: 'DEVICE',
    entityId: '00000000-0000-4000-8000-000000000001',
    key: 'level',
    unit: '%',
    staleAfterMs: 1000,
  };
  assert.equal(liveAuthoringContext(widget, simulated, {}, true).value, null);
  assert.equal(
    liveAuthoringContext(widget, { ...simulated, value: 25, quality: 'good' }, {}, true).value,
    25,
  );
  assert.equal(
    liveAuthoringContext(widget, { ...simulated, value: 25, quality: 'good' }, {}, false).value,
    null,
  );
});

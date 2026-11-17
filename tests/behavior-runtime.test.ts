import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQuickJS } from 'quickjs-emscripten';
import {
  behaviorConfigurationError,
  createStarterProject,
  projectSchema,
  type Appearance,
} from '../packages/model/src';
import {
  evaluateBehavior,
  evaluateScript,
  validateAppearance,
} from '../packages/scripting/src/evaluate';
import {
  BehaviorScheduler,
  type BehaviorJob,
  type BehaviorDiagnostic,
} from '../packages/scripting/src/scheduler';
const context = {
  value: 10,
  quality: 'good',
  name: 'Fixture',
  inputs: {
    temperature: { value: 82, quality: 'good' as const, timestamp: 1, unit: '°C' },
    running: { value: true, quality: 'good' as const, timestamp: 2, unit: '' },
  },
};
const job = (id = 'one', signature = '1'): BehaviorJob => ({
  id,
  signature,
  definition: 'definition',
  source: 'return {};',
  context,
  outputs: ['text', 'color'],
});
test('versioned behaviors produce repeatable multi-input results while legacy API remains available', async () => {
  const engine = await getQuickJS();
  const source =
    'return {text: String(inputs.temperature.value), color: inputs.running.value ? "#00ff00" : "#ff0000"};';
  assert.deepEqual(evaluateBehavior(engine, source, context), { text: '82', color: '#00ff00' });
  assert.deepEqual(
    evaluateBehavior(engine, source, context),
    evaluateBehavior(engine, source, context),
  );
  assert.deepEqual(evaluateScript(engine, 'hmi.setText(context.value);', context), [
    { type: 'text', value: '10' },
  ]);
  assert.deepEqual(
    evaluateBehavior(
      engine,
      'return {text: [typeof Date, typeof Math.random, typeof fetch, typeof hmi, typeof window].join(",")};',
      context,
    ),
    { text: 'undefined,undefined,undefined,undefined,undefined' },
  );
  assert.throws(() =>
    evaluateBehavior(engine, 'inputs.temperature.value = 0; return {};', context),
  );
});
test('invalid, async, oversized and unauthorized outputs fail atomically; VM recovers after loops', async () => {
  const engine = await getQuickJS();
  for (const source of [
    'return {text:"ok", color:"red"};',
    'return {rotation: 5};',
    'return {text:"x".repeat(301)};',
    'return {text:NaN};',
    'return {action:undefined};',
    'return {get text() { return "getter"; }};',
    'return new Map();',
    'return Promise.resolve({text:"late"});',
    'return null;',
    'return {text:"x".repeat(9000)};',
    'while(true) {}',
  ])
    assert.throws(() => evaluateBehavior(engine, source, context), source);
  assert.throws(() => validateAppearance({ text: 'ok', color: '#123456' }, ['text']));
  assert.deepEqual(evaluateBehavior(engine, 'return {};', context), {});
});
test('new behavior ownership/capabilities enforced on saved projects without rejecting legacy scripts', () => {
  const project = createStarterProject(),
    widget = project.screens[0].widgets[0];
  widget.behavior = 'hmi.setColor("#123456");';
  widget.propertyBindings.color = { type: 'constant', enabled: true, value: '#123456' };
  assert.equal(projectSchema.safeParse(project).success, true);
  widget.behaviorConfig = {
    apiVersion: 1,
    resultMode: 'appearance',
    inputs: {},
    outputs: ['color'],
    fallback: 'baseline',
  };
  assert.match(behaviorConfigurationError(widget)!, /already/);
  assert.equal(projectSchema.safeParse(project).success, false);
  delete widget.propertyBindings.color;
  assert.equal(projectSchema.safeParse(project).success, true);
  widget.behaviorConfig.outputs = ['rotation'];
  assert.equal(projectSchema.safeParse(project).success, true);
  widget.kind = 'iframe';
  widget.behaviorConfig.outputs = ['text'];
  assert.match(behaviorConfigurationError(widget)!, /does not support/);
});
test('scheduler bounds concurrency/rate, coalesces hot inputs and services other widgets fairly', async () => {
  let now = 0;
  const started: BehaviorJob[] = [],
    published: Appearance[] = [];
  let release!: (appearance: Appearance) => void;
  const scheduler = new BehaviorScheduler(
    async (job) => {
      started.push(job);
      return new Promise((resolve) => (release = resolve));
    },
    (_id, appearance, diagnostic) => {
      if (diagnostic.state !== 'pending') published.push(appearance);
    },
    () => now,
  );
  scheduler.sync([job(), job('two')]);
  const first = scheduler.pump();
  scheduler.sync([job('one', '2'), job('two')]);
  scheduler.sync([job('one', '3'), job('two')]);
  await scheduler.pump();
  assert.equal(started.length, 1);
  release({ text: 'obsolete' });
  await first;
  assert.equal(published.length, 0);
  await scheduler.pump();
  assert.equal(started.length, 1);
  now = 100;
  const second = scheduler.pump();
  assert.equal(started[1].id, 'two');
  release({ color: '#123456' });
  await second;
  now = 200;
  const third = scheduler.pump();
  assert.equal(started[2].signature, '3');
  release({ text: 'latest' });
  await third;
  assert.deepEqual(published, [{ color: '#123456' }, { text: 'latest' }]);
});
test('scheduler restores baseline, quarantines repeated failures, and retries after definition edits', async () => {
  let now = 0;
  const results: { appearance: Appearance; diagnostic: BehaviorDiagnostic }[] = [];
  const scheduler = new BehaviorScheduler(
    async () => {
      throw new Error('Invalid color');
    },
    (_id, appearance, diagnostic) => {
      if (diagnostic.state !== 'pending') results.push({ appearance, diagnostic });
    },
    () => now,
  );
  scheduler.sync([job()]);
  for (let i = 0; i < 4; i++) {
    await scheduler.pump();
    now += 100;
  }
  assert.equal(results.length, 3);
  assert.equal(results[2].diagnostic.state, 'quarantined');
  assert.deepEqual(results[0].appearance, {});
  scheduler.sync([job('one', 'changed-input')]);
  await scheduler.pump();
  assert.equal(results.length, 3);
  scheduler.sync([{ ...job(), definition: 'edited' }]);
  await scheduler.pump();
  assert.equal(results.length, 4);
});
test('scheduler discards work after reset, removal or synchronous current-snapshot guard', async () => {
  let now = 0,
    release!: (appearance: Appearance) => void;
  const results: Appearance[] = [];
  const scheduler = new BehaviorScheduler(
    () => new Promise((resolve) => (release = resolve)),
    (_id, result, diagnostic) => {
      if (diagnostic.state !== 'pending') results.push(result);
    },
    () => now,
  );
  scheduler.sync([job()]);
  const pending = scheduler.pump();
  scheduler.reset();
  release({ text: 'old screen' });
  await pending;
  assert.equal(results.length, 0);
  now = 100;
  scheduler.sync([{ ...job(), isCurrent: () => false }]);
  const guarded = scheduler.pump();
  release({ text: 'old telemetry' });
  await guarded;
  assert.equal(results.length, 0);
  scheduler.sync([]);
  assert.deepEqual(results, [{}]);
});

test('new behaviors clear stale successful appearance immediately while latest inputs wait', async () => {
  let now = 0;
  const states: { appearance: Appearance; state: string }[] = [];
  const scheduler = new BehaviorScheduler(
    async () => ({ text: 'Valid' }),
    (_id, appearance, diagnostic) => states.push({ appearance, state: diagnostic.state }),
    () => now,
  );
  scheduler.sync([job()]);
  await scheduler.pump();
  scheduler.sync([job('one', 'new-input')]);
  assert.deepEqual(states.at(-1), { appearance: {}, state: 'pending' });
  now = 100;
  await scheduler.pump();
  assert.deepEqual(states.at(-1), { appearance: { text: 'Valid' }, state: 'ok' });
});

test('reset permits an identical job in a replacement document after discarding old work', async () => {
  let now = 0,
    release!: (appearance: Appearance) => void;
  const results: Appearance[] = [];
  const scheduler = new BehaviorScheduler(
    () => new Promise((resolve) => (release = resolve)),
    (_id, appearance, diagnostic) => {
      if (diagnostic.state === 'ok') results.push(appearance);
    },
    () => now,
  );
  scheduler.sync([job()]);
  const old = scheduler.pump();
  scheduler.reset();
  scheduler.sync([job()]);
  release({ text: 'old document' });
  await old;
  now = 100;
  const replacement = scheduler.pump();
  release({ text: 'replacement document' });
  await replacement;
  assert.deepEqual(results, [{ text: 'replacement document' }]);
});

test('rapid telemetry cannot prevent a failing behavior from quarantining', async () => {
  let now = 0,
    reject!: (error: Error) => void;
  const states: string[] = [];
  const scheduler = new BehaviorScheduler(
    () => new Promise((_resolve, fail) => (reject = fail)),
    (_id, _appearance, diagnostic) => states.push(diagnostic.state),
    () => now,
  );
  scheduler.sync([job()]);
  for (let attempt = 0; attempt < 3; attempt++) {
    const pending = scheduler.pump();
    scheduler.sync([job('one', String(attempt + 2))]);
    reject(new Error('Invalid output'));
    await pending;
    now += 100;
  }
  assert.equal(states.at(-1), 'quarantined');
  scheduler.sync([job('one', 'latest')]);
  await scheduler.pump();
  assert.equal(states.at(-1), 'quarantined');
});

test('stale failures publish quarantine and explicit retry invalidates old work without editing source', async () => {
  let now = 0,
    fail = true;
  const states: string[] = [];
  const scheduler = new BehaviorScheduler(
    async () => {
      if (fail) throw new Error('Unavailable');
      return { text: 'Recovered' };
    },
    (_id, _appearance, diagnostic) => states.push(diagnostic.state),
    () => now,
  );
  scheduler.sync([{ ...job(), isCurrent: () => false }]);
  for (let i = 0; i < 3; i++) {
    await scheduler.pump();
    now += 100;
  }
  assert.equal(states.at(-1), 'quarantined');
  fail = false;
  scheduler.sync([{ ...job('one', 'new-input'), isCurrent: () => true }]);
  scheduler.retry('one');
  await scheduler.pump();
  assert.equal(states.at(-1), 'ok');
});

test('empty failure messages still count as failures and restore baseline', async () => {
  const states: string[] = [];
  const scheduler = new BehaviorScheduler(
    async () => {
      throw new Error('');
    },
    (_id, _appearance, diagnostic) => states.push(diagnostic.state),
  );
  scheduler.sync([job()]);
  await scheduler.pump();
  assert.equal(states.at(-1), 'error');
});

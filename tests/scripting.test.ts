import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQuickJS } from 'quickjs-emscripten';
import { evaluateScript } from '../packages/scripting/src/evaluate';
const context = { value: 82, quality: 'simulation', name: 'Tank' };

test('scripts receive a narrow API and return declarative effects', async () => {
  const engine = await getQuickJS();
  assert.deepEqual(
    evaluateScript(
      engine,
      'hmi.setColor(context.value > 75 ? "#da8054" : "#329c8c"); hmi.notify(context.name); hmi.runAction();',
      context,
    ),
    [
      { type: 'color', value: '#da8054' },
      { type: 'notify', value: 'Tank' },
      { type: 'action', value: '' },
    ],
  );
});

test('scripts cannot access browser, network, or server credentials', async () => {
  const engine = await getQuickJS();
  assert.deepEqual(
    evaluateScript(
      engine,
      'hmi.setText([typeof window, typeof fetch, typeof process, typeof document].join(","));',
      context,
    ),
    [{ type: 'text', value: 'undefined,undefined,undefined,undefined' }],
  );
});

test('infinite loops are interrupted and a new script still works', async () => {
  const engine = await getQuickJS();
  assert.throws(() => evaluateScript(engine, 'while (true) {}', context), /interrupt/);
  assert.deepEqual(evaluateScript(engine, 'hmi.setText("Recovered");', context), [
    { type: 'text', value: 'Recovered' },
  ]);
});

test('effect count limits prevent unbounded message floods', async () => {
  const engine = await getQuickJS();
  assert.throws(
    () => evaluateScript(engine, 'for(let i=0;i<100;i++) hmi.notify("spam");', context),
    /Too many/,
  );
});

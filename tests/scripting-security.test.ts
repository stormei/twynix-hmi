import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { getQuickJS } from 'quickjs-emscripten';
import {
  evaluateBehavior,
  evaluateExpression,
  evaluateScript,
} from '../packages/scripting/src/evaluate';

// Child-process timeout is an outer test guard against an interpreter/error-inspection escape.
test('hostile error getters, output serializers and memory pressure stay bounded and recover', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import {getQuickJS} from 'quickjs-emscripten';
    import {evaluateBehavior,evaluateExpression,evaluateScript} from './packages/scripting/src/evaluate.ts';
    const engine=await getQuickJS(), context={value:10,quality:'good',name:'Fixture'};
    for(const evaluate of [evaluateBehavior,evaluateExpression,evaluateScript]) {
      const scripts=evaluate===evaluateExpression ? [
        '(()=>{throw {get message(){while(true){}}};})()',
        '({get value(){while(true){}}})',
        '(()=>{const a=[]; while(true) a.push(new Array(4096).fill(42));})()',
      ] : [
        'throw {get message(){while(true){}}};',
        'throw {message:{toString(){while(true){}}}};',
        'throw {message:"bad", get stack(){while(true){}}};',
        'const a=[]; while(true) a.push(new Array(4096).fill(42));',
      ];
      if(evaluate===evaluateScript) scripts.push('Array.prototype.toJSON = function(){while(true){}}; hmi.setText("Fixture");');
      for(const script of scripts) assert.throws(()=>evaluate(engine,script,context));
    }
    assert.deepEqual(evaluateBehavior(engine,'return {text:"Recovered"};',context),{text:'Recovered'});
    assert.deepEqual(evaluateScript(engine,'hmi.setText("Recovered");',context),[{type:'text',value:'Recovered'}]);
    assert.equal(evaluateExpression(engine,'context.value + 1',context),11);
  `,
    ],
    { timeout: 8000, encoding: 'utf8' },
  );
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
});
test('cross-evaluation globals do not persist and unsupported host capabilities remain absent', async () => {
  const engine = await getQuickJS(),
    context = { value: 10, quality: 'good', name: 'Fixture' };
  evaluateBehavior(engine, 'globalThis.poison = 123; return {};', context);
  const result = evaluateBehavior(
    engine,
    'return {text:[typeof poison,typeof window,typeof fetch,typeof WebSocket,typeof process,typeof require,typeof setTimeout,typeof Date,typeof Math.random].join(",")};',
    context,
  );
  assert.equal(result.text, Array(9).fill('undefined').join(','));
  assert.throws(() =>
    evaluateBehavior(engine, 'return new Proxy({}, {ownKeys(){while(true){}}});', context),
  );
  assert.throws(() =>
    evaluateScript(engine, 'effects.push({get value(){while(true){}},type:"text"});', context),
  );
  assert.throws(
    () => evaluateExpression(engine, '"x".repeat(160001)', context),
    /size|limit|interrupt/,
  );
  assert.equal(evaluateExpression(engine, '"x".repeat(4000)', context), 'x'.repeat(4000));
});
test('error text is bounded without losing authored-line diagnostics', async () => {
  const engine = await getQuickJS(),
    context = { value: 10, quality: 'good', name: 'Fixture' };
  try {
    evaluateBehavior(engine, 'const ok = true;\nthrow new Error("x".repeat(10000));', context);
    assert.fail('Expected failure');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Line 2:/);
    assert.ok(error.message.length < 2100);
  }
});

test('wrapper-closing source cannot bypass trusted output conversion or leak result handles', async () => {
  const engine = await getQuickJS(),
    context = { value: 10, quality: 'good', name: 'Fixture' };
  for (let index = 0; index < 5; index++) {
    assert.throws(() =>
      evaluateBehavior(engine, `} )(); return '{"text":"Escaped"}'; (()=>{`, context),
    );
    assert.throws(() =>
      evaluateBehavior(engine, `} )(); return '"'+ 'x'.repeat(20000)+'"'; (()=>{`, context),
    );
    assert.deepEqual(evaluateScript(engine, `} )(); return 'invalid-json'; (()=>{`, context), []);
  }
  assert.deepEqual(evaluateBehavior(engine, 'return {text:"Recovered"};', context), {
    text: 'Recovered',
  });
});

test('JSON context keys are data, not object-literal prototype setters', async () => {
  const engine = await getQuickJS();
  const value = JSON.parse('{"__proto__":{"poisoned":true},"safe":1}');
  assert.equal(
    evaluateExpression(engine, 'Object.prototype.hasOwnProperty.call(context.value,"__proto__")', {
      value,
      quality: 'good',
      name: 'Fixture',
    }),
    true,
  );
  assert.equal(
    evaluateExpression(engine, 'typeof ({}).poisoned', { value, quality: 'good', name: 'Fixture' }),
    'undefined',
  );
});

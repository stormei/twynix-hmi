import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQuickJS } from 'quickjs-emscripten';
import { newWidget, type Appearance, type ProcessConnection } from '../packages/model/src';
import { runtimeWidget } from '../packages/editor/src/runtime-appearance';
import { widgetContentSize, rotateWidgetsBy } from '../packages/editor/src/rotation';
import { processPorts } from '../packages/editor/src/ports';
import { signalPorts } from '../packages/editor/src/signals';
import { routeConnection } from '../packages/editor/src/pipe-routing';
import { evaluateBehavior, validateAppearance } from '../packages/scripting/src/evaluate';
import { EditorStore } from '../apps/editor/src/app/editor.store';
const screen = { x: 0, y: 0, width: 1600, height: 1000 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const base = { ...newWidget('valve', 0), x: 300, y: 300, width: 240, height: 150 };

test('runtime offsets derive from saved geometry and preserve logical content through free/quarter rotations', () => {
  for (const angle of [0, 30, 90, 135, 270, -30, 360]) {
    const appearance = {
      position: { offsetX: 80, offsetY: -50 },
      rotation: { offsetDegrees: angle },
    };
    const original = structuredClone(base);
    const result = runtimeWidget(base, appearance, screen);
    close(result.x + result.width / 2, base.x + base.width / 2 + 80);
    close(result.y + result.height / 2, base.y + base.height / 2 - 50);
    close(widgetContentSize(result).width, widgetContentSize(base).width);
    close(widgetContentSize(result).height, widgetContentSize(base).height);
    assert.deepEqual(runtimeWidget(base, appearance, screen), result);
    assert.deepEqual(base, original);
  }
  const free = rotateWidgetsBy([base], 37, screen)[0];
  const translated = runtimeWidget(free, { position: { offsetX: 10, offsetY: 20 } }, screen);
  assert.deepEqual({ ...translated, x: free.x, y: free.y }, free);
  assert.equal(runtimeWidget(base, {}, screen), base);
});
test('process and signal ports rotate/translate with visual content, and routes retain pinned bends', () => {
  const radians = Math.PI / 6;
  const transformed = runtimeWidget(
    base,
    { position: { offsetX: 80, offsetY: -50 }, rotation: { offsetDegrees: 30 } },
    screen,
  );
  const cx = base.x + base.width / 2,
    cy = base.y + base.height / 2;
  for (const ports of [processPorts, signalPorts]) {
    const before = ports(base),
      after = ports(transformed);
    before.forEach((port, index) => {
      close(
        after[index].x,
        cx + 80 + (port.x - cx) * Math.cos(radians) - (port.y - cy) * Math.sin(radians),
      );
      close(
        after[index].y,
        cy - 50 + (port.x - cx) * Math.sin(radians) + (port.y - cy) * Math.cos(radians),
      );
    });
  }
  const other = { ...newWidget('pump', 1), x: 900, y: 600 };
  const link: ProcessConnection = {
    id: 'runtime-route',
    from: { widgetId: base.id, port: 'outlet' },
    to: { widgetId: other.id, port: 'inlet' },
    bendPoints: [{ x: 750, y: 550 }],
  };
  const route = routeConnection(link, [transformed, other], screen);
  const port = processPorts(transformed).find((port) => port.port === 'outlet')!;
  close(route.points[0].x, port.x);
  close(route.points[0].y, port.y);
  assert.ok(route.points.some((point) => point.x === 750 && point.y === 550));
  const instrument = { ...newWidget('instrument', 2), x: 850, y: 200 };
  const signal: ProcessConnection = {
    id: 'signal',
    medium: 'electrical',
    from: { widgetId: instrument.id, port: 'signal-out' },
    to: { widgetId: base.id, port: 'actuator' },
    bendPoints: [],
  };
  const signalRoute = routeConnection(signal, [instrument, transformed], screen);
  const actuator = signalPorts(transformed)[0];
  close(signalRoute.points.at(-1)!.x, actuator.x);
  close(signalRoute.points.at(-1)!.y, actuator.y);
});
test('geometry bounds, nested properties, ownership and finite values are checked atomically', async () => {
  const engine = await getQuickJS();
  const context = { value: 10, quality: 'good', name: 'Valve' };
  const valid = evaluateBehavior(
    engine,
    'return {position:{offsetX:10,offsetY:-20},rotation:{offsetDegrees:-30},text:"OK"};',
    context,
  );
  assert.deepEqual(validateAppearance(valid, ['position', 'rotation', 'text']), valid);
  assert.throws(() => validateAppearance(valid, ['text']));
  for (const source of [
    'return {position:{offsetX:Infinity,offsetY:0}};',
    'return {position:{offsetX:0}};',
    'return {rotation:{offsetDegrees:361}};',
    'return {position:{offsetX:4001,offsetY:0}};',
    'return {rotation:{get offsetDegrees(){return 20;}}};',
    'return {position:{offsetX:0,offsetY:0,extra:0}};',
  ])
    assert.throws(() => evaluateBehavior(engine, source, context), source);
  assert.throws(
    () => runtimeWidget(base, { position: { offsetX: -1000, offsetY: 0 } }, screen),
    /outside/,
  );
  assert.throws(
    () => runtimeWidget({ ...base, x: 0, y: 0 }, { rotation: { offsetDegrees: 45 } }, screen),
    /outside/,
  );
});
test('runtime presentation leaves document serialization, undo and redo untouched', () => {
  const store = new EditorStore();
  store.selectOnly(store.screen().widgets[0].id);
  store.updateWidget({ text: 'Saved edit' });
  const before = JSON.stringify(store.project()),
    undo = store.canUndo(),
    redo = store.canRedo();
  const appearance: Appearance = {
    position: { offsetX: 0, offsetY: 0 },
    rotation: { offsetDegrees: 0 },
  };
  for (let i = 0; i < 3; i++)
    store.screen().widgets.map((widget) => runtimeWidget(widget, appearance, store.screen()));
  assert.equal(JSON.stringify(store.project()), before);
  assert.equal(store.canUndo(), undo);
  assert.equal(store.canRedo(), redo);
  store.undo();
  assert.notEqual(store.screen().widgets[0].text, 'Saved edit');
});

test('fractional saved rotations preserve their exact bounds for translation and full-turn offsets', () => {
  const fractional = { ...base, rotation: 0.1, rotationSize: null };
  for (const offsetDegrees of [0, 360, -360]) {
    const result = runtimeWidget(
      fractional,
      { position: { offsetX: 10, offsetY: 0 }, rotation: { offsetDegrees } },
      screen,
    );
    assert.deepEqual(result, { ...fractional, x: fractional.x + 10 });
  }
});

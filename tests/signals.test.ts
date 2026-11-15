import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorStore } from '../apps/editor/src/app/editor.store';
import { newWidget, projectSchema } from '../packages/model/src';
import {
  signalPorts,
  normalizeSignalEndpoints,
  signalDecorations,
  signalStyles,
} from '../packages/editor/src/signals';
import { processPorts } from '../packages/editor/src/ports';
import { routeConnection } from '../packages/editor/src/pipe-routing';
import { buildPipeBridges } from '../packages/editor/src/pipe-bridges';

test('instrument and actuator signal ports match SVG faces without replacing fluid ports', () => {
  const instrument = { ...newWidget('instrument', 0), x: 100, y: 100, width: 320, height: 135 };
  const ports = signalPorts(instrument);
  assert.deepEqual([ports[0].x, ports[0].y, ports[1].x], [228, 148, 292]);
  assert.equal(signalPorts({ ...instrument, instrumentLocation: 'shared' })[0].x, 223);
  const valve = { ...newWidget('valve', 0), x: 100, y: 100, width: 160, height: 100 };
  assert.deepEqual(
    signalPorts(valve).map((port) => [port.port, port.x, port.y]),
    [['actuator', 180, 108]],
  );
  assert.equal(processPorts(valve).length, 2);
});
test('signal direction is normalized and output-output or fluid-signal wiring is rejected', () => {
  const output = { widgetId: 'a', port: 'signal-out' as const },
    input = { widgetId: 'b', port: 'signal-in' as const };
  assert.deepEqual(normalizeSignalEndpoints(input, output), { from: output, to: input });
  assert.equal(normalizeSignalEndpoints(output, { widgetId: 'b', port: 'signal-out' }), null);
  assert.equal(normalizeSignalEndpoints(output, { widgetId: 'b', port: 'inlet' }), null);
});
test('signal styles have distinct geometry, including vertical pneumatic and digital marks', () => {
  const points = [
    { x: 100, y: 100 },
    { x: 400, y: 100 },
    { x: 400, y: 350 },
  ];
  assert.equal(signalStyles.electrical.dash, '8 5');
  assert.deepEqual(signalDecorations(points, 'electrical'), { slashes: [], circles: [] });
  const pneumatic = signalDecorations(points, 'pneumatic');
  assert.ok(pneumatic.slashes.length > 4);
  assert.equal(pneumatic.slashes.length % 2, 0);
  assert.equal(pneumatic.circles.length, 0);
  const digital = signalDecorations(points, 'digital');
  assert.equal(digital.slashes.length, 0);
  assert.ok(digital.circles.some((point) => point.x === 400));
});
test('signals persist with styles and pins, copy with components, and delete with undo', () => {
  const store = new EditorStore();
  store.addScreen('Signals');
  store.addInstrument('PT');
  const source = store.selected()!;
  store.addInstrument('PIC');
  const controller = store.selected()!;
  store.add('valve');
  const valve = store.selected()!;
  assert.ok(
    store.connectPorts(
      { widgetId: controller.id, port: 'signal-in' },
      { widgetId: source.id, port: 'signal-out' },
      true,
      'electrical',
    ),
  );
  assert.ok(
    store.connectPorts(
      { widgetId: controller.id, port: 'signal-out' },
      { widgetId: valve.id, port: 'actuator' },
      true,
      'pneumatic',
    ),
  );
  assert.equal(
    store.connectPorts(
      { widgetId: source.id, port: 'signal-out' },
      { widgetId: valve.id, port: 'inlet' },
    ),
    false,
  );
  const link = store.screen().connections[0];
  store.setSignalMedium(link.id, 'digital');
  store.updatePipeBends(link.id, [{ x: 600, y: 400 }]);
  const imported = projectSchema.parse(JSON.parse(JSON.stringify(store.project())));
  assert.equal(imported.screens.at(-1)!.connections[0].medium, 'digital');
  store.selectIds([source.id, controller.id, valve.id], false);
  store.copy();
  store.paste();
  assert.deepEqual(
    store.screen().connections.map((link) => link.medium),
    ['digital', 'pneumatic', 'digital', 'pneumatic'],
  );
  store.delete();
  assert.equal(store.screen().connections.length, 2);
  store.undo();
  assert.equal(store.screen().connections.length, 4);
});
test('schema rejects signal endpoints on process links and fluid endpoints on signals', () => {
  const store = new EditorStore();
  store.addScreen('Signals');
  store.addInstrument('PT');
  const a = store.selected()!;
  store.add('valve');
  const b = store.selected()!;
  store.connectPorts(
    { widgetId: a.id, port: 'signal-out' },
    { widgetId: b.id, port: 'actuator' },
    true,
    'pneumatic',
  );
  const project = JSON.parse(JSON.stringify(store.project()));
  const link = project.screens.at(-1).connections[0];
  delete link.medium;
  assert.equal(projectSchema.safeParse(project).success, false);
  link.medium = 'electrical';
  link.to.port = 'inlet';
  assert.equal(projectSchema.safeParse(project).success, false);
});
test('signal routes follow moved terminals and never create fluid crossing bridges', () => {
  const a = { ...newWidget('instrument', 0), x: 100, y: 100 },
    b = { ...newWidget('valve', 0), x: 800, y: 350 };
  const link = {
    id: 'signal',
    medium: 'pneumatic' as const,
    from: { widgetId: a.id, port: 'signal-out' as const },
    to: { widgetId: b.id, port: 'actuator' as const },
  };
  const route = routeConnection(link, [a, b], { width: 1120, height: 680 });
  assert.equal(route.blocked, false);
  assert.equal(route.points.at(-1)!.y, signalPorts(b)[0].y);
  const moved = routeConnection(link, [a, { ...b, y: 450 }], { width: 1120, height: 680 });
  assert.equal(moved.blocked, false);
  assert.notDeepEqual(moved.points, route.points);
  const crossed = buildPipeBridges(
    [
      {
        link: { id: 'pipe' },
        points: [
          { x: 100, y: 300 },
          { x: 900, y: 300 },
        ],
      },
      {
        link,
        points: [
          { x: 500, y: 100 },
          { x: 500, y: 500 },
        ],
      },
    ],
    [],
    { width: 1120, height: 680 },
  );
  assert.ok(crossed.every((route) => route.crossingCount === 0 && route.bridgePaths.length === 0));
});

import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWidget, projectSchema, type ProcessConnection } from '../packages/model/src';
import { routeBetween, routeConnection, segmentIsClear } from '../packages/editor/src/pipe-routing';
import { processPorts } from '../packages/editor/src/ports';
import { EditorStore } from '../apps/editor/src/app/editor.store';
const screen = { width: 1120, height: 680 };
const pipe = (x: number, y: number) => ({ ...newWidget('pipe', 0), x, y, width: 240, height: 100 });
const from = pipe(60, 240),
  to = pipe(780, 240);
const obstacle = { ...newWidget('motor', 0), x: 480, y: 180, width: 130, height: 200 };
const link: ProcessConnection = {
  id: 'pipe-link',
  from: { widgetId: from.id, port: 'outlet' },
  to: { widgetId: to.id, port: 'inlet' },
};

test('automatic routes avoid object clearance boxes and remain attached to port faces', () => {
  const route = routeConnection(link, [from, to, obstacle], screen);
  assert.equal(route.blocked, false);
  assert.deepEqual(route.points[0], processPorts(from)[1]); // first point retains port metadata
  const last = route.points.at(-1)!;
  assert.equal(last.x, processPorts(to)[0].x);
  assert.equal(last.y, processPorts(to)[0].y);
  const box = { left: 468, top: 168, right: 622, bottom: 392 };
  for (let i = 1; i < route.points.length; i++)
    assert.ok(segmentIsClear(route.points[i - 1], route.points[i], [box]));
  assert.ok(route.points.some((point) => point.y <= 168 || point.y >= 392));
  const moved = routeConnection(link, [from, { ...to, y: 420 }, obstacle], screen);
  assert.equal(moved.blocked, false);
  assert.equal(moved.points.at(-1)!.y, 470);
});
test('visibility routing finds multiple turns between staggered obstacles', () => {
  const boxes = [
    { left: 200, right: 300, top: -12, bottom: 400 },
    { left: 500, right: 600, top: 250, bottom: 692 },
  ];
  const route = routeBetween({ x: 100, y: 100 }, { x: 900, y: 500 }, boxes, screen);
  assert.ok(route);
  assert.ok(route.length >= 6);
  for (let i = 1; i < route.length; i++) assert.ok(segmentIsClear(route[i - 1], route[i], boxes));
});
test('pinned points are preserved while endpoint geometry and remaining routes adapt', () => {
  const bendPoints = [
    { x: 400, y: 100 },
    { x: 700, y: 100 },
  ];
  for (const target of [to, { ...to, y: 450, width: 300 }]) {
    const route = routeConnection({ ...link, bendPoints }, [from, target, obstacle], screen);
    assert.equal(route.blocked, false);
    for (const pin of bendPoints)
      assert.ok(route.points.some((point) => point.x === pin.x && point.y === pin.y));
    assert.equal(route.legs.length, route.points.length - 1);
    assert.equal(route.points.at(-1)!.y, processPorts(target)[0].y);
  }
});
test('blocked or pinned-inside-obstacle routes are flagged, not reported as clear', () => {
  const wall = { ...obstacle, x: 480, y: 0, width: 130, height: 680 };
  assert.equal(routeConnection(link, [from, to, wall], screen).blocked, true);
  assert.equal(
    routeConnection({ ...link, bendPoints: [{ x: 500, y: 250 }] }, [from, to, obstacle], screen)
      .blocked,
    true,
  );
  assert.equal(
    routeConnection(link, [from, to, { ...wall, visible: false }], screen).blocked,
    false,
  );
});
test('manual route persistence, reset, copy offsets and deletion support undo', () => {
  const store = new EditorStore();
  store.addScreen('Routing');
  store.add('pipe');
  const a = store.selected()!;
  store.add('valve');
  const b = store.selected()!;
  store.connectPorts({ widgetId: a.id, port: 'outlet' }, { widgetId: b.id, port: 'inlet' });
  const id = store.screen().connections[0].id,
    pins = [{ x: 500, y: 400 }];
  store.updatePipeBends(id, pins);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(store.project()))).screens.at(-1)!.connections[0]
      .bendPoints,
    pins,
  );
  store.updatePipeBends(id, []);
  store.undo();
  assert.deepEqual(store.screen().connections[0].bendPoints, pins);
  store.selectIds([a.id, b.id], false);
  store.copy();
  store.paste();
  assert.deepEqual(store.screen().connections[1].bendPoints, [{ x: 524, y: 424 }]);
  store.deletePipe(id);
  assert.ok(!store.screen().connections.some((link) => link.id === id));
  store.undo();
  assert.ok(store.screen().connections.some((link) => link.id === id));
});

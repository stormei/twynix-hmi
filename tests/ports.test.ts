import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorStore } from '../apps/editor/src/app/editor.store';
import { createStarterProject, newWidget, projectSchema } from '../packages/model/src';
import { connectionPath, processPorts, snapToPort } from '../packages/editor/src/ports';

function pipe(x = 100, y = 100) {
  return { ...newWidget('pipe', 0), x, y, width: 240, height: 100 };
}
function blankStore() {
  const store = new EditorStore();
  store.addScreen('Piping');
  return store;
}

test('ports match letterboxed SVG geometry and rotate with fittings', () => {
  const widget = { ...newWidget('elbow', 0), x: 100, y: 100, width: 240, height: 120 };
  const first = processPorts(widget);
  assert.equal(first[0].x, 168);
  assert.equal(first[0].y, 160);
  const rotated = processPorts({ ...widget, pipeRotation: 90 });
  assert.deepEqual([rotated[0].x, rotated[0].y, rotated[0].dx, rotated[0].dy], [220, 108, 0, -1]);
  assert.deepEqual([rotated[1].x, rotated[1].y, rotated[1].dx, rotated[1].dy], [272, 160, 1, 0]);
});
test('port snapping preserves group spacing, uses only free opposing ports and respects bounds', () => {
  const stationary = pipe(100, 100),
    moving = pipe(320, 108);
  const snapped = snapToPort([moving], [stationary], [], 14, { width: 1120, height: 680 });
  assert.ok(snapped.connection);
  assert.equal(snapped.widgets[0].x, 324);
  assert.equal(snapped.widgets[0].y, 100);
  assert.equal(
    snapToPort([moving], [stationary], [], 3, { width: 1120, height: 680 }).connection,
    null,
  );
  assert.equal(
    snapToPort([moving], [stationary], [], 14, { width: 550, height: 680 }).connection,
    null,
  );
  const occupied = [
    {
      id: 'one',
      from: { widgetId: stationary.id, port: 'outlet' as const },
      to: { widgetId: 'other', port: 'inlet' as const },
    },
  ];
  assert.equal(
    snapToPort([moving], [stationary], occupied, 14, { width: 1120, height: 680 }).connection,
    null,
  );
  const grouped = snapToPort(
    [moving, { ...newWidget('sensor', 0), x: 370, y: 250 }],
    [stationary],
    [],
    14,
    { width: 1120, height: 680 },
  );
  assert.equal(grouped.widgets[1].x - grouped.widgets[0].x, 50);
  assert.equal(grouped.widgets[1].y - grouped.widgets[0].y, 142);
});
test('connections follow moved and resized endpoints with orthogonal paths', () => {
  const a = pipe(),
    b = pipe(600, 300);
  const from = processPorts(a)[1],
    to = processPorts(b)[0];
  const path = connectionPath(from, to);
  assert.ok(path.startsWith(`M${from.x} ${from.y}`));
  assert.ok(path.endsWith(`L${to.x} ${to.y}`));
  assert.notEqual(connectionPath(from, processPorts({ ...b, x: 650, width: 300 })[0]), path);
  assert.equal(connectionPath(from, { ...to, x: from.x, y: from.y }), '');
});
test('connections are persistent, single occupancy and copied with their components', () => {
  const store = blankStore();
  store.add('pipe');
  const a = store.selected()!;
  store.add('tee');
  const b = store.selected()!;
  store.connectPorts({ widgetId: a.id, port: 'outlet' }, { widgetId: b.id, port: 'inlet' });
  store.connectPorts({ widgetId: a.id, port: 'outlet' }, { widgetId: b.id, port: 'branch' });
  assert.equal(store.screen().connections.length, 1);
  projectSchema.parse(JSON.parse(JSON.stringify(store.project())));
  store.selectIds([a.id, b.id], false);
  store.copy();
  store.paste();
  assert.equal(store.screen().connections.length, 2);
  const copied = store.screen().connections[1];
  assert.ok(store.selectedIds().includes(copied.from.widgetId));
  assert.ok(store.selectedIds().includes(copied.to.widgetId));
  store.delete();
  assert.equal(store.screen().connections.length, 1);
  store.undo();
  assert.equal(store.screen().connections.length, 2);
  store.duplicateScreen();
  projectSchema.parse(store.project());
  assert.ok(
    store
      .screen()
      .connections.every((link) => store.screen().widgets.some((w) => w.id === link.from.widgetId)),
  );
});
test('move-and-connect is one undo step, and disconnect is undoable', () => {
  const store = blankStore();
  store.add('pipe');
  const a = store.selected()!;
  store.add('elbow');
  const b = store.selected()!;
  store.placeConnected([{ ...b, x: 400 }], {
    from: { widgetId: a.id, port: 'outlet' },
    to: { widgetId: b.id, port: 'inlet' },
  });
  assert.equal(store.screen().connections.length, 1);
  store.undo();
  assert.equal(store.screen().connections.length, 0);
  assert.equal(store.screen().widgets.find((w) => w.id === b.id)!.x, b.x);
  store.redo();
  store.disconnectPorts(a.id);
  assert.equal(store.screen().connections.length, 0);
  store.undo();
  assert.equal(store.screen().connections.length, 1);
});
test('schema rejects dangling, duplicate and invalid ports while old screens default empty', () => {
  const project = createStarterProject();
  const old = JSON.parse(JSON.stringify(project));
  delete old.screens[0].connections;
  assert.deepEqual(projectSchema.parse(old).screens[0].connections, []);
  const connection = project.screens[0].connections[0];
  connection.to.widgetId = 'missing';
  assert.equal(projectSchema.safeParse(project).success, false);
  connection.to.widgetId = connection.from.widgetId;
  assert.equal(projectSchema.safeParse(project).success, false);
});

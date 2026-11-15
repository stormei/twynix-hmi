import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWidget, widgetSchema } from '../packages/model/src';
import {
  rotateWidgets,
  rotateWidgetsBy,
  widgetContentSize,
  selectionFrame,
  resizeRotatedSelection,
} from '../packages/editor/src/rotation';
import { routeConnection } from '../packages/editor/src/pipe-routing';
import { processPorts } from '../packages/editor/src/ports';
import { signalPorts } from '../packages/editor/src/signals';
const screen = { x: 0, y: 0, width: 1600, height: 1000 };
test('quarter turns preserve grouped geometry and return exactly after four rotations', () => {
  const original = [
    { ...newWidget('pump', 0), x: 400, y: 300, width: 160, height: 125 },
    { ...newWidget('valve', 1), x: 650, y: 400, width: 160, height: 100 },
  ];
  let rotated = rotateWidgets(original, true, screen);
  assert.deepEqual(widgetContentSize(rotated[0]), { width: 160, height: 125 });
  assert.equal(rotated[0].rotation, 90);
  assert.deepEqual(rotateWidgets(rotated, false, screen), original);
  for (let i = 1; i < 4; i++) rotated = rotateWidgets(rotated, true, screen);
  assert.deepEqual(rotated, original);
});
test('process and signal ports rotate around the same visual center and retain identities', () => {
  const widget = { ...newWidget('valve', 0), x: 400, y: 300, width: 160, height: 100 };
  const rotated = rotateWidgets([widget], true, screen)[0];
  for (const ports of [processPorts, signalPorts]) {
    const before = ports(widget),
      after = ports(rotated);
    before.forEach((port, i) => {
      assert.equal(after[i].port, port.port);
      assert.equal(after[i].widgetId, port.widgetId);
      assert.equal(after[i].x, 480 - (port.y - 350));
      assert.equal(after[i].y, 350 + (port.x - 480));
      assert.equal(after[i].dx, -port.dy || 0);
      assert.equal(after[i].dy, port.dx);
    });
  }
});
test('rotation clamps to screen and rejects selections that cannot fit without mutation', () => {
  const widget = { ...newWidget('tank', 0), x: 0, y: 0, width: 120, height: 240 };
  const rotated = rotateWidgets([widget], true, screen)[0];
  assert.equal(rotated.x, 0);
  assert.equal(rotated.width, 240);
  assert.throws(() => rotateWidgets([widget], true, { ...screen, width: 200 }));
  assert.equal(widget.rotation, 0);
  const { rotation: _rotation, ...legacy } = widget;
  assert.equal(_rotation, 0);
  assert.equal(widgetSchema.parse(legacy).rotation, 0);
});

test('attached pipe routes follow rotated endpoints without rewriting connection identity', () => {
  const from = { ...newWidget('pump', 0), x: 200, y: 200, width: 160, height: 125 };
  const to = { ...newWidget('valve', 1), x: 800, y: 400, width: 160, height: 100 };
  const link = {
    id: 'rotated-pipe',
    from: { widgetId: from.id, port: 'outlet' as const },
    to: { widgetId: to.id, port: 'inlet' as const },
  };
  const rotated = rotateWidgets([from], true, screen)[0];
  const route = routeConnection(link, [rotated, to], screen);
  assert.equal(route.blocked, false);
  const start = processPorts(rotated)[1],
    end = processPorts(to)[0];
  assert.equal(route.points[0].x, start.x);
  assert.equal(route.points[0].y, start.y);
  assert.equal(route.points.at(-1)!.x, end.x);
  assert.equal(route.points.at(-1)!.y, end.y);
  assert.equal(widgetSchema.parse(JSON.parse(JSON.stringify(rotated))).rotation, 90);
});

test('free rotation preserves logical shape size and rotates process/signal normals exactly', () => {
  const widget = { ...newWidget('valve', 0), x: 400, y: 300, width: 160, height: 100 };
  const rotated = rotateWidgetsBy([widget], 37, screen)[0];
  assert.equal(rotated.rotation, 37);
  const logical = widgetContentSize(rotated);
  assert.ok(Math.abs(logical.width - 160) < 1e-8);
  assert.ok(Math.abs(logical.height - 100) < 1e-8);
  assert.equal(widgetSchema.parse(JSON.parse(JSON.stringify(rotated))).rotation, 37);
  const restored = rotateWidgetsBy([rotated], -37, screen)[0];
  for (const key of ['x', 'y', 'width', 'height'] as const)
    assert.ok(Math.abs(restored[key] - widget[key]) < 1e-7);
  assert.equal(restored.rotationSize, null);
  for (const ports of [processPorts, signalPorts]) {
    const before = ports(widget),
      after = ports(rotated),
      radians = (37 * Math.PI) / 180;
    before.forEach((port, index) => {
      assert.ok(
        Math.abs(
          after[index].x -
            (480 + (port.x - 480) * Math.cos(radians) - (port.y - 350) * Math.sin(radians)),
        ) < 1e-7,
      );
      assert.ok(
        Math.abs(after[index].dx - (port.dx * Math.cos(radians) - port.dy * Math.sin(radians))) <
          1e-7,
      );
    });
  }
});
test('free rotated ports retain attached orthogonal routes and resized content stays inside its frame', () => {
  const pump = rotateWidgetsBy(
    [{ ...newWidget('pump', 0), x: 300, y: 300, width: 160, height: 125 }],
    33,
    screen,
  )[0];
  const pipe = { ...newWidget('pipe', 1), x: 900, y: 300, width: 240, height: 100 };
  const route = routeConnection(
    {
      id: 'free-route',
      from: { widgetId: pump.id, port: 'outlet' },
      to: { widgetId: pipe.id, port: 'inlet' },
    },
    [pump, pipe],
    screen,
  );
  assert.equal(route.blocked, false);
  assert.equal(route.points[0].x, processPorts(pump)[1].x);
  for (let i = 1; i < route.points.length; i++)
    assert.ok(
      route.points[i].x === route.points[i - 1].x || route.points[i].y === route.points[i - 1].y,
    );
  const resized = { ...pump, width: pump.width * 1.5, height: pump.height * 1.5 };
  const before = widgetContentSize(pump),
    after = widgetContentSize(resized);
  assert.ok(Math.abs(after.width - before.width * 1.5) < 1e-7);
  assert.ok(Math.abs(after.height - before.height * 1.5) < 1e-7);
});

test('selection frames follow object and group orientation rather than enclosing axis-aligned boxes', () => {
  const widgets = [
    { ...newWidget('pump', 0), x: 400, y: 300, width: 160, height: 100 },
    { ...newWidget('valve', 1), x: 650, y: 340, width: 160, height: 100 },
  ];
  const original = selectionFrame(widgets)!;
  const rotated = rotateWidgetsBy(widgets, 35, screen),
    frame = selectionFrame(rotated)!;
  assert.equal(frame.rotation, 35);
  assert.ok(Math.abs(frame.width - original.width) < 1e-7);
  assert.ok(Math.abs(frame.height - original.height) < 1e-7);
  const single = selectionFrame([rotated[0]])!;
  assert.ok(Math.abs(single.width - 160) < 1e-7);
  assert.ok(Math.abs(single.height - 100) < 1e-7);
});
test('rotated resizing follows local axes, keeps opposite corners fixed and rejects clipping', () => {
  const widget = rotateWidgetsBy(
    [{ ...newWidget('valve', 0), x: 400, y: 300, width: 160, height: 100 }],
    35,
    screen,
  )[0];
  const frame = selectionFrame([widget])!,
    radians = (35 * Math.PI) / 180;
  const result = resizeRotatedSelection(
    [widget],
    'se',
    40 * Math.cos(radians) - 20 * Math.sin(radians),
    40 * Math.sin(radians) + 20 * Math.cos(radians),
    screen,
  )!;
  const after = selectionFrame(result)!;
  assert.ok(Math.abs(after.width - 200) < 1e-7);
  assert.ok(Math.abs(after.height - 120) < 1e-7);
  const corner = (f: typeof frame) => ({
    x: f.x + f.width / 2 - (f.width / 2) * Math.cos(radians) + (f.height / 2) * Math.sin(radians),
    y: f.y + f.height / 2 - (f.width / 2) * Math.sin(radians) - (f.height / 2) * Math.cos(radians),
  });
  assert.ok(Math.abs(corner(frame).x - corner(after).x) < 1e-7);
  assert.ok(Math.abs(corner(frame).y - corner(after).y) < 1e-7);
  assert.equal(resizeRotatedSelection([widget], 'se', 4000, 4000, screen), null);
});

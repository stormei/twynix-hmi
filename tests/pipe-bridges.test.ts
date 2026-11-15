import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPipeBridges } from '../packages/editor/src/pipe-bridges';
import { newWidget, type ProcessConnection } from '../packages/model/src';
import { routeConnection } from '../packages/editor/src/pipe-routing';
const screen = { width: 1120, height: 680 };
const route = (id: string, points: { x: number; y: number }[]) => ({ link: { id }, points });
const vertical = route('vertical', [
  { x: 300, y: 100 },
  { x: 300, y: 500 },
]);
const horizontal = route('horizontal', [
  { x: 100, y: 300 },
  { x: 700, y: 300 },
]);

test('separate perpendicular crossings have one upper bridge and a lower gap', () => {
  const result = buildPipeBridges([vertical, horizontal], [], screen);
  assert.equal(result[0].crossingCount, 0);
  assert.equal(result[1].crossingCount, 1);
  assert.match(result[0].path, /M300 321/);
  assert.equal(result[1].bridgePaths.length, 1);
  assert.match(result[1].path, /C/);
  assert.deepEqual(result[0].points, vertical.points);
  assert.deepEqual(result[1].points, horizontal.points);
  const repeated = buildPipeBridges([vertical, horizontal], [], screen);
  assert.deepEqual(result, repeated);
});
test('bridge direction is stable for reversed segments and crossings at collinear pins', () => {
  const reversed = route('reverse', [...horizontal.points].reverse());
  const result = buildPipeBridges([vertical, reversed], [], screen);
  assert.equal(result[1].bridgePaths.length, 1);
  const subdivided = route('pins', [
    { x: 100, y: 300 },
    { x: 300, y: 300 },
    { x: 700, y: 300 },
  ]);
  assert.equal(buildPipeBridges([vertical, subdivided], [], screen)[1].crossingCount, 1);
  assert.equal(subdivided.points.length, 3);
});
test('tee-connected port endpoints remain junctions and never become bridges', () => {
  const tee = { ...newWidget('tee', 0), x: 450, y: 250, width: 120, height: 120 };
  const left = { ...newWidget('pipe', 0), x: 100, y: 260, width: 240, height: 100 };
  const right = { ...newWidget('pipe', 0), x: 700, y: 260, width: 240, height: 100 };
  const top = {
    ...newWidget('elbow', 0),
    x: 450,
    y: 50,
    width: 120,
    height: 120,
    pipeRotation: 180 as const,
  };
  const links: ProcessConnection[] = [
    {
      id: 'left',
      from: { widgetId: left.id, port: 'outlet' },
      to: { widgetId: tee.id, port: 'inlet' },
    },
    {
      id: 'right',
      from: { widgetId: tee.id, port: 'outlet' },
      to: { widgetId: right.id, port: 'inlet' },
    },
    {
      id: 'top',
      from: { widgetId: top.id, port: 'outlet' },
      to: { widgetId: tee.id, port: 'branch' },
    },
  ];
  const widgets = [tee, left, right, top],
    snapshot = JSON.stringify(links);
  const routes = links.map((link) => ({ link, ...routeConnection(link, widgets, screen) }));
  assert.ok(
    buildPipeBridges(routes, widgets, screen).every(
      (route) => route.crossingCount === 0 && route.bridgePaths.length === 0,
    ),
  );
  assert.equal(JSON.stringify(links), snapshot);
  // A shared endpoint is a touch, not an independent crossing.
  assert.equal(
    buildPipeBridges(
      [
        route('a', [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
        ]),
        route('b', [
          { x: 300, y: 100 },
          { x: 300, y: 500 },
        ]),
      ],
      [],
      screen,
    )[1].crossingCount,
    0,
  );
});
test('nearby crossings share one arch and geometry updates when a pipe moves', () => {
  const near = route('near', [
    { x: 320, y: 100 },
    { x: 320, y: 500 },
  ]);
  const result = buildPipeBridges([vertical, near, horizontal], [], screen);
  assert.equal(result[2].crossingCount, 2);
  assert.equal(result[2].bridgePaths.length, 1);
  const moved = route('moved', [
    { x: 100, y: 600 },
    { x: 700, y: 600 },
  ]);
  assert.ok(
    buildPipeBridges([vertical, moved], [], screen).every(
      (route) => route.crossingCount === 0 && route.bridgePaths.length === 0,
    ),
  );
});
test('bridges flip away from objects and fall back to a gap when neither side fits', () => {
  const above = { x: 275, y: 270, width: 50, height: 20 };
  const result = buildPipeBridges([vertical, horizontal], [above], screen);
  assert.match(result[1].bridgePaths[0], /318\.666/);
  const below = { x: 275, y: 310, width: 50, height: 20 };
  const tight = buildPipeBridges([vertical, horizontal], [above, below], screen);
  assert.equal(tight[1].bridgePaths.length, 0);
  assert.equal(tight[1].crossingCount, 1);
  assert.match(tight[0].path, /M300 321/);
  const parallel = route('parallel', [
    { x: 300, y: 100 },
    { x: 300, y: 500 },
  ]);
  assert.equal(buildPipeBridges([vertical, parallel], [], screen)[1].crossingCount, 0);
});

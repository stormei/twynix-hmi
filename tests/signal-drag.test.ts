import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWidget } from '../packages/model/src';
import { signalPorts } from '../packages/editor/src/signals';
import {
  compatibleSignalTargets,
  nearestSignalTarget,
  previewSignalToPointer,
} from '../packages/editor/src/signal-drag';

const source = { ...newWidget('instrument', 0), x: 50, y: 100, width: 160, height: 135 };
const target = { ...newWidget('instrument', 0), x: 500, y: 100, width: 160, height: 135 };
const valve = { ...newWidget('valve', 0), x: 800, y: 300, width: 160, height: 100 };
const sourcePort = signalPorts(source)[1];

test('signal drag highlights only free receiving ports on other unlocked components', () => {
  const targets = compatibleSignalTargets(sourcePort, [source, target, valve], []);
  assert.deepEqual(
    targets.map((port) => port.port),
    ['signal-in', 'actuator'],
  );
  assert.ok(targets.every((port) => port.widgetId !== source.id));
  assert.deepEqual(
    compatibleSignalTargets(sourcePort, [source, { ...target, locked: true }, valve], []).map(
      (port) => port.port,
    ),
    ['actuator'],
  );
  assert.deepEqual(
    compatibleSignalTargets(sourcePort, [{ ...source, locked: true }, target, valve], []),
    [],
  );
});
test('occupied sources and targets are excluded before a drag can connect', () => {
  const link = {
    id: 'used',
    medium: 'electrical' as const,
    from: { widgetId: source.id, port: 'signal-out' as const },
    to: { widgetId: target.id, port: 'signal-in' as const },
  };
  assert.deepEqual(compatibleSignalTargets(sourcePort, [source, target, valve], [link]), []);
  const another = { ...newWidget('instrument', 0), x: 50, y: 400 };
  assert.deepEqual(
    compatibleSignalTargets(signalPorts(another)[1], [source, another, target, valve], [link]).map(
      (port) => port.port,
    ),
    ['signal-in', 'actuator'],
  );
});
test('magnetic hover tolerance stays constant in screen pixels at different zoom levels', () => {
  const targets = signalPorts(target).filter((port) => port.port === 'signal-in'),
    port = targets[0];
  assert.equal(
    nearestSignalTarget({ x: port.x + 30, y: port.y }, targets, 0.5)?.widgetId,
    target.id,
  );
  assert.equal(nearestSignalTarget({ x: port.x + 30, y: port.y }, targets, 1), null);
  assert.equal(nearestSignalTarget({ x: port.x + 8, y: port.y }, targets, 2)?.widgetId, target.id);
  assert.equal(nearestSignalTarget({ x: port.x + 10, y: port.y }, targets, 2), null);
});
test('live pointer preview stays attached to the source and ends at the cursor with orthogonal segments', () => {
  const cursor = { x: 420, y: 260 },
    preview = previewSignalToPointer(sourcePort, cursor, [source, target, valve], {
      width: 1120,
      height: 680,
    });
  assert.equal(preview.blocked, false);
  assert.equal(preview.points[0].x, sourcePort.x);
  assert.equal(preview.points[0].y, sourcePort.y);
  assert.deepEqual(preview.points.at(-1), cursor);
  for (let i = 1; i < preview.points.length; i++)
    assert.ok(
      preview.points[i - 1].x === preview.points[i].x ||
        preview.points[i - 1].y === preview.points[i].y,
    );
});

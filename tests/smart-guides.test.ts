import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  equalSpacing,
  smartAlignment,
  spacingIndicators,
} from '../packages/editor/src/smart-guides';
const screen = { x: 0, y: 0, width: 1000, height: 800 };
test('smart guides snap edges and centres within zoom-adjusted tolerance', () => {
  const result = smartAlignment(
    { x: 203, y: 297, width: 100, height: 80 },
    [
      { x: 200, y: 100, width: 100, height: 80 },
      { x: 600, y: 300, width: 100, height: 80 },
    ],
    screen,
    5,
  );
  assert.deepEqual(result.offset, { x: -3, y: 3 });
  assert.ok(result.guides.some((g) => g.axis === 'x' && g.position === 200));
  assert.ok(result.guides.some((g) => g.axis === 'y' && g.position === 300));
  assert.deepEqual(
    smartAlignment({ x: 203, y: 297, width: 100, height: 80 }, [], screen, 2).offset,
    { x: 0, y: 0 },
  );
});
test('screen snapping respects bounds and an axis-constrained drag', () => {
  const box = { x: 447, y: 357, width: 100, height: 80 };
  assert.deepEqual(smartAlignment(box, [], screen, 5).offset, { x: 3, y: 3 });
  assert.deepEqual(smartAlignment(box, [], screen, 5, { x: true, y: false }).offset, {
    x: 3,
    y: 0,
  });
});
test('spacing labels use nearest overlapping neighbours and ignore diagonal objects', () => {
  const gaps = spacingIndicators({ x: 200, y: 200, width: 100, height: 100 }, [
    { x: 50, y: 220, width: 100, height: 50 },
    { x: 0, y: 220, width: 10, height: 50 },
    { x: 340, y: 200, width: 100, height: 100 },
    { x: 310, y: 400, width: 100, height: 100 },
    { x: 200, y: 350, width: 100, height: 100 },
  ]);
  assert.deepEqual(
    gaps.map((g) => g.distance),
    [50, 40, 50],
  );
  assert.equal(gaps[0].y1, 245);
});

test('equal spacing centres unequal-sized symbols between neighbours', () => {
  const result = equalSpacing(
    { x: 233, y: 100, width: 80, height: 60 },
    [
      { x: 100, y: 100, width: 100, height: 60 },
      { x: 340, y: 100, width: 120, height: 60 },
    ],
    screen,
    5,
  );
  assert.equal(result.offset.x, -3);
  assert.deepEqual(
    result.indicators.map((gap) => gap.distance),
    [30, 30],
  );
});
test('equal spacing extends horizontal and vertical chains', () => {
  for (const vertical of [false, true]) {
    const rect = (position: number) =>
      vertical
        ? { x: 100, y: position, width: 60, height: 80 }
        : { x: position, y: 100, width: 80, height: 60 };
    const result = equalSpacing(rect(343), [rect(100), rect(220)], screen, 5);
    assert.equal(vertical ? result.offset.y : result.offset.x, -3);
    assert.deepEqual(
      result.indicators.map((gap) => gap.distance),
      [40, 40],
    );
    const before = equalSpacing(rect(-17 + 120), [rect(220), rect(340)], screen, 5);
    assert.equal(vertical ? before.offset.y : before.offset.x, -3);
  }
});
test('equal spacing respects tolerance, bounds, axis locks and intervening objects', () => {
  const refs = [
    { x: 100, y: 100, width: 80, height: 60 },
    { x: 220, y: 100, width: 80, height: 60 },
  ];
  const box = { x: 343, y: 100, width: 80, height: 60 };
  assert.equal(equalSpacing(box, refs, screen, 2).matched.x, false);
  assert.equal(equalSpacing(box, refs, screen, 5, { x: false, y: true }).matched.x, false);
  assert.equal(equalSpacing(box, refs, { ...screen, width: 400 }, 5).matched.x, false);
  assert.equal(
    equalSpacing(box, [...refs, { x: 310, y: 100, width: 10, height: 60 }], screen, 5).matched.x,
    false,
  );
  assert.equal(equalSpacing({ ...box, y: 400 }, refs, screen, 5).matched.x, false);
});

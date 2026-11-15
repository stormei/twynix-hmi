import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasToScreen, screenOrigin, rulerTicks } from '../packages/editor/src/viewport';

test('the complete artboard maps to exact target pixels at every zoom and pan', () => {
  const viewport = { width: 1100, height: 700 },
    screen = { width: 1920, height: 1080 };
  for (const zoom of [0.25, 0.5, 1, 2])
    for (const pan of [
      { x: 0, y: 0 },
      { x: 140, y: -65 },
    ]) {
      const origin = screenOrigin(viewport, screen, zoom, pan);
      assert.deepEqual(canvasToScreen(origin, viewport, screen, zoom, pan), { x: 0, y: 0 });
      assert.deepEqual(
        canvasToScreen(
          { x: origin.x + screen.width * zoom, y: origin.y + screen.height * zoom },
          viewport,
          screen,
          zoom,
          pan,
        ),
        { x: 1920, y: 1080 },
      );
      const point = canvasToScreen(
        { x: origin.x + 400 * zoom, y: origin.y + 250 * zoom },
        viewport,
        screen,
        zoom,
        pan,
      );
      assert.deepEqual(point, { x: 400, y: 250 });
    }
});
test('ruler tick positions stay aligned to screen coordinates through zoom and pan', () => {
  for (const zoom of [0.25, 0.5, 1, 2, 3]) {
    const origin = 75,
      ticks = rulerTicks(1920, 1100, origin, zoom);
    assert.ok(ticks.length > 5 && ticks.length < 350);
    assert.ok(
      ticks.every((tick) => Math.abs(tick.position - (origin + tick.value * zoom)) < 0.001),
    );
    assert.ok(
      ticks.every((tick) => tick.value >= 0 && tick.value <= 1920 && tick.position <= 1100 + 0.001),
    );
    assert.ok(ticks.some((tick) => tick.value === 0 && tick.major));
  }
});
test('custom screen edges are labeled exactly, while offscreen ruler ticks are clipped', () => {
  assert.ok(rulerTicks(1280, 1000, 40, 0.5).some((tick) => tick.value === 1280 && tick.major));
  const ticks = rulerTicks(1366, 1000, 40, 0.5);
  assert.ok(ticks.some((tick) => tick.value === 1366 && tick.position === 723 && tick.major));
  const panned = rulerTicks(1920, 600, -700, 1);
  assert.ok(panned.every((tick) => tick.position >= 18 && tick.position <= 600));
  assert.ok(panned.every((tick) => tick.value > 0));
});

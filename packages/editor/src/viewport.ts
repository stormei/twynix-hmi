export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
/** Editor chrome is outside these transforms: (0,0) is the target screen's top-left. */
export function screenOrigin(viewport: Size, screen: Size, zoom: number, pan: Point): Point {
  return {
    x: viewport.width / 2 + pan.x - (screen.width * zoom) / 2,
    y: viewport.height / 2 + pan.y - (screen.height * zoom) / 2,
  };
}
export function canvasToScreen(
  point: Point,
  viewport: Size,
  screen: Size,
  zoom: number,
  pan: Point,
): Point {
  const origin = screenOrigin(viewport, screen, zoom, pan);
  return { x: (point.x - origin.x) / zoom, y: (point.y - origin.y) / zoom };
}
export function rulerTicks(extent: number, viewportExtent: number, origin: number, zoom: number) {
  const desired = 80 / zoom,
    magnitude = 10 ** Math.floor(Math.log10(desired));
  const major = [1, 2, 5, 10].map((value) => value * magnitude).find((value) => value >= desired)!;
  const step = major / 20;
  const ticks: { value: number; position: number; major: boolean }[] = [];
  const start = Math.max(0, Math.ceil((18 - origin) / zoom / step) * step);
  const end = Math.min(extent, (viewportExtent - origin) / zoom);
  for (let value = start; value <= end + 0.001; value += step)
    ticks.push({
      value: Math.round(value * 100) / 100,
      position: origin + value * zoom,
      major: Math.abs(value / major - Math.round(value / major)) < 0.001,
    });
  const edge = origin + extent * zoom;
  if (edge >= 18 && edge <= viewportExtent) {
    const boundary = ticks.find((tick) => Math.abs(tick.value - extent) < 0.001);
    if (boundary) boundary.major = true;
    else ticks.push({ value: extent, position: edge, major: true });
  }
  return ticks;
}

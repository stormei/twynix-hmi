import type { Widget } from '../../model/src';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export function boundsOf(items: Rect[]): Rect | null {
  if (!items.length) return null;
  const x = Math.min(...items.map((item) => item.x)),
    y = Math.min(...items.map((item) => item.y));
  return {
    x,
    y,
    width: Math.max(...items.map((item) => item.x + item.width)) - x,
    height: Math.max(...items.map((item) => item.y + item.height)) - y,
  };
}
export function intersects(a: Rect, b: Rect) {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}
export function moveWidgets(widgets: Widget[], dx: number, dy: number, screen: Rect): Widget[] {
  const bounds = boundsOf(widgets);
  if (!bounds) return widgets;
  dx = clamp(dx, -bounds.x, screen.width - bounds.x - bounds.width);
  dy = clamp(dy, -bounds.y, screen.height - bounds.y - bounds.height);
  return widgets.map((widget) => ({ ...widget, x: widget.x + dx, y: widget.y + dy }));
}
export function resizeBounds(
  original: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  screen: Rect,
  minWidth: number,
  minHeight: number,
  aspect = false,
): Rect {
  let left = original.x,
    right = original.x + original.width,
    top = original.y,
    bottom = original.y + original.height;
  if (handle.includes('w')) left = clamp(left + dx, 0, right - minWidth);
  if (handle.includes('e')) right = clamp(right + dx, left + minWidth, screen.width);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - minHeight);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + minHeight, screen.height);
  if (aspect && handle.length === 2) {
    const availableW = handle.includes('w')
      ? original.x + original.width
      : screen.width - original.x;
    const availableH = handle.includes('n')
      ? original.y + original.height
      : screen.height - original.y;
    const desired =
      Math.abs(dx / original.width) > Math.abs(dy / original.height)
        ? (right - left) / original.width
        : (bottom - top) / original.height;
    const scale = clamp(
      desired,
      Math.max(minWidth / original.width, minHeight / original.height),
      Math.min(availableW / original.width, availableH / original.height),
    );
    const width = original.width * scale,
      height = original.height * scale;
    left = handle.includes('w') ? original.x + original.width - width : original.x;
    top = handle.includes('n') ? original.y + original.height - height : original.y;
    right = left + width;
    bottom = top + height;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function scaleWidgets(widgets: Widget[], original: Rect, target: Rect): Widget[] {
  const sx = target.width / original.width,
    sy = target.height / original.height;
  return widgets.map((widget) => ({
    ...widget,
    x: target.x + (widget.x - original.x) * sx,
    y: target.y + (widget.y - original.y) * sy,
    width: widget.width * sx,
    height: widget.height * sy,
  }));
}
export function selectionUnits(widgets: Widget[]): Widget[][] {
  const units = new Map<string, Widget[]>();
  for (const widget of widgets) {
    const key = widget.groupId ?? widget.id;
    units.set(key, [...(units.get(key) ?? []), widget]);
  }
  return [...units.values()];
}
export function alignWidgets(widgets: Widget[], alignment: Alignment, screen: Rect): Widget[] {
  const units = selectionUnits(widgets),
    target = units.length > 1 ? boundsOf(widgets)! : screen;
  return units.flatMap((unit) => {
    const box = boundsOf(unit)!;
    const dx =
      alignment === 'left'
        ? target.x - box.x
        : alignment === 'center'
          ? target.x + (target.width - box.width) / 2 - box.x
          : alignment === 'right'
            ? target.x + target.width - box.x - box.width
            : 0;
    const dy =
      alignment === 'top'
        ? target.y - box.y
        : alignment === 'middle'
          ? target.y + (target.height - box.height) / 2 - box.y
          : alignment === 'bottom'
            ? target.y + target.height - box.y - box.height
            : 0;
    return moveWidgets(unit, dx, dy, screen);
  });
}
export function distributeWidgets(
  widgets: Widget[],
  axis: 'horizontal' | 'vertical',
  screen: Rect,
): Widget[] {
  const horizontal = axis === 'horizontal';
  const units = selectionUnits(widgets)
    .map((items) => ({ items, box: boundsOf(items)! }))
    .sort((a, b) => (horizontal ? a.box.x - b.box.x : a.box.y - b.box.y));
  if (units.length < 3) return widgets;
  const first = units[0].box,
    last = units.at(-1)!.box;
  const totalSize = units.reduce(
    (sum, unit) => sum + (horizontal ? unit.box.width : unit.box.height),
    0,
  );
  const extent = horizontal ? last.x + last.width - first.x : last.y + last.height - first.y;
  const gap = (extent - totalSize) / (units.length - 1);
  let cursor = horizontal ? first.x : first.y;
  return units.flatMap((unit) => {
    const result = moveWidgets(
      unit.items,
      horizontal ? cursor - unit.box.x : 0,
      horizontal ? 0 : cursor - unit.box.y,
      screen,
    );
    cursor += (horizontal ? unit.box.width : unit.box.height) + gap;
    return result;
  });
}

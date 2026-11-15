import type { Widget } from '../../model/src';
import { boundsOf, moveWidgets, type Rect, type ResizeHandle } from './geometry';
export const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
export function rotationTrig(angle: number) {
  const radians = (angle * Math.PI) / 180;
  const clean = (value: number) =>
    Math.abs(value) < 1e-10 ? 0 : Math.abs(Math.abs(value) - 1) < 1e-10 ? Math.sign(value) : value;
  return { cos: clean(Math.cos(radians)), sin: clean(Math.sin(radians)) };
}
/** Retain legacy quarter-turn dimensions; free rotations fit logical content in the outer frame. */
export function widgetContentSize(
  widget: Pick<Widget, 'width' | 'height' | 'rotation'> & { rotationSize?: Widget['rotationSize'] },
) {
  if (!widget.rotationSize && widget.rotation % 90 === 0)
    return widget.rotation % 180 === 0
      ? { width: widget.width, height: widget.height }
      : { width: widget.height, height: widget.width };
  const { cos, sin } = rotationTrig(widget.rotation),
    ratio =
      (widget.rotationSize?.width ?? widget.width) / (widget.rotationSize?.height ?? widget.height);
  const height = Math.min(
    widget.width / (Math.abs(cos) * ratio + Math.abs(sin)),
    widget.height / (Math.abs(sin) * ratio + Math.abs(cos)),
  );
  return { width: ratio * height, height };
}
/** Always derive a gesture from its originals, avoiding cumulative bounding-box growth. */
export function rotateWidgetsBy(widgets: Widget[], delta: number, screen: Rect): Widget[] {
  if (!Number.isFinite(delta)) throw new Error('Enter a finite rotation angle.');
  const bounds = boundsOf(widgets);
  if (!bounds || Math.abs(normalizeAngle(delta)) < 1e-10) return structuredClone(widgets);
  const frame = selectionFrame(widgets)!;
  const cx = frame.x + frame.width / 2,
    cy = frame.y + frame.height / 2;
  const { cos, sin } = rotationTrig(delta);
  const rotated = widgets.map((widget) => {
    const logical = widgetContentSize(widget),
      rotation = normalizeAngle(Math.round((widget.rotation + delta) * 1000) / 1000);
    const trig = rotationTrig(rotation);
    const width = Math.abs(trig.cos) * logical.width + Math.abs(trig.sin) * logical.height;
    const height = Math.abs(trig.sin) * logical.width + Math.abs(trig.cos) * logical.height;
    const x = widget.x + widget.width / 2 - cx,
      y = widget.y + widget.height / 2 - cy;
    return {
      ...widget,
      x: cx + x * cos - y * sin - width / 2,
      y: cy + x * sin + y * cos - height / 2,
      width,
      height,
      rotation,
      rotationSize: rotation % 90 === 0 ? null : logical,
    };
  });
  const target = boundsOf(rotated)!;
  if (
    target.width > screen.width ||
    target.height > screen.height ||
    rotated.some(
      (widget) =>
        widget.width < 40 || widget.height < 30 || widget.width > 2000 || widget.height > 2000,
    )
  )
    throw new Error('The rotated selection does not fit the screen or component size limits.');
  return moveWidgets(rotated, 0, 0, screen);
}
export function rotateWidgets(widgets: Widget[], clockwise: boolean, screen: Rect) {
  return rotateWidgetsBy(widgets, clockwise ? 90 : -90, screen);
}

export interface SelectionFrame extends Rect {
  rotation: number;
}
/** Project actual content corners into the first object's axes, retaining group orientation. */
export function selectionFrame(widgets: Widget[]): SelectionFrame | null {
  if (!widgets.length) return null;
  const rotation = widgets[0].rotation,
    { cos, sin } = rotationTrig(rotation);
  const points = widgets.flatMap((widget) => {
    const size = widgetContentSize(widget),
      trig = rotationTrig(widget.rotation),
      cx = widget.x + widget.width / 2,
      cy = widget.y + widget.height / 2;
    return [-1, 1].flatMap((x) =>
      [-1, 1].map((y) => {
        const wx = cx + ((x * size.width) / 2) * trig.cos - ((y * size.height) / 2) * trig.sin;
        const wy = cy + ((x * size.width) / 2) * trig.sin + ((y * size.height) / 2) * trig.cos;
        return { x: wx * cos + wy * sin, y: -wx * sin + wy * cos };
      }),
    );
  });
  const left = Math.min(...points.map((point) => point.x)),
    top = Math.min(...points.map((point) => point.y));
  const width = Math.max(...points.map((point) => point.x)) - left,
    height = Math.max(...points.map((point) => point.y)) - top;
  const cx = (left + width / 2) * cos - (top + height / 2) * sin,
    cy = (left + width / 2) * sin + (top + height / 2) * cos;
  return { x: cx - width / 2, y: cy - height / 2, width, height, rotation };
}
/** Resize along the visible local axes and keep the opposite edge/corner anchored. */
export function resizeRotatedSelection(
  widgets: Widget[],
  handle: ResizeHandle,
  dx: number,
  dy: number,
  screen: Rect,
  aspect = false,
): Widget[] | null {
  const frame = selectionFrame(widgets);
  if (!frame) return null;
  const { cos, sin } = rotationTrig(frame.rotation),
    localX = dx * cos + dy * sin,
    localY = -dx * sin + dy * cos;
  let width = frame.width + (handle.includes('e') ? localX : handle.includes('w') ? -localX : 0);
  let height = frame.height + (handle.includes('s') ? localY : handle.includes('n') ? -localY : 0);
  if (width <= 0 || height <= 0) return null;
  // A rotated mixed group must scale uniformly: nonuniform scaling would require shear.
  if (aspect || widgets.length > 1) {
    const sx = width / frame.width,
      sy = height / frame.height;
    const scale = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
    width = frame.width * scale;
    height = frame.height * scale;
  }
  const shiftX =
    ((handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0) * (width - frame.width)) / 2;
  const shiftY =
    ((handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0) * (height - frame.height)) / 2;
  const cx = frame.x + frame.width / 2 + shiftX * cos - shiftY * sin,
    cy = frame.y + frame.height / 2 + shiftX * sin + shiftY * cos;
  const sx = width / frame.width,
    sy = height / frame.height;
  const result = widgets.map((widget) => {
    const x = widget.x + widget.width / 2 - frame.x - frame.width / 2,
      y = widget.y + widget.height / 2 - frame.y - frame.height / 2;
    const lx = (x * cos + y * sin) * sx,
      ly = (-x * sin + y * cos) * sy;
    const logical = widgetContentSize(widget),
      size = { width: logical.width * sx, height: logical.height * sy },
      trig = rotationTrig(widget.rotation);
    const w = Math.abs(trig.cos) * size.width + Math.abs(trig.sin) * size.height,
      h = Math.abs(trig.sin) * size.width + Math.abs(trig.cos) * size.height;
    return {
      ...widget,
      x: cx + lx * cos - ly * sin - w / 2,
      y: cy + lx * sin + ly * cos - h / 2,
      width: w,
      height: h,
      rotationSize: widget.rotation % 90 === 0 ? null : size,
    };
  });
  return result.some(
    (widget) =>
      widget.x < 0 ||
      widget.y < 0 ||
      widget.x + widget.width > screen.width ||
      widget.y + widget.height > screen.height ||
      widget.width < 40 ||
      widget.height < 30 ||
      widget.width > 2000 ||
      widget.height > 2000,
  )
    ? null
    : result;
}

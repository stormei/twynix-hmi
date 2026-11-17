import type { Appearance, Widget } from '../../model/src';
import { normalizeAngle, rotationTrig, widgetContentSize } from './rotation';

/** Derive presentation from the saved widget every time; never accumulate transforms. */
export function runtimeWidget(
  widget: Widget,
  appearance: Appearance | undefined,
  screen: { width: number; height: number },
): Widget {
  if (!appearance?.position && !appearance?.rotation) return widget;
  const logical = widgetContentSize(widget);
  const offset = appearance.rotation?.offsetDegrees ?? 0;
  const changedAngle = Math.abs(normalizeAngle(offset)) > 1e-10;
  const rotation = changedAngle ? normalizeAngle(widget.rotation + offset) : widget.rotation;
  const { cos, sin } = rotationTrig(rotation);
  const width = changedAngle
    ? Math.abs(cos) * logical.width + Math.abs(sin) * logical.height
    : widget.width;
  const height = changedAngle
    ? Math.abs(sin) * logical.width + Math.abs(cos) * logical.height
    : widget.height;
  const x = widget.x + widget.width / 2 - width / 2 + (appearance.position?.offsetX ?? 0);
  const y = widget.y + widget.height / 2 - height / 2 + (appearance.position?.offsetY ?? 0);
  const tolerance = 1e-7;
  if (
    ![x, y, width, height, rotation].every(Number.isFinite) ||
    x < -tolerance ||
    y < -tolerance ||
    x + width > screen.width + tolerance ||
    y + height > screen.height + tolerance
  )
    throw new Error('Behavior geometry extends outside the screen.');
  return {
    ...widget,
    x,
    y,
    width,
    height,
    rotation,
    rotationSize: changedAngle ? (rotation % 90 === 0 ? null : logical) : widget.rotationSize,
  };
}

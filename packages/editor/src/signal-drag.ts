import type { ProcessConnection, Widget } from '../../model/src';
import { freeSignalPorts } from './signals';
import { portKey, type ProcessPort } from './ports';
import { routeBetween, type RoutePoint } from './pipe-routing';

/** Only free receiving terminals on other unlocked components accept a signal drag. */
export function compatibleSignalTargets(
  source: ProcessPort,
  widgets: Widget[],
  connections: ProcessConnection[],
) {
  if (
    source.port !== 'signal-out' ||
    widgets.find((widget) => widget.id === source.widgetId)?.locked ||
    connections.some(
      (link) => portKey(link.from) === portKey(source) || portKey(link.to) === portKey(source),
    )
  )
    return [];
  const unlocked = widgets.filter((widget) => !widget.locked && widget.id !== source.widgetId);
  return freeSignalPorts(unlocked, connections).filter(
    (port) => port.port === 'signal-in' || port.port === 'actuator',
  );
}
export function nearestSignalTarget(
  point: RoutePoint,
  targets: ProcessPort[],
  zoom: number,
  radiusPixels = 18,
) {
  let nearest: ProcessPort | null = null,
    distance = radiusPixels / zoom;
  for (const target of targets) {
    const next = Math.hypot(target.x - point.x, target.y - point.y);
    if (next <= distance) {
      nearest = target;
      distance = next;
    }
  }
  return nearest;
}
/** The free end follows the pointer; a hovered receiving port uses the full connection router. */
export function previewSignalToPointer(
  source: ProcessPort,
  cursor: RoutePoint,
  widgets: Widget[],
  screen: { width: number; height: number },
) {
  const owner = widgets.find((widget) => widget.id === source.widgetId);
  const stub = {
    x: Math.max(source.x + 20, (owner ? owner.x + owner.width : source.x) + 12),
    y: source.y,
  };
  const boxes = widgets
    .filter((widget) => widget.visible)
    .map((widget) => ({
      left: widget.x - 12,
      top: widget.y - 12,
      right: widget.x + widget.width + 12,
      bottom: widget.y + widget.height + 12,
    }));
  const routed = routeBetween(stub, cursor, boxes, screen);
  return {
    points: [source, ...(routed ?? [stub, { x: cursor.x, y: stub.y }, cursor])],
    blocked: !routed,
  };
}

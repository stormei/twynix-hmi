import { rotationTrig, widgetContentSize } from './rotation';
import type { PortEndpoint, ProcessConnection, Widget } from '../../model/src';

export interface ProcessPort extends PortEndpoint {
  name: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
}
// Coordinates describe the actual SVG connection faces, including letterboxing.
export function processPorts(widget: Widget): ProcessPort[] {
  let width = 120,
    height = 120;
  let points: [PortEndpoint['port'], number, number, number, number][] = [];
  switch (widget.kind) {
    case 'tank':
      width = 180;
      height = 240;
      points = [
        ['inlet', 11, 165, -1, 0],
        ['outlet', 169, 165, 1, 0],
      ];
      break;
    case 'pump':
      width = 160;
      height = 125;
      points = [
        ['inlet', 2, 63, -1, 0],
        ['outlet', 150, 41, 1, 0],
      ];
      break;
    case 'valve':
      width = 160;
      height = 100;
      points = [
        ['inlet', 2, 52, -1, 0],
        ['outlet', 158, 52, 1, 0],
      ];
      break;
    case 'pipe':
      width = 240;
      height = 100;
      points = [
        ['inlet', 8, 50, -1, 0],
        ['outlet', 232, 50, 1, 0],
      ];
      break;
    case 'elbow':
      points = [
        ['inlet', 8, 60, -1, 0],
        ['outlet', 60, 8, 0, -1],
      ];
      break;
    case 'tee':
      points = [
        ['inlet', 8, 60, -1, 0],
        ['outlet', 112, 60, 1, 0],
        ['branch', 60, 8, 0, -1],
      ];
      break;
    case 'connector':
      points = [
        ['inlet', 8, 60, -1, 0],
        ['outlet', 112, 60, 1, 0],
      ];
      break;
  }
  const content = widgetContentSize(widget);
  const scale = Math.min(content.width / width, content.height / height);
  const { cos, sin } = rotationTrig(
    widget.rotation +
      (['elbow', 'tee', 'connector'].includes(widget.kind) ? widget.pipeRotation : 0),
  );
  return points.map(([port, x, y, dx, dy]) => ({
    name: `${widget.name} ${port}`,
    widgetId: widget.id,
    port,
    x: widget.x + widget.width / 2 + ((x - width / 2) * cos - (y - height / 2) * sin) * scale,
    y: widget.y + widget.height / 2 + ((x - width / 2) * sin + (y - height / 2) * cos) * scale,
    dx: dx * cos - dy * sin || 0,
    dy: dx * sin + dy * cos || 0,
  }));
}
export const portKey = (port: PortEndpoint) => `${port.widgetId}:${port.port}`;
export function freePorts(widgets: Widget[], connections: ProcessConnection[]) {
  const used = new Set(connections.flatMap((link) => [portKey(link.from), portKey(link.to)]));
  return widgets.flatMap(processPorts).filter((port) => !used.has(portKey(port)));
}
export function compatiblePorts(a: ProcessPort, b: ProcessPort) {
  return a.widgetId !== b.widgetId && Math.abs(a.dx + b.dx) < 1e-6 && Math.abs(a.dy + b.dy) < 1e-6;
}
/** Snap a whole selection without changing its internal spacing; tolerance is in canvas units. */
export function snapToPort(
  moving: Widget[],
  stationary: Widget[],
  connections: ProcessConnection[],
  tolerance: number,
  screen: { width: number; height: number },
) {
  let nearest: { from: ProcessPort; to: ProcessPort; distance: number } | null = null;
  for (const from of freePorts(moving, connections))
    for (const to of freePorts(stationary, connections)) {
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      if (
        !compatiblePorts(from, to) ||
        distance > tolerance ||
        (nearest && distance >= nearest.distance)
      )
        continue;
      const dx = to.x - from.x,
        dy = to.y - from.y;
      if (
        moving.some(
          (widget) =>
            widget.x + dx < 0 ||
            widget.y + dy < 0 ||
            widget.x + dx + widget.width > screen.width ||
            widget.y + dy + widget.height > screen.height,
        )
      )
        continue;
      nearest = { from, to, distance };
    }
  if (!nearest) return { widgets: moving, connection: null };
  const dx = nearest.to.x - nearest.from.x,
    dy = nearest.to.y - nearest.from.y;
  return {
    widgets: moving.map((widget) => ({ ...widget, x: widget.x + dx, y: widget.y + dy })),
    connection: { from: nearest.from, to: nearest.to },
  };
}
/** Orthogonal routing with outward stubs. This is deterministic routing, not obstacle avoidance. */
export function connectionPath(from: ProcessPort, to: ProcessPort) {
  if (Math.hypot(from.x - to.x, from.y - to.y) < 0.01) return '';
  const a = { x: from.x + from.dx * 20, y: from.y + from.dy * 20 };
  const b = { x: to.x + to.dx * 20, y: to.y + to.dy * 20 };
  let middle: string;
  if (from.dx && to.dx) {
    const x = (a.x + b.x) / 2;
    middle = `H${x} V${b.y} H${b.x}`;
  } else if (from.dy && to.dy) {
    const y = (a.y + b.y) / 2;
    middle = `V${y} H${b.x} V${b.y}`;
  } else middle = from.dx ? `H${b.x} V${b.y}` : `V${b.y} H${b.x}`;
  return `M${from.x} ${from.y} L${a.x} ${a.y} ${middle} L${to.x} ${to.y}`;
}

import { rotationTrig, widgetContentSize } from './rotation';
import type { PortEndpoint, ProcessConnection, SignalMedium, Widget } from '../../model/src';
import { portKey, type ProcessPort } from './ports';
import type { RoutePoint } from './pipe-routing';

/** Signal terminals are independent of fluid ports and use their own identities. */
export function signalPorts(widget: Widget): ProcessPort[] {
  const width = 160;
  let height = 135;
  let terminals: [PortEndpoint['port'], number, number, number, number][] = [];
  if (widget.kind === 'instrument') {
    const shared = widget.instrumentLocation === 'shared';
    terminals = [
      ['signal-in', shared ? 43 : 48, 48, -1, 0],
      ['signal-out', shared ? 117 : 112, 48, 1, 0],
    ];
  } else if (widget.kind === 'sensor') {
    height = 130;
    terminals = [['signal-out', 106, 46, 1, 0]];
  } else if (widget.kind === 'valve') {
    height = 100;
    terminals = [['actuator', 80, 8, 0, -1]];
  }
  const content = widgetContentSize(widget);
  const scale = Math.min(content.width / width, content.height / height);
  const { cos, sin } = rotationTrig(widget.rotation);
  return terminals.map(([port, x, y, dx, dy]) => ({
    widgetId: widget.id,
    port,
    name: `${widget.name} ${port === 'actuator' ? 'actuator' : port === 'signal-in' ? 'signal input' : 'signal output'}`,
    x: widget.x + widget.width / 2 + ((x - width / 2) * cos - (y - height / 2) * sin) * scale,
    y: widget.y + widget.height / 2 + ((x - width / 2) * sin + (y - height / 2) * cos) * scale,
    dx: dx * cos - dy * sin || 0,
    dy: dx * sin + dy * cos || 0,
  }));
}
export function freeSignalPorts(widgets: Widget[], connections: ProcessConnection[]) {
  const used = new Set(connections.flatMap((link) => [portKey(link.from), portKey(link.to)]));
  return widgets.flatMap(signalPorts).filter((port) => !used.has(portKey(port)));
}
/** Allow either click order, but always persist the actual signal direction. */
export function normalizeSignalEndpoints(a: PortEndpoint, b: PortEndpoint) {
  const from = a.port === 'signal-out' ? a : b.port === 'signal-out' ? b : null;
  const to = from === a ? b : a;
  return from && ['signal-in', 'actuator'].includes(to.port) && from.widgetId !== to.widgetId
    ? { from, to }
    : null;
}
export const signalStyles: Record<
  SignalMedium,
  { label: string; dash: string | null; description: string }
> = {
  electrical: { label: 'Electrical signal', dash: '8 5', description: 'Dashed line' },
  pneumatic: {
    label: 'Pneumatic signal',
    dash: null,
    description: 'Solid line with paired diagonal strokes',
  },
  digital: {
    label: 'Digital/data signal',
    dash: null,
    description: 'Solid line with hollow data-link circles',
  },
};
export function signalDecorations(points: RoutePoint[], medium: SignalMedium) {
  const slashes: string[] = [],
    circles: RoutePoint[] = [];
  if (medium === 'electrical') return { slashes, circles };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 28) continue;
    const dx = (b.x - a.x) / length,
      dy = (b.y - a.y) / length;
    const count = Math.max(1, Math.floor(length / 72));
    for (let n = 0; n < count; n++) {
      const distance = (length * (n + 1)) / (count + 1),
        x = a.x + dx * distance,
        y = a.y + dy * distance;
      if (medium === 'digital') {
        circles.push({ x, y });
        continue;
      }
      // Two parallel slashes straddle the centreline in the segment's local frame.
      for (const offset of [-3, 3]) {
        const cx = x + dx * offset,
          cy = y + dy * offset;
        slashes.push(
          `M${cx - dx * 3 - dy * 5} ${cy - dy * 3 + dx * 5} L${cx + dx * 3 + dy * 5} ${cy + dy * 3 - dx * 5}`,
        );
      }
    }
  }
  return { slashes, circles };
}

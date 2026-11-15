import type { ProcessConnection, Widget } from '../../model/src';
import { signalPorts } from './signals';
import { processPorts, portKey, type ProcessPort } from './ports';

export interface RoutePoint {
  x: number;
  y: number;
}
export interface RouteBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface PipeRoute {
  points: RoutePoint[];
  /** Insertion index for a pinned point on each rendered segment. */
  legs: number[];
  blocked: boolean;
}
const CLEARANCE = 12;
const equal = (a: RoutePoint, b: RoutePoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 0.001;
export const pointInBox = (point: RoutePoint, box: RouteBox) =>
  point.x > box.left + 0.001 &&
  point.x < box.right - 0.001 &&
  point.y > box.top + 0.001 &&
  point.y < box.bottom - 0.001;
export function segmentIsClear(a: RoutePoint, b: RoutePoint, boxes: RouteBox[]) {
  if (a.x !== b.x && a.y !== b.y) return false;
  return !boxes.some((box) =>
    a.y === b.y
      ? a.y > box.top + 0.001 &&
        a.y < box.bottom - 0.001 &&
        Math.max(a.x, b.x) > box.left + 0.001 &&
        Math.min(a.x, b.x) < box.right - 0.001
      : a.x > box.left + 0.001 &&
        a.x < box.right - 0.001 &&
        Math.max(a.y, b.y) > box.top + 0.001 &&
        Math.min(a.y, b.y) < box.bottom - 0.001,
  );
}
function simplify(points: RoutePoint[]) {
  const result: RoutePoint[] = [];
  for (const point of points) {
    if (result.length && equal(result.at(-1)!, point)) continue;
    while (result.length > 1) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if (!(
        (a.x === b.x && b.x === point.x && (b.y - a.y) * (point.y - b.y) >= 0) ||
        (a.y === b.y && b.y === point.y && (b.x - a.x) * (point.x - b.x) >= 0)
      ))
        break;
      result.pop();
    }
    result.push(point);
  }
  return result;
}
class MinHeap {
  private values: { key: number; score: number }[] = [];
  get length() {
    return this.values.length;
  }
  push(item: { key: number; score: number }) {
    const items = this.values;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].score <= item.score) break;
      items[i] = items[parent];
      i = parent;
    }
    items[i] = item;
  }
  pop() {
    const items = this.values,
      first = items[0],
      last = items.pop()!;
    if (items.length) {
      let i = 0;
      while (i * 2 + 1 < items.length) {
        let child = i * 2 + 1;
        if (child + 1 < items.length && items[child + 1].score < items[child].score) child++;
        if (items[child].score >= last.score) break;
        items[i] = items[child];
        i = child;
      }
      items[i] = last;
    }
    return first;
  }
}
/** Rectilinear visibility-grid A*: Manhattan distance plus a small bend penalty. */
export function routeBetween(
  start: RoutePoint,
  end: RoutePoint,
  boxes: RouteBox[],
  screen: { width: number; height: number },
): RoutePoint[] | null {
  if (
    [start, end].some(
      (point) =>
        point.x < 0 ||
        point.y < 0 ||
        point.x > screen.width ||
        point.y > screen.height ||
        boxes.some((box) => pointInBox(point, box)),
    )
  )
    return null;
  if (equal(start, end)) return [start];
  for (const corner of [
    { x: end.x, y: start.y },
    { x: start.x, y: end.y },
  ]) {
    if (segmentIsClear(start, corner, boxes) && segmentIsClear(corner, end, boxes))
      return simplify([start, corner, end]);
  }
  const xs = [
    ...new Set([
      0,
      screen.width,
      start.x,
      end.x,
      ...boxes.flatMap((box) => [Math.max(0, box.left), Math.min(screen.width, box.right)]),
    ]),
  ]
    .filter((x) => x >= 0 && x <= screen.width)
    .sort((a, b) => a - b);
  const ys = [
    ...new Set([
      0,
      screen.height,
      start.y,
      end.y,
      ...boxes.flatMap((box) => [Math.max(0, box.top), Math.min(screen.height, box.bottom)]),
    ]),
  ]
    .filter((y) => y >= 0 && y <= screen.height)
    .sort((a, b) => a - b);
  const pointAt = (key: number) => {
    const node = Math.floor(key / 2);
    return { x: xs[node % xs.length], y: ys[Math.floor(node / xs.length)] };
  };
  const keyAt = (x: number, y: number, direction: number) => (y * xs.length + x) * 2 + direction;
  const startX = xs.indexOf(start.x),
    startY = ys.indexOf(start.y);
  const heap = new MinHeap(),
    cost = new Map<number, number>(),
    previous = new Map<number, number>(),
    closed = new Set<number>();
  for (const direction of [0, 1]) {
    const key = keyAt(startX, startY, direction);
    cost.set(key, 0);
    heap.push({ key, score: Math.abs(start.x - end.x) + Math.abs(start.y - end.y) });
  }
  // Bound interactive work for pathological diagrams; callers visibly flag an unresolved route.
  while (heap.length && closed.size < 20000) {
    const { key } = heap.pop();
    if (closed.has(key)) continue;
    closed.add(key);
    const point = pointAt(key),
      node = Math.floor(key / 2),
      x = node % xs.length,
      y = Math.floor(node / xs.length);
    if (equal(point, end)) {
      const route = [point];
      let cursor = key;
      while (previous.has(cursor)) {
        cursor = previous.get(cursor)!;
        route.push(pointAt(cursor));
      }
      return simplify(route.reverse());
    }
    for (const [nx, ny, direction] of [
      [x - 1, y, 0],
      [x + 1, y, 0],
      [x, y - 1, 1],
      [x, y + 1, 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue;
      const nextKey = keyAt(nx, ny, direction),
        next = { x: xs[nx], y: ys[ny] };
      if (closed.has(nextKey) || !segmentIsClear(point, next, boxes)) continue;
      const nextCost =
        cost.get(key)! +
        Math.abs(point.x - next.x) +
        Math.abs(point.y - next.y) +
        (key % 2 === direction ? 0 : 16);
      if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue;
      cost.set(nextKey, nextCost);
      previous.set(nextKey, key);
      heap.push({
        key: nextKey,
        score: nextCost + Math.abs(next.x - end.x) + Math.abs(next.y - end.y),
      });
    }
  }
  return null;
}
function portStub(port: ProcessPort, widget: Widget) {
  // Orthogonal pipes leave a rotated terminal along its nearest cardinal direction.
  const horizontal = Math.abs(port.dx) >= Math.abs(port.dy);
  const dx = horizontal ? Math.sign(port.dx) : 0,
    dy = horizontal ? 0 : Math.sign(port.dy);
  return {
    x:
      dx < 0
        ? Math.min(port.x - 20, widget.x - CLEARANCE)
        : dx > 0
          ? Math.max(port.x + 20, widget.x + widget.width + CLEARANCE)
          : port.x,
    y:
      dy < 0
        ? Math.min(port.y - 20, widget.y - CLEARANCE)
        : dy > 0
          ? Math.max(port.y + 20, widget.y + widget.height + CLEARANCE)
          : port.y,
  };
}
export function routeConnection(
  link: ProcessConnection,
  widgets: Widget[],
  screen: { width: number; height: number },
): PipeRoute {
  const fromWidget = widgets.find((widget) => widget.id === link.from.widgetId),
    toWidget = widgets.find((widget) => widget.id === link.to.widgetId);
  if (!fromWidget || !toWidget) return { points: [], legs: [], blocked: true };
  const portsFor = link.medium && link.medium !== 'process' ? signalPorts : processPorts;
  const from = portsFor(fromWidget).find((port) => portKey(port) === portKey(link.from)),
    to = portsFor(toWidget).find((port) => portKey(port) === portKey(link.to));
  if (!from || !to) return { points: [], legs: [], blocked: true };
  const pins = link.bendPoints ?? [];
  if (equal(from, to) && !pins.length) return { points: [], legs: [], blocked: false };
  const boxes = widgets
    .filter((widget) => widget.visible)
    .map((widget) => ({
      left: widget.x - CLEARANCE,
      top: widget.y - CLEARANCE,
      right: widget.x + widget.width + CLEARANCE,
      bottom: widget.y + widget.height + CLEARANCE,
    }));
  const start = portStub(from, fromWidget),
    end = portStub(to, toWidget);
  // Endpoint stubs may pass through their own symbol, but no unrelated object.
  const otherBoxes = widgets
    .filter((widget) => widget.visible && widget.id !== fromWidget.id && widget.id !== toWidget.id)
    .map((widget) => ({
      left: widget.x - CLEARANCE,
      top: widget.y - CLEARANCE,
      right: widget.x + widget.width + CLEARANCE,
      bottom: widget.y + widget.height + CLEARANCE,
    }));
  if (
    !pins.length &&
    from.dx === -to.dx &&
    from.dy === -to.dy &&
    ((from.y === to.y && (to.x - from.x) * from.dx > 0) ||
      (from.x === to.x && (to.y - from.y) * from.dy > 0)) &&
    segmentIsClear(from, to, otherBoxes)
  )
    return { points: [from, to], legs: [0], blocked: false };
  let blocked = !segmentIsClear(from, start, otherBoxes) || !segmentIsClear(end, to, otherBoxes);
  const stops = [start, ...pins, end],
    points: RoutePoint[] = [from, start],
    legs = [0];
  for (let i = 1; i < stops.length; i++) {
    const part = routeBetween(stops[i - 1], stops[i], boxes, screen);
    if (!part) blocked = true;
    const fallback = [stops[i - 1], { x: stops[i].x, y: stops[i - 1].y }, stops[i]];
    for (const point of (part ?? simplify(fallback)).slice(1)) {
      if (equal(points.at(-1)!, point)) continue;
      points.push(point);
      legs.push(i - 1);
    }
  }
  if (!equal(points.at(-1)!, to)) {
    points.push(to);
    legs.push(pins.length);
  }
  return { points, legs, blocked };
}
export function routePath(points: RoutePoint[]) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
}

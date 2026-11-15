import type { RoutePoint } from './pipe-routing';

interface BridgeRoute {
  link: { id: string; medium?: string };
  points: RoutePoint[];
}
interface Span {
  start: number;
  end: number;
}
interface Jump extends Span {
  side: number;
}
export interface BridgeObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}
const RADIUS = 14;
const GAP = 21;
const near = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** Remove zero-length and collinear subdivisions for crossing geometry only.
 * Saved pins and the editable route stay unchanged. */
function crossingPoints(points: RoutePoint[]) {
  const result: RoutePoint[] = [];
  for (const point of points) {
    if (result.length && near(point.x, result.at(-1)!.x) && near(point.y, result.at(-1)!.y))
      continue;
    while (result.length > 1) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if (!(
        (near(a.x, b.x) && near(b.x, point.x) && (b.y - a.y) * (point.y - b.y) >= 0) ||
        (near(a.y, b.y) && near(b.y, point.y) && (b.x - a.x) * (point.x - b.x) >= 0)
      ))
        break;
      result.pop();
    }
    result.push(point);
  }
  return result;
}
function mergeSpans(spans: Span[]): Span[] {
  const result: Span[] = [];
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && span.start <= last.end + 2) last.end = Math.max(last.end, span.end);
    else result.push({ ...span });
  }
  return result;
}
function cubicPoint(
  start: RoutePoint,
  end: RoutePoint,
  horizontal: boolean,
  side: number,
  t: number,
) {
  // Both control points are offset by 4/3 of the desired arch height.
  const offset = (side * RADIUS * 4) / 3;
  const c1 = { x: start.x + (horizontal ? 0 : offset), y: start.y + (horizontal ? offset : 0) };
  const c2 = { x: end.x + (horizontal ? 0 : offset), y: end.y + (horizontal ? offset : 0) };
  const u = 1 - t;
  return {
    x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
    y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
  };
}
function clearArch(
  start: RoutePoint,
  end: RoutePoint,
  horizontal: boolean,
  side: number,
  obstacles: BridgeObstacle[],
  screen: { width: number; height: number },
) {
  for (let i = 0; i <= 20; i++) {
    const p = cubicPoint(start, end, horizontal, side, i / 20);
    if (
      p.x < 8 ||
      p.y < 8 ||
      p.x > screen.width - 8 ||
      p.y > screen.height - 8 ||
      obstacles.some(
        (box) =>
          p.x > box.x - 8 &&
          p.x < box.x + box.width + 8 &&
          p.y > box.y - 8 &&
          p.y < box.y + box.height + 8,
      )
    )
      return false;
  }
  return true;
}
/** Derive crossing notation without changing endpoints, pins or connection topology.
 * Later connections cross over earlier ones. Only strict interior perpendicular
 * intersections count: equipment ports, bends and tee junctions are not bridges. */
export function buildPipeBridges<T extends BridgeRoute>(
  routes: T[],
  obstacles: BridgeObstacle[],
  screen: { width: number; height: number },
) {
  const geometry = routes.map((route) => crossingPoints(route.points));
  const gaps = geometry.map((points) => points.slice(1).map(() => [] as Span[]));
  const crossings = geometry.map((points) => points.slice(1).map(() => [] as number[]));
  const counts = routes.map(() => 0);
  for (let upper = 1; upper < routes.length; upper++)
    for (let lower = 0; lower < upper; lower++) {
      if (
        [routes[upper], routes[lower]].some(
          (route) => route.link.medium && route.link.medium !== 'process',
        )
      )
        continue;
      for (let i = 1; i < geometry[upper].length; i++)
        for (let j = 1; j < geometry[lower].length; j++) {
          const a = geometry[upper][i - 1],
            b = geometry[upper][i],
            c = geometry[lower][j - 1],
            d = geometry[lower][j];
          const horizontal = near(a.y, b.y),
            lowerHorizontal = near(c.y, d.y);
          if (horizontal === lowerHorizontal) continue;
          const point = horizontal ? { x: c.x, y: a.y } : { x: a.x, y: c.y };
          const upperDistance = Math.abs(point.x - a.x) + Math.abs(point.y - a.y),
            lowerDistance = Math.abs(point.x - c.x) + Math.abs(point.y - c.y);
          const upperLength = Math.abs(b.x - a.x) + Math.abs(b.y - a.y),
            lowerLength = Math.abs(d.x - c.x) + Math.abs(d.y - c.y);
          const inside = (p: RoutePoint, p1: RoutePoint, p2: RoutePoint) =>
            p.x >= Math.min(p1.x, p2.x) &&
            p.x <= Math.max(p1.x, p2.x) &&
            p.y >= Math.min(p1.y, p2.y) &&
            p.y <= Math.max(p1.y, p2.y);
          if (
            !inside(point, a, b) ||
            !inside(point, c, d) ||
            upperDistance < 6 ||
            lowerDistance < 6 ||
            upperLength - upperDistance < 6 ||
            lowerLength - lowerDistance < 6
          )
            continue;
          crossings[upper][i - 1].push(upperDistance);
          gaps[lower][j - 1].push({
            start: Math.max(1, lowerDistance - GAP),
            end: Math.min(lowerLength - 1, lowerDistance + GAP),
          });
          counts[upper]++;
        }
    }
  return routes.map((route, routeIndex) => {
    const points = geometry[routeIndex],
      arches: string[] = [];
    let path = points.length ? `M${points[0].x} ${points[0].y}` : '';
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        horizontal = near(a.y, b.y);
      const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (length < 0.001) continue;
      const dx = (b.x - a.x) / length,
        dy = (b.y - a.y) / length;
      const at = (distance: number) => ({ x: a.x + dx * distance, y: a.y + dy * distance });
      const hidden = mergeSpans(gaps[routeIndex][i - 1]);
      const jumps: Jump[] = [];
      const spans = mergeSpans(
        crossings[routeIndex][i - 1].map((distance) => ({
          start: Math.max(1, distance - RADIUS),
          end: Math.min(length - 1, distance + RADIUS),
        })),
      );
      for (const span of spans) {
        if (
          span.end - span.start < 16 ||
          hidden.some((gap) => span.start < gap.end && span.end > gap.start)
        )
          continue;
        const start = at(span.start),
          end = at(span.end);
        const preferredSide = horizontal ? -1 : 1;
        const side = [preferredSide, -preferredSide].find((side) =>
          clearArch(start, end, horizontal, side, obstacles, screen),
        );
        if (side) jumps.push({ ...span, side });
        // A gap in the lower line still denotes separation when an arch cannot fit.
      }
      const events = [...hidden.map((span) => ({ ...span, side: 0 })), ...jumps].sort(
        (a, b) => a.start - b.start,
      );
      for (const event of events) {
        const start = at(event.start),
          end = at(event.end);
        path += ` L${start.x} ${start.y}`;
        if (!event.side) {
          path += ` M${end.x} ${end.y}`;
          continue;
        }
        const offset = (event.side * RADIUS * 4) / 3;
        const curve = `C${start.x + (horizontal ? 0 : offset)} ${start.y + (horizontal ? offset : 0)} ${end.x + (horizontal ? 0 : offset)} ${end.y + (horizontal ? offset : 0)} ${end.x} ${end.y}`;
        arches.push(`M${start.x} ${start.y} ${curve}`);
        path += ` ${curve}`;
      }
      path += ` L${b.x} ${b.y}`;
    }
    return { ...route, path, bridgePaths: arches, crossingCount: counts[routeIndex] };
  });
}

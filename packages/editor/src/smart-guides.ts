import { type Rect } from './geometry';

export interface Guide {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
}
export interface Spacing {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  distance: number;
  equal?: boolean;
}
const anchors = (start: number, size: number) => [start, start + size / 2, start + size];

/** Match edges/centres in target pixels; tolerance is supplied in zoom-adjusted pixels. */
export function smartAlignment(
  box: Rect,
  others: Rect[],
  screen: Rect,
  tolerance: number,
  axes = { x: true, y: true },
) {
  const guides: Guide[] = [];
  const offset = { x: 0, y: 0 };
  for (const axis of ['x', 'y'] as const) {
    if (!axes[axis]) continue;
    const size = axis === 'x' ? 'width' : 'height';
    const cross = axis === 'x' ? 'y' : 'x';
    const crossSize = axis === 'x' ? 'height' : 'width';
    let best = tolerance + 1;
    let matches: { target: Rect; position: number; delta: number }[] = [];
    for (const target of [...others, screen]) {
      for (const position of anchors(target[axis], target[size])) {
        for (const source of anchors(box[axis], box[size])) {
          const delta = position - source;
          if (
            Math.abs(delta) > tolerance ||
            box[axis] + delta < 0 ||
            box[axis] + delta + box[size] > screen[size]
          )
            continue;
          if (Math.abs(delta) < best - 0.001) {
            best = Math.abs(delta);
            matches = [];
          }
          if (Math.abs(Math.abs(delta) - best) < 0.001) matches.push({ target, position, delta });
        }
      }
    }
    if (!matches.length) continue;
    offset[axis] = matches[0].delta;
    for (const match of matches.filter((item) => Math.abs(item.delta - offset[axis]) < 0.001)) {
      if (guides.some((g) => g.axis === axis && g.position === match.position)) continue;
      guides.push({
        axis,
        position: match.position,
        start: Math.min(box[cross], match.target[cross]),
        end: Math.max(box[cross] + box[crossSize], match.target[cross] + match.target[crossSize]),
      });
    }
  }
  return { offset, guides };
}

/** Show the nearest non-overlapping neighbour in each direction, without diagonal noise. */
export function spacingIndicators(box: Rect, others: Rect[]): Spacing[] {
  const result: Spacing[] = [];
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'width' : 'height';
    const cross = axis === 'x' ? 'y' : 'x';
    const crossSize = axis === 'x' ? 'height' : 'width';
    for (const direction of [-1, 1]) {
      const candidates = others.filter(
        (other) =>
          Math.min(box[cross] + box[crossSize], other[cross] + other[crossSize]) >
            Math.max(box[cross], other[cross]) &&
          (direction < 0
            ? other[axis] + other[size] <= box[axis]
            : other[axis] >= box[axis] + box[size]),
      );
      candidates.sort((a, b) =>
        direction < 0 ? b[axis] + b[size] - a[axis] - a[size] : a[axis] - b[axis],
      );
      const other = candidates[0];
      if (!other) continue;
      const start = direction < 0 ? other[axis] + other[size] : box[axis] + box[size];
      const end = direction < 0 ? box[axis] : other[axis];
      if (end - start < 0.5) continue;
      const mid =
        (Math.max(box[cross], other[cross]) +
          Math.min(box[cross] + box[crossSize], other[cross] + other[crossSize])) /
        2;
      result.push(
        axis === 'x'
          ? { x1: start, x2: end, y1: mid, y2: mid, distance: end - start }
          : { x1: mid, x2: mid, y1: start, y2: end, distance: end - start },
      );
    }
  }
  return result;
}

/** Snap between two neighbours, or repeat an adjacent pair's gap at either end. */
export function equalSpacing(
  box: Rect,
  others: Rect[],
  screen: Rect,
  tolerance: number,
  axes = { x: true, y: true },
) {
  const offset = { x: 0, y: 0 };
  const matched = { x: false, y: false };
  const indicators: Spacing[] = [];
  for (const axis of ['x', 'y'] as const) {
    if (!axes[axis]) continue;
    const size = axis === 'x' ? 'width' : 'height';
    const cross = axis === 'x' ? 'y' : 'x';
    const crossSize = axis === 'x' ? 'height' : 'width';
    const lane = others
      .filter(
        (other) =>
          Math.min(box[cross] + box[crossSize], other[cross] + other[crossSize]) >
          Math.max(box[cross], other[cross]),
      )
      .sort((a, b) => a[axis] - b[axis]);
    let best = tolerance + 0.001;
    let hints: Spacing[] = [];
    const measure = (a: Rect, b: Rect): Spacing => {
      const start = a[axis] + a[size],
        end = b[axis];
      const mid =
        (Math.max(a[cross], b[cross]) +
          Math.min(a[cross] + a[crossSize], b[cross] + b[crossSize])) /
        2;
      return {
        x1: axis === 'x' ? start : mid,
        y1: axis === 'y' ? start : mid,
        x2: axis === 'x' ? end : mid,
        y2: axis === 'y' ? end : mid,
        distance: end - start,
        equal: true,
      };
    };
    const consider = (position: number, pair: (placed: Rect) => Spacing[]) => {
      const delta = position - box[axis];
      if (position < 0 || position + box[size] > screen[size] || Math.abs(delta) >= best) return;
      // Never snap into another symbol or across an intervening neighbour.
      if (
        lane.some(
          (other) =>
            position < other[axis] + other[size] - 0.001 &&
            position + box[size] > other[axis] + 0.001,
        )
      )
        return;
      const candidateHints = pair({ ...box, [axis]: position });
      if (
        candidateHints.some((hint) =>
          lane.some((other) => {
            const start = axis === 'x' ? hint.x1 : hint.y1;
            const end = axis === 'x' ? hint.x2 : hint.y2;
            return other[axis] < end - 0.001 && other[axis] + other[size] > start + 0.001;
          }),
        )
      )
        return;
      best = Math.abs(delta);
      offset[axis] = delta;
      matched[axis] = true;
      hints = candidateHints;
    };
    for (let i = 0; i < lane.length - 1; i++) {
      const a = lane[i],
        b = lane[i + 1];
      // A common lane is required for the whole three-symbol chain.
      if (
        Math.min(a[cross] + a[crossSize], b[cross] + b[crossSize], box[cross] + box[crossSize]) <=
        Math.max(a[cross], b[cross], box[cross])
      )
        continue;
      const gap = b[axis] - a[axis] - a[size];
      if (gap <= 0) continue;
      if (gap > box[size]) {
        consider(a[axis] + a[size] + (gap - box[size]) / 2, (placed) => [
          measure(a, placed),
          measure(placed, b),
        ]);
      }
      consider(b[axis] + b[size] + gap, (placed) => [measure(a, b), measure(b, placed)]);
      consider(a[axis] - gap - box[size], (placed) => [measure(placed, a), measure(a, b)]);
    }
    indicators.push(...hints);
  }
  return { offset, matched, indicators };
}

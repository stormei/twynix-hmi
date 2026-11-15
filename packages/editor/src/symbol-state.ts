import type { WidgetKind } from '../../model/src';

/** A numeric/boolean process value is active only while its quality is usable. */
export function equipmentState(kind: WidgetKind, value: unknown, quality: string) {
  const numeric =
    typeof value === 'number' || typeof value === 'boolean'
      ? Number(value)
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  const usable = Number.isFinite(numeric) && ['good', 'simulation'].includes(quality);
  const active = usable && numeric > 0;
  const label = !usable
    ? 'N/A'
    : kind === 'pipe'
      ? active
        ? 'FLOW'
        : 'NO FLOW'
      : kind === 'sensor'
        ? active
          ? 'ACTIVE'
          : 'INACTIVE'
        : active
          ? 'RUN'
          : 'STOP';
  return { usable, active, label };
}

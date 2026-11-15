import type { SymbolStyle, Widget } from '../../model/src';
import { equipmentState } from './symbol-state';

export function displayAccent(style: SymbolStyle, color: string, value: unknown, quality: string) {
  const state = equipmentState('motor', value, quality);
  if (!state.usable) return '#8a959f';
  if (style === 'industrial') return state.active ? color : '#9baeb0';
  // An explicit appearance binding or chosen condition colour remains meaningful.
  if (color.toLowerCase() !== '#329c8c') return color;
  return state.active ? '#43525e' : '#8a959f';
}
export function operatingRange(value: unknown, quality: string, range: Widget['operatingRange']) {
  const state = equipmentState('motor', value, quality);
  if (!range || !state.usable)
    return { position: 0, normalStart: 0, normalWidth: 0, label: 'N/A', outside: false };
  const scale = (v: number) => Math.max(0, Math.min(1, (v - range.min) / (range.max - range.min)));
  const numeric = Number(value),
    label = numeric < range.normalLow ? 'LOW' : numeric > range.normalHigh ? 'HIGH' : 'NORMAL';
  return {
    position: scale(numeric),
    normalStart: scale(range.normalLow),
    normalWidth: scale(range.normalHigh) - scale(range.normalLow),
    label,
    outside: label !== 'NORMAL',
  };
}

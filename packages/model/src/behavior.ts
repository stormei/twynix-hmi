import type { WidgetKind, BehaviorConfig, Widget } from './index';

export type Appearance = {
  text?: string;
  color?: string;
  position?: { offsetX: number; offsetY: number };
  rotation?: { offsetDegrees: number };
};
const both = ['text', 'color', 'position', 'rotation'] as const;
const text = ['text', 'position', 'rotation'] as const;
const geometry = ['position', 'rotation'] as const;
/** Semantic properties actually consumed by the current widget renderers. */
export const behaviorCapabilities = {
  tank: both,
  pump: both,
  valve: both,
  value: both,
  label: both,
  button: both,
  trend: both,
  motor: both,
  fan: both,
  pipe: both,
  conveyor: both,
  sensor: both,
  elbow: ['color', ...geometry],
  tee: ['color', ...geometry],
  connector: ['color', ...geometry],
  instrument: both,
  chart: both,
  gauge: both,
  sparkline: both,
  'linear-gauge': both,
  dropdown: text,
  slider: text,
  radio: text,
  toggle: text,
  segmented: text,
  markdown: geometry,
  iframe: geometry,
  html: geometry,
} satisfies Record<WidgetKind, readonly (keyof Appearance)[]>;

export function behaviorConfigurationError(widget: {
  kind: WidgetKind;
  behaviorConfig?: BehaviorConfig;
  propertyBindings: Widget['propertyBindings'];
}): string | undefined {
  if (widget.behaviorConfig?.resultMode !== 'appearance') return;
  for (const output of widget.behaviorConfig.outputs) {
    if (!(behaviorCapabilities[widget.kind] as readonly string[]).includes(output))
      return `${widget.kind} does not support behavior output ${output}.`;
    if ((output === 'text' || output === 'color') && widget.propertyBindings[output]?.enabled)
      return `${output} already has an enabled property binding.`;
  }
}

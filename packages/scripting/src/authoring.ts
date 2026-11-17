import {
  behaviorConfigSchema,
  behaviorConfigurationError,
  bindingKey,
  widgetBindings,
  widgetSchema,
  propertyBinding,
  type BehaviorConfig,
  type Screen,
  type Widget,
} from '../../model/src';
import type { ScriptInput, ScriptContext } from './evaluate';

export function behaviorDraft(
  widget: Widget,
  source: string,
  configuration: unknown,
  screen: Screen,
) {
  const config = behaviorConfigSchema.parse(configuration);
  const candidate = widgetSchema.parse({ ...widget, behavior: source, behaviorConfig: config });
  const error = behaviorConfigurationError(candidate);
  if (error) throw new Error(error);
  const bindings = screen.widgets.flatMap((item) =>
    widgetBindings(item.id === widget.id ? candidate : item),
  );
  if (new Set(bindings.map(bindingKey)).size > 100)
    throw new Error(
      'This screen exceeds 100 distinct ThingsBoard bindings. Remove unused bindings before applying.',
    );
  return { source: candidate.behavior, config };
}
export function parseSample(text: string): ScriptInput['value'] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length <= 4000)
  )
    return value;
  throw new Error(
    'Sample values must be JSON numbers, booleans, null, or text up to 4,000 characters.',
  );
}
/** Live authoring never borrows an offline/demo primary value. Constants remain explicit configuration. */
export function liveAuthoringContext(
  widget: Widget,
  resolved: ScriptContext,
  inputs: Record<string, ScriptInput>,
  authenticated: boolean,
): ScriptContext {
  const definition = propertyBinding(widget, 'value');
  if (definition?.enabled && definition.type === 'constant')
    return { value: definition.value, quality: 'good', name: widget.name, inputs };
  const hasSource = definition?.enabled && definition.type !== 'constant' && definition.source;
  if (authenticated && hasSource && resolved.quality !== 'simulation')
    return { value: resolved.value, quality: resolved.quality, name: widget.name, inputs };
  return { value: null, quality: 'unknown', name: widget.name, inputs };
}

export type TemplateParameter = {
  key: string;
  label: string;
  type: 'number' | 'color' | 'text';
  value: number | string;
  min?: number;
  max?: number;
  integer?: boolean;
};
export interface BehaviorTemplate {
  id: string;
  version: number;
  name: string;
  description: string;
  inputs: string[];
  outputs: BehaviorConfig['outputs'];
  parameters: TemplateParameter[];
  body: string;
}
const usable =
  'const usable = (...samples) => samples.every(sample => sample && sample.quality === "good" && sample.value !== null);\n';
// ThingsBoard can transport numeric telemetry as strings; reject booleans/empty text.
const numeric =
  'const numericValue = sample => { if (!usable(sample) || (typeof sample.value !== "number" && (typeof sample.value !== "string" || !sample.value.trim()))) return null; const value = Number(sample.value); return Number.isFinite(value) ? value : null; };\nconst numeric = sample => numericValue(sample) !== null;\n';
export const behaviorTemplates: readonly BehaviorTemplate[] = [
  {
    id: 'threshold-color',
    version: 1,
    name: 'Threshold color',
    description: 'Change accent when a numeric input exceeds a threshold.',
    inputs: ['value'],
    outputs: ['color'],
    parameters: [
      { key: 'threshold', label: 'Threshold', type: 'number', value: 75 },
      { key: 'normal', label: 'Normal color', type: 'color', value: '#329c8c' },
      { key: 'alarm', label: 'High color', type: 'color', value: '#da8054' },
    ],
    body:
      numeric +
      'return {color: !numeric(inputs.value) ? "#808080" : numericValue(inputs.value) > parameters.threshold ? parameters.alarm : parameters.normal};',
  },
  {
    id: 'equipment-state',
    version: 1,
    name: 'Equipment state',
    description: 'Combine running and fault inputs into status text and color.',
    inputs: ['running', 'fault'],
    outputs: ['text', 'color'],
    parameters: [],
    body: 'if (!usable(inputs.running,inputs.fault)) return {text:"Unavailable",color:"#808080"};\nconst logical = value => value === true || value === "true" || value === 1 || value === "1" ? true : value === false || value === "false" || value === 0 || value === "0" ? false : null;\nconst running = logical(inputs.running.value), fault = logical(inputs.fault.value);\nif (running === null || fault === null) throw new Error("Running and fault must be boolean or 0/1 inputs.");\nreturn fault ? {text:"Fault",color:"#da8054"} : running ? {text:"Running",color:"#329c8c"} : {text:"Stopped",color:"#808080"};',
  },
  {
    id: 'formatted-text',
    version: 1,
    name: 'Formatted telemetry',
    description: 'Format a numeric signal with a decimal count and suffix.',
    inputs: ['value'],
    outputs: ['text'],
    parameters: [
      {
        key: 'decimals',
        label: 'Decimal places (0–6)',
        type: 'number',
        value: 1,
        min: 0,
        max: 6,
        integer: true,
      },
      { key: 'suffix', label: 'Suffix', type: 'text', value: ' °C' },
    ],
    body:
      numeric +
      'if (!Number.isInteger(parameters.decimals) || parameters.decimals < 0 || parameters.decimals > 6) throw new Error("Decimal places must be 0–6.");\nreturn {text:numeric(inputs.value) ? numericValue(inputs.value).toFixed(parameters.decimals) + parameters.suffix : "Unavailable"};',
  },
  {
    id: 'multi-input-label',
    version: 1,
    name: 'Two-input label',
    description: 'Combine two quality-aware telemetry values.',
    inputs: ['primary', 'secondary'],
    outputs: ['text'],
    parameters: [{ key: 'separator', label: 'Separator', type: 'text', value: ' / ' }],
    body: 'return {text:usable(inputs.primary,inputs.secondary) ? String(inputs.primary.value) + parameters.separator + String(inputs.secondary.value) : "Unavailable"};',
  },
  {
    id: 'linear-position',
    version: 1,
    name: 'Linear movement',
    description: 'Map a numeric range to clamped horizontal/vertical offsets.',
    inputs: ['value'],
    outputs: ['position'],
    parameters: [
      { key: 'minimum', label: 'Input minimum', type: 'number', value: 0 },
      { key: 'maximum', label: 'Input maximum', type: 'number', value: 100 },
      { key: 'offsetX', label: 'Horizontal travel (pixels)', type: 'number', value: 200 },
      { key: 'offsetY', label: 'Vertical travel (pixels)', type: 'number', value: 0 },
    ],
    body:
      numeric +
      'if (!numeric(inputs.value)) return {};\nif (parameters.maximum <= parameters.minimum) throw new Error("Input maximum must exceed minimum.");\nconst fraction = helpers.clamp((numericValue(inputs.value)-parameters.minimum)/(parameters.maximum-parameters.minimum),0,1);\nreturn {position:{offsetX:fraction*parameters.offsetX,offsetY:fraction*parameters.offsetY}};',
  },
  {
    id: 'valve-rotation',
    version: 1,
    name: 'Position to rotation',
    description: 'Map a numeric range to a clamped angular offset.',
    inputs: ['value'],
    outputs: ['rotation'],
    parameters: [
      { key: 'minimum', label: 'Input minimum', type: 'number', value: 0 },
      { key: 'maximum', label: 'Input maximum', type: 'number', value: 100 },
      { key: 'degrees', label: 'Angular travel (degrees)', type: 'number', value: 90 },
    ],
    body:
      numeric +
      'if (!numeric(inputs.value)) return {};\nif (parameters.maximum <= parameters.minimum) throw new Error("Input maximum must exceed minimum.");\nreturn {rotation:{offsetDegrees:helpers.clamp((numericValue(inputs.value)-parameters.minimum)/(parameters.maximum-parameters.minimum),0,1)*parameters.degrees}};',
  },
  {
    id: 'quality-fallback',
    version: 1,
    name: 'Quality-aware indication',
    description: 'Show unavailable data explicitly with a neutral accent.',
    inputs: ['value'],
    outputs: ['text', 'color'],
    parameters: [{ key: 'color', label: 'Available color', type: 'color', value: '#329c8c' }],
    body: 'return usable(inputs.value) ? {text:String(inputs.value.value),color:parameters.color} : {text:"Unavailable",color:"#808080"};',
  },
];

/** Copy-in source; no remote imports or mutable runtime library references. */
export function instantiateTemplate(
  template: BehaviorTemplate,
  aliases: Record<string, string>,
  values: Record<string, string | number>,
) {
  const parameters: Record<string, string | number> = {};
  for (const parameter of template.parameters) {
    const value = values[parameter.key] ?? parameter.value;
    if (
      parameter.type === 'number'
        ? typeof value !== 'number' || !Number.isFinite(value)
        : typeof value !== 'string' ||
          value.length > 300 ||
          (parameter.type === 'color' && !/^#[a-f\d]{6}$/i.test(value))
    )
      throw new Error(`Invalid template parameter: ${parameter.label}.`);
    if (
      typeof value === 'number' &&
      ((parameter.min !== undefined && value < parameter.min) ||
        (parameter.max !== undefined && value > parameter.max) ||
        (parameter.integer && !Number.isInteger(value)))
    )
      throw new Error(`Template parameter out of range: ${parameter.label}.`);
    if (
      (parameter.key === 'offsetX' || parameter.key === 'offsetY') &&
      typeof value === 'number' &&
      Math.abs(value) > 4000
    )
      throw new Error('Travel must be within -4,000..4,000 pixels.');
    if (parameter.key === 'degrees' && typeof value === 'number' && Math.abs(value) > 360)
      throw new Error('Angular travel must be within -360..360 degrees.');
    parameters[parameter.key] = value;
  }
  if (
    typeof parameters.minimum === 'number' &&
    typeof parameters.maximum === 'number' &&
    parameters.maximum <= parameters.minimum
  )
    throw new Error('Input maximum must exceed minimum.');
  let body = template.body;
  // Match original slot references once; remapping must not cascade into another slot.
  body = body.replace(/inputs\.([A-Za-z][A-Za-z0-9_]*)/g, (_match, slot: string) => {
    const alias = aliases[slot];
    if (
      !alias ||
      !/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(alias) ||
      ['constructor', 'prototype'].includes(alias)
    )
      throw new Error(`Choose an input for ${slot}.`);
    return `inputs[${JSON.stringify(alias)}]`;
  });
  return `// ${template.name} · v${template.version} (local copy)\nconst parameters = Object.freeze(${JSON.stringify(parameters)});\n${usable}${body}`;
}

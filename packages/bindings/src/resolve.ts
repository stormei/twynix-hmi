import {
  BindableProperty,
  Binding,
  bindingKey,
  bindableProperties,
  propertyBinding,
  PropertyBinding,
  PropertyValue,
  TagValue,
  validatePropertyValue,
  Widget,
} from '../../model/src';

export interface PropertyResult {
  value: PropertyValue;
  quality: TagValue['quality'] | 'simulation';
  error?: string;
}
export type ResolvedProperties = Record<BindableProperty, PropertyResult>;
export interface BindingEnvironment {
  simulation: boolean;
  connected: boolean;
  values: Record<string, TagValue>;
  demoValue: number;
  now: number;
}
export type ExpressionEvaluator = (
  source: string,
  context: { value: unknown; quality: string; name: string },
) => Promise<PropertyValue>;

export function sourceValue(source: Binding, environment: BindingEnvironment): PropertyResult {
  // Live bindings never borrow the widget's sample value while designing offline.
  if (environment.simulation)
    return { value: null, quality: 'unknown', error: 'Sign in to receive this telemetry source.' };
  const sample = environment.values[bindingKey(source)];
  if (!sample) return { value: null, quality: 'unknown', error: 'Waiting for a telemetry sample.' };
  const quality =
    !environment.connected || environment.now - sample.timestamp > source.staleAfterMs
      ? 'stale'
      : sample.quality === 'stale'
        ? 'good'
        : sample.quality;
  const value =
    typeof sample.value === 'string' ||
    typeof sample.value === 'number' ||
    typeof sample.value === 'boolean'
      ? sample.value
      : null;
  return { value, quality };
}
export function defaultProperties(
  widget: Widget,
  environment: BindingEnvironment,
): ResolvedProperties {
  return {
    value: {
      value: environment.simulation ? environment.demoValue : null,
      quality: environment.simulation ? 'simulation' : 'unknown',
    },
    text: { value: widget.text, quality: 'good' },
    color: { value: widget.color, quality: 'good' },
    visible: { value: widget.visible ?? true, quality: 'good' },
    enabled: { value: widget.enabled ?? true, quality: 'good' },
  };
}
export async function resolveProperty(
  property: BindableProperty,
  definition: PropertyBinding,
  widget: Widget,
  environment: BindingEnvironment,
  fallback: PropertyResult,
  input: PropertyResult,
  evaluate: ExpressionEvaluator,
): Promise<PropertyResult> {
  if (!definition.enabled) return fallback;
  const sample =
    definition.type === 'constant'
      ? { value: definition.value, quality: 'good' as const }
      : definition.source
        ? sourceValue(definition.source, environment)
        : input;
  if (sample.value === null && sample.quality === 'unknown' && definition.type === 'telemetry') {
    return {
      value:
        property === 'value'
          ? null
          : property === 'visible'
            ? true
            : property === 'enabled'
              ? false
              : fallback.value,
      quality: 'unknown',
      error: sample.error,
    };
  }
  try {
    const raw =
      definition.type === 'expression'
        ? await evaluate(definition.expression, {
            value: sample.value,
            quality: sample.quality,
            name: widget.name,
          })
        : sample.value;
    const value = validatePropertyValue(property, raw, widget);
    const usable = sample.quality === 'good' || sample.quality === 'simulation';
    // Unknown visibility stays visible. Unknown enablement cannot activate equipment.
    if (!usable && (property === 'visible' || property === 'enabled'))
      return {
        value: property === 'visible',
        quality: sample.quality,
        error: sample.error ?? 'Source is not fresh.',
      };
    if (!usable && (property === 'color' || property === 'text'))
      return { ...fallback, quality: sample.quality, error: sample.error };
    return { value, quality: sample.quality, error: sample.error };
  } catch (error) {
    return {
      value:
        property === 'enabled'
          ? false
          : property === 'visible'
            ? true
            : property === 'value'
              ? null
              : fallback.value,
      quality: 'bad',
      error: error instanceof Error ? error.message : 'Binding evaluation failed.',
    };
  }
}
export async function resolveWidgetProperties(
  widget: Widget,
  environment: BindingEnvironment,
  evaluate: ExpressionEvaluator,
): Promise<ResolvedProperties> {
  const resolved = defaultProperties(widget, environment);
  for (const property of bindableProperties) {
    const definition = propertyBinding(widget, property);
    if (definition)
      resolved[property] = await resolveProperty(
        property,
        definition,
        widget,
        environment,
        resolved[property],
        resolved.value,
        evaluate,
      );
  }
  return resolved;
}

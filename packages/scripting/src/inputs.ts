import { bindingKey, type BehaviorConfig, type TagValue } from '../../model/src';
import type { ScriptInput } from './evaluate';

/** Only declared bindings are copied; no browser or transport objects enter the VM. */
export function scriptInputs(
  config: BehaviorConfig | undefined,
  values: Record<string, TagValue>,
  connected: boolean,
  now: number,
): Record<string, ScriptInput> {
  return Object.fromEntries(
    Object.entries(config?.inputs ?? {}).map(([alias, binding]) => {
      const sample = values[bindingKey(binding)];
      const raw = sample?.value;
      const valid =
        typeof raw === 'string'
          ? raw.length <= 4000
          : typeof raw === 'boolean' || (typeof raw === 'number' && Number.isFinite(raw));
      const timestamp = sample && Number.isFinite(sample.timestamp) ? sample.timestamp : null;
      const quality: ScriptInput['quality'] = !connected
        ? 'disconnected'
        : !sample
          ? 'missing'
          : !valid || timestamp === null || sample.quality === 'bad'
            ? 'invalid'
            : sample.quality === 'unknown'
              ? 'missing'
              : sample.quality === 'stale' || now - timestamp > binding.staleAfterMs
                ? 'stale'
                : 'good';
      return [
        alias,
        {
          value: valid ? (raw as ScriptInput['value']) : null,
          quality,
          timestamp,
          unit: binding.unit,
        },
      ];
    }),
  );
}

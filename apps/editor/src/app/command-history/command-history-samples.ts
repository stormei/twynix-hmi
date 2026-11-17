import type { Widget } from '@twynix/model';
import type { CommandHistoryEntry } from '../command-runtime.service';

/** Historical fixtures only: this factory never prepares or executes a command. */
export function createSampleHistory(
  widgets: readonly Widget[],
  now = Date.now(),
): CommandHistoryEntry[] {
  const entries: CommandHistoryEntry[] = [];
  const add = (
    kind: Widget['kind'],
    requested: unknown,
    phase: 'confirmed' | 'timeout' | 'invalid',
    simulationResult: CommandHistoryEntry['simulationResult'],
    message: string,
  ) => {
    const widget = widgets.find(
      (item) =>
        item.kind === kind && item.action.type === 'command' && item.action.policy?.previewOnly,
    );
    if (!widget || widget.action.type !== 'command') return;
    const recordedAt = now - entries.length * 60_000;
    entries.push({
      id: crypto.randomUUID(),
      widgetId: widget.id,
      name: widget.name,
      method: widget.action.method,
      params: {},
      requested,
      reported: phase === 'confirmed' ? requested : null,
      quality: phase === 'confirmed' ? 'simulation' : 'unknown',
      phase,
      simulationResult,
      recordedAt,
      sentAt: phase === 'invalid' ? 0 : recordedAt + 100,
      simulated: true,
      sample: true,
      message: `Sample · ${message}`,
    });
  };
  add(
    'slider',
    35,
    'confirmed',
    'confirmed',
    'Reported speed matches the request. No command was sent.',
  );
  add(
    'toggle',
    true,
    'confirmed',
    'confirmed',
    'Reported enabled state matches the request. No command was sent.',
  );
  add(
    'dropdown',
    'auto',
    'confirmed',
    'confirmed',
    'Reported mode matches the request. No command was sent.',
  );
  add(
    'slider',
    60,
    'timeout',
    'timeout',
    'Simulated timeout; outcome unknown. No command was sent.',
  );
  add(
    'dropdown',
    'manual',
    'timeout',
    'accepted',
    'Reply received, but reported value did not match in time. No command was sent.',
  );
  add('slider', 95, 'invalid', null, 'Speed must be at most 80 rpm. Nothing was sent.');
  add(
    'dropdown',
    'maintenance',
    'invalid',
    null,
    'Choose an allowed command value: Manual or Automatic. Nothing was sent.',
  );
  return entries;
}

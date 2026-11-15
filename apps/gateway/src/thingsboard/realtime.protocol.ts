import { z } from 'zod';
import {
  bindingSchema,
  type Alarm,
  type Binding,
  bindingKey,
  type TagValue,
} from '../../../../packages/model/src';
export const subscriptionSchema = z.object({
  type: z.literal('subscribe'),
  bindings: z.array(bindingSchema).max(100),
  alarms: z.boolean(),
});
export function subscriptionCommands(bindings: Binding[], alarms: boolean) {
  const commands: Record<string, unknown>[] = [];
  const groups = new Map<string, Binding[]>();
  for (const binding of bindings) {
    const key = `${binding.entityType}:${binding.entityId}`;
    const group = groups.get(key) ?? [];
    if (!group.some((b) => bindingKey(b) === bindingKey(binding))) group.push(binding);
    groups.set(key, group);
  }
  let cmdId = 1;
  for (const group of groups.values()) {
    const first = group[0];
    commands.push({
      cmdId: cmdId++,
      type: 'ENTITY_DATA',
      query: {
        entityFilter: {
          type: 'singleEntity',
          singleEntity: { entityType: first.entityType, id: first.entityId },
        },
        pageLink: { pageSize: 1, page: 0 },
        entityFields: [],
        latestValues: group.map((b) => ({ type: b.dataType ?? 'TIME_SERIES', key: b.key })),
        keyFilters: [],
      },
      latestCmd: { keys: group.map((b) => ({ type: b.dataType ?? 'TIME_SERIES', key: b.key })) },
    });
  }
  if (alarms)
    commands.push({
      cmdId: 1000,
      type: 'ALARM_DATA',
      query: {
        entityFilter: { type: 'entityType', entityType: 'DEVICE' },
        keyFilters: [],
        pageLink: {
          pageSize: 50,
          page: 0,
          sortOrder: { key: { type: 'ALARM_FIELD', key: 'createdTime' }, direction: 'DESC' },
        },
        alarmFields: ['createdTime', 'type', 'severity', 'status'].map((key) => ({
          type: 'ALARM_FIELD',
          key,
        })),
      },
    });
  return commands;
}
// Describe supported wire fields without changing the existing normalization rules.
interface TelemetryRow {
  entityId?: { id: string; entityType: Binding['entityType'] };
  latest?: Partial<
    Record<'TIME_SERIES' | 'ATTRIBUTE', Record<string, { ts: number; value: unknown }>>
  >;
}
interface TelemetryMessage {
  data?: { data?: TelemetryRow[] };
  update?: TelemetryRow[];
}
interface AlarmPayload {
  id?: string | { id: string };
  type?: string;
  severity?: string;
  status?: string;
  createdTime?: number;
  originatorName?: string;
  originator?: { id?: string };
}
interface AlarmRow extends AlarmPayload {
  alarm?: AlarmPayload;
  entityName?: string;
}
interface AlarmMessage {
  data?: { data?: AlarmRow[] };
  update?: AlarmRow[];
  deleted?: (string | { id: string })[];
}
// Keep transport-specific payloads at this boundary; widgets consume normalized values only.
export function normalizeTelemetry(input: unknown): Record<string, TagValue> {
  const message = input as TelemetryMessage;
  const values: Record<string, TagValue> = {};
  const rows: TelemetryRow[] = [
    ...(Array.isArray(message.data?.data) ? message.data.data : []),
    ...(Array.isArray(message.update) ? message.update : []),
  ];
  for (const row of rows) {
    if (!row.entityId?.id) continue;
    for (const dataType of ['TIME_SERIES', 'ATTRIBUTE'] as const) {
      for (const [key, raw] of Object.entries(row.latest?.[dataType] ?? {})) {
        const sample = raw as { ts: number; value: unknown };
        if (typeof sample.ts !== 'number') continue;
        values[
          bindingKey({
            dataType,
            entityId: row.entityId.id,
            entityType: row.entityId.entityType,
            key,
            unit: '',
            staleAfterMs: 30000,
          })
        ] = {
          value: sample.value,
          timestamp: sample.ts,
          quality: 'good',
        };
      }
    }
  }
  return values;
}
export function normalizeAlarms(input: unknown): {
  snapshot: boolean;
  alarms: Alarm[];
  removed: string[];
} {
  const message = input as AlarmMessage;
  const snapshot = Array.isArray(message.data?.data);
  const rows: AlarmRow[] = snapshot
    ? message.data!.data!
    : Array.isArray(message.update)
      ? message.update
      : [];
  return {
    snapshot,
    alarms: rows
      .map((row) => {
        const alarm = row.alarm ?? row;
        return {
          id: typeof alarm.id === 'string' ? alarm.id : alarm.id?.id,
          name: alarm.type ?? 'Alarm',
          severity: alarm.severity ?? 'INDETERMINATE',
          status: alarm.status ?? 'ACTIVE_UNACK',
          createdTime: alarm.createdTime ?? Date.now(),
          originator: alarm.originatorName ?? row.entityName ?? alarm.originator?.id ?? '',
        };
      })
      .filter((alarm): alarm is Alarm => Boolean(alarm.id)),
    removed: Array.isArray(message.deleted)
      ? message.deleted.map((id) => (typeof id === 'string' ? id : id.id))
      : [],
  };
}

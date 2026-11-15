import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarterProject, projectSchema } from '../packages/model/src';
import {
  normalizeAlarms,
  normalizeTelemetry,
  subscriptionCommands,
  subscriptionSchema,
} from '../apps/gateway/src/thingsboard/realtime.protocol';

test('projects reject duplicate identities, invalid navigation and out-of-bounds geometry', () => {
  const project = createStarterProject();
  assert.equal(projectSchema.safeParse(project).success, true);
  const widget = project.screens[0].widgets[0];
  widget.x = 4000;
  assert.equal(projectSchema.safeParse(project).success, false);
  widget.x = 0;
  widget.action = { type: 'navigate', screenId: 'missing' };
  assert.equal(projectSchema.safeParse(project).success, false);
  widget.action = { type: 'none' };
  project.screens[0].widgets.push(structuredClone(widget));
  assert.equal(projectSchema.safeParse(project).success, false);
});

test('subscriptions deduplicate bindings and produce separate entity and alarm queries', () => {
  const binding = {
    entityId: crypto.randomUUID(),
    entityType: 'DEVICE' as const,
    key: 'pressure',
    unit: 'bar',
    staleAfterMs: 30000,
  };
  const commands = subscriptionCommands([binding, binding], true);
  assert.equal(commands.length, 2);
  assert.equal((commands[0].latestCmd as { keys: unknown[] }).keys.length, 1);
  assert.equal(commands[1].type, 'ALARM_DATA');
  assert.equal(
    subscriptionSchema.safeParse({
      type: 'subscribe',
      bindings: Array(101).fill(binding),
      alarms: true,
    }).success,
    false,
  );
});

test('telemetry normalizes snapshots and deltas while preserving timestamps', () => {
  const row = {
    entityId: { entityType: 'DEVICE', id: 'device-1' },
    latest: { TIME_SERIES: { pressure: { ts: 1000, value: '3.6' } } },
  };
  assert.deepEqual(normalizeTelemetry({ data: { data: [row] } }), {
    'DEVICE:device-1:pressure': { value: '3.6', timestamp: 1000, quality: 'good' },
  });
  assert.equal(normalizeTelemetry({ update: [row] })['DEVICE:device-1:pressure'].timestamp, 1000);
});

test('alarm updates preserve acknowledgement lifecycle and removal identities', () => {
  const result = normalizeAlarms({
    update: [
      {
        alarm: {
          id: { id: 'a1' },
          type: 'Pressure high',
          severity: 'MAJOR',
          status: 'CLEARED_ACK',
          createdTime: 123,
        },
      },
    ],
    deleted: [{ id: 'a2' }],
  });
  assert.equal(result.snapshot, false);
  assert.equal(result.alarms[0].status, 'CLEARED_ACK');
  assert.deepEqual(result.removed, ['a2']);
});

test('attribute and telemetry keys remain distinct in subscriptions and incoming values', () => {
  const source = {
    entityId: crypto.randomUUID(),
    entityType: 'DEVICE' as const,
    key: 'status',
    unit: '',
    staleAfterMs: 30000,
  };
  const commands = subscriptionCommands(
    [source, { ...source, dataType: 'ATTRIBUTE' }, source],
    false,
  );
  assert.deepEqual((commands[0].latestCmd as { keys: unknown[] }).keys, [
    { type: 'TIME_SERIES', key: 'status' },
    { type: 'ATTRIBUTE', key: 'status' },
  ]);
  const result = normalizeTelemetry({
    update: [
      {
        entityId: { id: source.entityId, entityType: 'DEVICE' },
        latest: {
          TIME_SERIES: { status: { ts: 100, value: 'running' } },
          ATTRIBUTE: { status: { ts: 200, value: 'installed' } },
        },
      },
    ],
  });
  assert.equal(result[`DEVICE:${source.entityId}:status`].value, 'running');
  assert.equal(result[`ATTRIBUTE:DEVICE:${source.entityId}:status`].value, 'installed');
});

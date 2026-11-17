import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandHistoryCsv } from '../apps/editor/src/app/command-history/command-history-csv';
import type { CommandHistoryEntry } from '../apps/editor/src/app/command-runtime.service';

const entry: CommandHistoryEntry = {
  id: 'attempt-1',
  widgetId: 'speed',
  name: 'Speed setpoint',
  method: 'setSpeed',
  recordedAt: Date.UTC(2026, 10, 15, 12),
  sentAt: 0,
  simulated: true,
  simulationResult: 'confirmed',
  phase: 'confirmed',
  requested: -5,
  reported: -5,
  quality: 'simulation',
  params: {},
  message: 'Matching value.',
};

test('history CSV exports snapshot values, UTC timestamps and stable columns without mutation', () => {
  const snapshot = structuredClone(entry);
  const csv = commandHistoryCsv([entry]);
  assert.equal(
    csv,
    '\uFEFF"Time (UTC)","Control","Method","Requested value (JSON)","Simulated outcome","Status","Reported value (JSON)","Quality","Validation / feedback message","Attempt ID"\r\n' +
      '"2026-11-15T12:00:00.000Z","Speed setpoint","setSpeed","-5","Reply + matching value","confirmed","-5","simulation","Matching value.","attempt-1"\r\n',
  );
  assert.deepEqual(entry, snapshot);
});

test('history CSV preserves Unicode, quoted/multiline errors and neutralizes text formulas', () => {
  const csv = commandHistoryCsv([
    {
      ...entry,
      name: '=HYPERLINK("x")',
      phase: 'invalid',
      requested: 'vedlikehold, "ø"',
      reported: null,
      simulationResult: null,
      message: 'Invalid, "mode"\nChoose Manual.',
    },
  ]);
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(csv.includes('"""vedlikehold, \\""ø\\"""""'));
  assert.ok(csv.includes('"Not simulated","invalid","null"'));
  assert.ok(csv.includes('"Invalid, ""mode""\nChoose Manual."'));
  for (const name of ['+SUM(1,2)', '-SUM(1,2)', '@SUM(1,2)', '\tformula', '  =SUM(1,2)']) {
    assert.ok(commandHistoryCsv([{ ...entry, name }]).includes(`"'${name}"`));
  }
  assert.equal(commandHistoryCsv([]).split('\r\n').length, 2);
});

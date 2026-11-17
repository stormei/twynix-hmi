import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommandPreviewWidgets } from '../packages/editor/src/examples/command-preview';
import { createSampleHistory } from '../apps/editor/src/app/command-history/command-history-samples';
import { commandHistoryCsv } from '../apps/editor/src/app/command-history/command-history-csv';

test('sample history contains seven marked, distinct Preview-only fixtures for the actual controls', () => {
  const widgets = createCommandPreviewWidgets();
  const snapshot = structuredClone(widgets);
  const now = Date.UTC(2026, 10, 15, 12);
  const entries = createSampleHistory(widgets, now);
  assert.equal(entries.length, 7);
  assert.equal(entries.filter((entry) => entry.phase === 'confirmed').length, 3);
  assert.equal(entries.filter((entry) => entry.phase === 'timeout').length, 2);
  assert.equal(entries.filter((entry) => entry.phase === 'invalid').length, 2);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 7);
  for (const [index, entry] of entries.entries()) {
    assert.ok(entry.sample && entry.simulated);
    assert.ok(entry.message.startsWith('Sample ·'));
    assert.equal(entry.recordedAt, now - index * 60_000);
    assert.ok(widgets.some((widget) => widget.id === entry.widgetId && widget.name === entry.name));
    if (entry.phase === 'confirmed') assert.equal(entry.reported, entry.requested);
    if (entry.phase === 'invalid') {
      assert.equal(entry.simulationResult, null);
      assert.equal(entry.sentAt, 0);
    }
  }
  const csv = commandHistoryCsv(entries.filter((entry) => entry.phase === 'invalid'));
  assert.ok(csv.includes('maintenance') && csv.includes('95') && csv.includes('Sample ·'));
  assert.deepEqual(widgets, snapshot);
  assert.deepEqual(createSampleHistory([]), []);
});

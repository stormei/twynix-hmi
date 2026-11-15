import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorStore } from '../apps/editor/src/app/editor.store';
import {
  instrumentFunctions,
  newWidget,
  operatingRangeSchema,
  projectSchema,
} from '../packages/model/src';
import { displayAccent, operatingRange } from '../packages/editor/src/display-style';

test('display modes and instrument metadata persist, and style changes are undoable', () => {
  const store = new EditorStore();
  store.setSymbolStyle('isa');
  for (const code of instrumentFunctions) store.addInstrument(code);
  store.setSymbolStyle('high-performance');
  const imported = projectSchema.parse(JSON.parse(JSON.stringify(store.project())));
  assert.equal(imported.symbolStyle, 'high-performance');
  const instruments = imported.screens[0].widgets.filter((widget) => widget.kind === 'instrument');
  assert.deepEqual(
    instruments.map((widget) => widget.instrumentFunction),
    [...instrumentFunctions],
  );
  assert.ok(
    instruments.every(
      (widget) =>
        widget.instrumentLocation === 'field' && widget.text.startsWith(widget.instrumentFunction),
    ),
  );
  store.undo();
  assert.equal(store.project().symbolStyle, 'isa');
  const legacy = JSON.parse(JSON.stringify(store.project()));
  delete legacy.symbolStyle;
  assert.equal(projectSchema.parse(legacy).symbolStyle, 'industrial');
});
test('high-performance normal states remain neutral but explicit condition colours remain visible', () => {
  assert.equal(displayAccent('high-performance', '#329c8c', 1, 'good'), '#43525e');
  assert.equal(displayAccent('high-performance', '#329c8c', 0, 'good'), '#8a959f');
  assert.equal(displayAccent('high-performance', '#d43737', 0, 'good'), '#d43737');
  assert.equal(displayAccent('high-performance', '#d43737', 1, 'stale'), '#8a959f');
  assert.equal(displayAccent('industrial', '#329c8c', 1, 'good'), '#329c8c');
});
test('operating range validates scale, distinguishes deviations and rejects unusable readings', () => {
  const range = { min: 0, max: 100, normalLow: 25, normalHigh: 75 };
  assert.equal(operatingRange(50, 'good', range).label, 'NORMAL');
  assert.equal(operatingRange(20, 'good', range).label, 'LOW');
  assert.equal(operatingRange(90, 'good', range).label, 'HIGH');
  assert.equal(operatingRange(1000, 'good', range).position, 1);
  assert.equal(operatingRange(90, 'stale', range).label, 'N/A');
  assert.equal(operatingRange(null, 'good', range).outside, false);
  for (const invalid of [
    { ...range, max: 0 },
    { ...range, normalLow: -1 },
    { ...range, normalHigh: 101 },
    { ...range, normalLow: 90 },
  ])
    assert.equal(operatingRangeSchema.safeParse(invalid).success, false);
  const widget = newWidget('instrument', 0);
  widget.operatingRange = range;
  assert.equal(widget.instrumentFunction, 'PT');
});

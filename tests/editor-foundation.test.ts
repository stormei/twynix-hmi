import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorStore } from '../apps/editor/src/app/editor.store';
import {
  alignWidgets,
  boundsOf,
  distributeWidgets,
  moveWidgets,
  resizeBounds,
  scaleWidgets,
} from '../packages/editor/src/geometry';
import { captureFaceplate, newWidget, projectSchema } from '../packages/model/src';
import { faceplateOverrides } from '../packages/editor/src/faceplates';
const screen = { x: 0, y: 0, width: 1120, height: 680 };
const rect = (x: number, y: number, width = 100, height = 60) => ({
  ...newWidget('value', 0),
  x,
  y,
  width,
  height,
});

test('group movement clamps at the screen edge without changing internal spacing', () => {
  const widgets = [rect(800, 100), rect(1000, 200)];
  const moved = moveWidgets(widgets, 500, -500, screen);
  assert.equal(moved[1].x + moved[1].width, 1120);
  assert.equal(moved[0].y, 0);
  assert.equal(moved[1].x - moved[0].x, 200);
  assert.equal(moved[1].y - moved[0].y, 100);
});
test('all resize handles keep opposite edges fixed and preserve minimum sizes', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };
  const nw = resizeBounds(box, 'nw', 500, 500, screen, 80, 40);
  assert.deepEqual(nw, { x: 220, y: 160, width: 80, height: 40 });
  const right = resizeBounds(box, 'e', 2000, 20, screen, 80, 40);
  assert.equal(right.x, 100);
  assert.equal(right.width, 1020);
  assert.equal(right.height, 100);
});
test('Shift resize preserves aspect ratio at screen and minimum-size limits', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };
  for (const delta of [-1000, 1000]) {
    const resized = resizeBounds(box, 'se', delta, delta, screen, 80, 60, true);
    assert.equal(resized.width / resized.height, 2);
    assert.ok(resized.width >= 80 && resized.height >= 60);
    assert.ok(resized.x + resized.width <= 1120 && resized.y + resized.height <= 680);
  }
});
test('multi-object resize scales both positions and dimensions', () => {
  const widgets = [rect(100, 100), rect(300, 200)];
  const bounds = boundsOf(widgets)!;
  const next = scaleWidgets(widgets, bounds, { x: 50, y: 80, width: 600, height: 320 });
  assert.deepEqual(boundsOf(next), { x: 50, y: 80, width: 600, height: 320 });
  assert.equal(next[0].width, 200);
  assert.equal(next[1].x, 450);
});
test('alignment treats a group as one unit instead of collapsing its members', () => {
  const group = [
    { ...rect(100, 80), groupId: 'group' },
    { ...rect(220, 120), groupId: 'group' },
  ];
  const aligned = alignWidgets(group, 'right', screen);
  assert.equal(boundsOf(aligned)!.x + boundsOf(aligned)!.width, screen.width);
  assert.equal(aligned[1].x - aligned[0].x, 120);
});
test('distribution creates equal gaps and retains the end positions', () => {
  const widgets = [rect(0, 0, 100), rect(140, 30, 80), rect(500, 50, 120)];
  const result = distributeWidgets(widgets, 'horizontal', screen);
  assert.equal(result[0].x, 0);
  assert.equal(result[2].x, 500);
  assert.equal(
    result[1].x - result[0].x - result[0].width,
    result[2].x - result[1].x - result[1].width,
  );
});
test('group selection, duplicate, ungroup and undo preserve schema-valid identities', () => {
  const store = new EditorStore();
  const widgets = store.screen().widgets.slice(0, 2);
  store.selectIds(widgets.map((widget) => widget.id));
  store.group();
  const groupId = store.selected()!.groupId;
  assert.ok(groupId);
  store.clearSelection();
  store.selectOnly(widgets[0].id);
  assert.equal(store.selectedWidgets().length, 2);
  store.duplicate();
  assert.equal(store.selectedWidgets().length, 2);
  assert.notEqual(store.selected()!.groupId, groupId);
  assert.equal(
    new Set(store.screen().widgets.map((widget) => widget.id)).size,
    store.screen().widgets.length,
  );
  assert.equal(projectSchema.safeParse(store.project()).success, true);
  store.ungroup();
  assert.ok(store.selectedWidgets().every((widget) => widget.groupId === null));
  store.undo();
  assert.ok(store.selectedWidgets().every((widget) => widget.groupId));
});
test('locked selections cannot be transformed and unlock remains available', () => {
  const store = new EditorStore(),
    widget = store.screen().widgets[0];
  store.selectOnly(widget.id);
  store.toggleLocked(widget.id);
  store.nudge(20, 20);
  store.updateWidget({ text: 'Must not change' });
  assert.equal(store.selected()!.x, widget.x);
  assert.equal(store.selected()!.text, widget.text);
  store.toggleLocked(widget.id);
  store.nudge(20, 20);
  assert.equal(store.selected()!.x, widget.x + 20);
});
test('screen deletion is undoable and refuses dangling navigation references', () => {
  const store = new EditorStore();
  const first = store.screen().id;
  store.addScreen('Temporary');
  const added = store.screen().id;
  store.deleteScreen();
  assert.equal(
    store.project().screens.some((screen) => screen.id === added),
    false,
  );
  store.undo();
  assert.equal(store.screen().id, added);
  store.selectScreen(first);
  store.selectOnly(store.screen().widgets[0].id);
  store.updateWidget({ action: { type: 'navigate', screenId: added } });
  store.selectScreen(added);
  assert.throws(() => store.deleteScreen(), /navigation/);
});
test('faceplate upgrades preserve instance overrides, equipment binding and geometry', () => {
  const store = new EditorStore();
  store.addFaceplate('standard-pump');
  const instance = structuredClone(store.selected()!);
  const type = store.project().faceplates.find((type) => type.id === 'standard-pump')!;
  const source = {
    entityId: crypto.randomUUID(),
    entityType: 'DEVICE' as const,
    key: 'running',
    unit: '',
    staleAfterMs: 30000,
  };
  store.updateWidget({
    text: 'P-212',
    propertyBindings: { value: { type: 'telemetry', source, enabled: true } },
    x: 200,
  });
  const template = captureFaceplate({ ...instance, color: '#123456' });
  store.publishFaceplate(
    { name: type.name, description: type.description, telemetryKey: 'running', template },
    type.id,
  );
  assert.equal(store.selected()!.faceplate!.version, 1);
  store.updateFaceplate();
  assert.equal(store.selected()!.faceplate!.version, 2);
  assert.equal(store.selected()!.color, '#123456');
  assert.equal(store.selected()!.text, 'P-212');
  assert.equal(store.selected()!.x, 200);
  assert.deepEqual(store.selected()!.propertyBindings.value, {
    type: 'telemetry',
    source,
    enabled: true,
  });
  assert.ok(
    faceplateOverrides(
      store.selected()!,
      store.project().faceplates.find((item) => item.id === type.id)!,
    ).includes('text'),
  );
  store.updateFaceplate(true);
  assert.equal(store.selected()!.text, template.text);
  assert.deepEqual(store.selected()!.propertyBindings.value, {
    type: 'telemetry',
    source,
    enabled: true,
  });
  assert.equal(projectSchema.safeParse(store.project()).success, true);
});
test('faceplate capture never shares an equipment command target', () => {
  const widget = newWidget('pump', 0);
  widget.action = {
    type: 'command',
    deviceId: crypto.randomUUID(),
    method: 'start',
    params: {},
    confirmation: 'Start?',
  };
  widget.doubleClickAction = { type: 'navigate', screenId: 'overview' };
  const template = captureFaceplate(widget);
  assert.deepEqual(template.action, { type: 'none' });
  assert.deepEqual(template.doubleClickAction, { type: 'none' });
});
test('saving a normalized server document clears dirty state despite object key order', () => {
  const store = new EditorStore();
  store.selectOnly(store.screen().widgets[0].id);
  store.updateWidget({ text: 'Changed' });
  const snapshot = structuredClone(store.project());
  const response = projectSchema.parse({ ...snapshot, revision: 1 });
  store.saved(response);
  assert.equal(store.dirty(), false);
  store.updateWidget({ text: 'Next' });
  assert.equal(store.dirty(), true);
  store.undo();
  assert.equal(store.dirty(), false);
});

test('copy and paste are one undo transaction and cannot carry references across project replacement', () => {
  const store = new EditorStore(),
    originalCount = store.screen().widgets.length;
  store.selectOnly(store.screen().widgets[0].id);
  store.copy();
  store.paste();
  assert.equal(store.screen().widgets.length, originalCount + 1);
  store.undo();
  assert.equal(store.screen().widgets.length, originalCount);
  store.redo();
  assert.equal(store.screen().widgets.length, originalCount + 1);
  store.load(projectSchema.parse(store.project()));
  assert.equal(store.hasClipboard(), false);
});

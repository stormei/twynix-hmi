import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorStore } from '../apps/editor/src/app/editor.store';

test('undo and redo restore geometry while retaining the server revision', () => {
  const store = new EditorStore();
  const first = store.screen().widgets[0];
  store.selectOnly(first.id);
  store.updateWidget({ x: 80 });
  assert.equal(store.selected()!.x, 80);
  store.project.update((project) => ({ ...project, revision: 5 }));
  store.undo();
  assert.equal(store.screen().widgets[0].x, first.x);
  assert.equal(store.project().revision, 5);
  store.redo();
  assert.equal(store.screen().widgets[0].x, 80);
  assert.equal(store.project().revision, 5);
});

test('a save in flight does not replace newer local edits or clear the dirty state', () => {
  const store = new EditorStore();
  const snapshot = structuredClone(store.project());
  store.selectOnly(store.screen().widgets[0].id);
  store.updateWidget({ text: 'Changed while saving' });
  store.saved({ ...snapshot, revision: 1 });
  assert.equal(store.project().revision, 1);
  assert.equal(store.selected()!.text, 'Changed while saving');
  assert.equal(store.dirty(), true);
  const next = structuredClone(store.project());
  store.saved({ ...next, revision: 2 });
  assert.equal(store.dirty(), false);
});

test('front/back ordering and rotation each undo as one operation', () => {
  const store = new EditorStore();
  const before = structuredClone(store.screen().widgets);
  const first = before[0];
  store.selectOnly(first.id);
  store.reorder(2);
  assert.equal(store.screen().widgets.at(-1)!.id, first.id);
  store.undo();
  assert.deepEqual(store.screen().widgets, before);
  store.reorder(-2);
  assert.equal(store.screen().widgets[0].id, first.id);
  store.undo();
  store.rotateSelection();
  assert.equal(store.selected()!.rotation, 5);
  assert.deepEqual(store.selected()!.rotationSize, { width: first.width, height: first.height });
  store.undo();
  assert.deepEqual(store.screen().widgets, before);
  store.redo();
  assert.equal(store.selected()!.rotation, 5);
});

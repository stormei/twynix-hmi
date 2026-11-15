import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStarterProject,
  projectSchema,
  resolveCommandParams,
  widgetBindings,
} from '../packages/model/src';
import { createCommandPreviewWidgets } from '../packages/editor/src/examples/command-preview';

test('command Preview lab roundtrips with three configured controls and no live sources', () => {
  const widgets = createCommandPreviewWidgets(),
    project = createStarterProject();
  project.screens.push({
    id: 'command-lab',
    name: 'Command Preview lab',
    width: 1280,
    height: 800,
    widgets,
    groups: {},
    connections: [],
  });
  const copy = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  const controls = copy.screens
    .at(-1)!
    .widgets.filter((widget) => ['slider', 'toggle', 'dropdown'].includes(widget.kind));
  assert.deepEqual(
    controls.map((widget) => widget.kind),
    ['slider', 'toggle', 'dropdown'],
  );
  assert.equal(new Set(widgets.map((widget) => widget.id)).size, widgets.length);
  for (const widget of controls) {
    assert.equal(widget.action.type, 'command');
    if (widget.action.type !== 'command') continue;
    assert.equal(widget.action.policy?.previewOnly, true);
    assert.ok(widget.action.policy?.feedback);
    assert.deepEqual(widgetBindings(widget), []);
  }
  const [slider, toggle, dropdown] = controls;
  if (
    slider.action.type !== 'command' ||
    toggle.action.type !== 'command' ||
    dropdown.action.type !== 'command'
  )
    throw new Error('Missing example command');
  const speedAction = slider.action,
    toggleAction = toggle.action,
    modeAction = dropdown.action;
  assert.equal(resolveCommandParams(speedAction, slider, 35, 'TENANT_ADMIN').speed, 35);
  assert.throws(() => resolveCommandParams(speedAction, slider, 95, 'TENANT_ADMIN'));
  assert.equal(resolveCommandParams(toggleAction, toggle, true, 'TENANT_ADMIN').enabled, true);
  assert.equal(resolveCommandParams(modeAction, dropdown, 'auto', 'TENANT_ADMIN').mode, 'auto');
  assert.throws(() => resolveCommandParams(modeAction, dropdown, 'maintenance', 'TENANT_ADMIN'));
});

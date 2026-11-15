import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equipmentState } from '../packages/editor/src/symbol-state';
import { createStarterProject, newWidget, projectSchema } from '../packages/model/src';

test('new industrial symbols survive project export and reimport with bindings and events', () => {
  const project = createStarterProject();
  for (const kind of ['motor', 'fan', 'pipe', 'conveyor', 'sensor'] as const) {
    const widget = newWidget(kind, 0);
    widget.propertyBindings.value = { type: 'constant', enabled: true, value: 0 };
    widget.onClick = 'notify("Equipment selected");';
    project.screens[0].widgets.push(widget);
  }
  const imported = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(imported.screens[0].widgets, project.screens[0].widgets);
});

test('equipment state distinguishes stopped, active, flow and sensor status', () => {
  for (const kind of ['motor', 'fan', 'conveyor'] as const) {
    assert.equal(equipmentState(kind, true, 'good').label, 'RUN');
    assert.equal(equipmentState(kind, false, 'good').label, 'STOP');
  }
  assert.equal(equipmentState('pipe', 12.5, 'good').label, 'FLOW');
  assert.equal(equipmentState('pipe', 0, 'good').label, 'NO FLOW');
  assert.equal(equipmentState('sensor', '1', 'simulation').label, 'ACTIVE');
  assert.equal(equipmentState('sensor', 0, 'good').label, 'INACTIVE');
});

test('stale, disconnected and invalid data never renders active equipment', () => {
  for (const quality of ['stale', 'unknown', 'disconnected', 'error']) {
    assert.deepEqual(equipmentState('motor', 1, quality), {
      usable: false,
      active: false,
      label: 'N/A',
    });
  }
  for (const value of [null, undefined, '', '  ', NaN, Infinity, {}, 'bad']) {
    assert.deepEqual(equipmentState('sensor', value, 'good'), {
      usable: false,
      active: false,
      label: 'N/A',
    });
  }
});

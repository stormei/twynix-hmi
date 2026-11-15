import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newWidget,
  projectSchema,
  componentVersionSchema,
  type Binding,
} from '../packages/model/src';
import {
  captureComponent,
  materializeComponent,
  UNASSIGNED_ENTITY,
} from '../packages/editor/src/components';
import { EditorStore } from '../apps/editor/src/app/editor.store';
const source: Binding = {
  entityId: crypto.randomUUID(),
  entityType: 'DEVICE',
  key: 'pressure',
  unit: 'bar',
  staleAfterMs: 30000,
};
function fixture() {
  const pump = { ...newWidget('pump', 0), x: 100, y: 100, width: 160, height: 100 };
  const display = { ...newWidget('value', 1), x: 400, y: 100, width: 130, height: 100 };
  pump.binding = { ...source };
  pump.action = {
    type: 'command',
    deviceId: source.entityId,
    method: 'start',
    params: {},
    confirmation: 'Start?',
  };
  display.propertyBindings.text = {
    type: 'expression',
    enabled: true,
    expression: 'String(context.value)',
    source: { ...source, dataType: 'ATTRIBUTE', key: 'label' },
  };
  const version = captureComponent([pump, display], []);
  version.parameters = [
    { name: 'caption', widgetId: display.id, property: 'text', value: 'Pressure' },
  ];
  const type = {
    id: crypto.randomUUID(),
    name: 'Pump panel',
    description: 'Reusable panel',
    versions: [version],
  };
  return { pump, display, version, type };
}
test('component capture sanitizes equipment targets and keeps only internal connections', () => {
  const { pump, display } = fixture();
  const pipe = { ...newWidget('pipe', 2), x: 600, y: 100, width: 240, height: 100 };
  const links = [
    {
      id: 'internal',
      from: { widgetId: pump.id, port: 'outlet' as const },
      to: { widgetId: pipe.id, port: 'inlet' as const },
    },
    {
      id: 'external',
      from: { widgetId: pipe.id, port: 'outlet' as const },
      to: { widgetId: 'outside', port: 'inlet' as const },
    },
  ];
  const version = captureComponent([pump, display, pipe], links);
  assert.equal(version.connections.length, 1);
  assert.equal(version.widgets[0].x, 0);
  assert.equal(version.widgets[0].action.type, 'none');
  assert.equal(version.widgets[0].binding!.entityId, UNASSIGNED_ENTITY);
  const binding = version.widgets[1].propertyBindings.text!;
  assert.equal(binding.type === 'expression' && binding.source?.entityId, UNASSIGNED_ENTITY);
  assert.equal(pump.binding!.entityId, source.entityId);
});
test('component inputs and entity assignments are independent and validated', () => {
  const { type, version, display } = fixture();
  assert.throws(() =>
    materializeComponent(type, version, 'a', {}, null, { x: 0, y: 0, width: 430, height: 100 }),
  );
  const entity = { entityType: 'ASSET' as const, entityId: crypto.randomUUID() };
  const first = materializeComponent(type, version, 'a', { caption: 'First' }, entity, {
    x: 40,
    y: 40,
    width: 430,
    height: 100,
  });
  const second = materializeComponent(type, version, 'b', { caption: 'Second' }, entity, {
    x: 40,
    y: 240,
    width: 430,
    height: 100,
  });
  assert.notEqual(first.widgets[0].id, second.widgets[0].id);
  assert.equal(first.widgets[0].binding!.entityId, entity.entityId);
  assert.equal(first.widgets[0].binding!.entityType, 'ASSET');
  assert.equal(
    first.widgets.find((widget) => widget.component!.templateWidgetId === display.id)!
      .propertyBindings.text!.type,
    'constant',
  );
  assert.equal(first.widgets[1].component!.values.caption, 'First');
  assert.equal(second.widgets[1].component!.values.caption, 'Second');
  assert.equal(
    componentVersionSchema.safeParse({
      ...version,
      parameters: [...version.parameters, ...version.parameters],
    }).success,
    false,
  );
});
test('component creation, inputs, copy/paste and version upgrades preserve history and instance identity', () => {
  const store = new EditorStore();
  const { version, type } = fixture();
  store.publishComponent(type.name, type.description, version);
  const created = store.project().components[0];
  const entity = { entityId: crypto.randomUUID(), entityType: 'DEVICE' as const };
  store.placeComponent(created.id, { caption: 'Local' }, entity);
  const instance = store.selectedWidgets()[0].component!;
  const ids = store.selectedIds();
  store.updateWidget({ onClick: 'hmi.notify("Local");' });
  store.placeComponent(created.id, { caption: 'Updated' }, entity, instance.instanceId);
  assert.deepEqual(store.selectedIds(), ids);
  assert.equal(store.selectedWidgets()[0].component!.values.caption, 'Updated');
  store.undo();
  assert.equal(store.selectedWidgets()[0].component!.values.caption, 'Local');
  store.redo();
  store.copy();
  store.paste();
  assert.notEqual(store.selectedWidgets()[0].component!.instanceId, instance.instanceId);
  assert.equal(store.selectedWidgets()[0].component!.typeId, created.id);
  assert.equal(projectSchema.safeParse(store.project()).success, true);
  store.undo();
  store.selectIds(ids);
  store.publishComponent(
    created.name,
    'Version 2',
    { ...version, widgets: version.widgets.map((widget) => ({ ...widget, color: '#123456' })) },
    created.id,
  );
  assert.equal(store.selectedWidgets()[0].component!.version, 1);
  store.placeComponent(created.id, { caption: 'Updated' }, entity, instance.instanceId, true);
  assert.equal(store.selectedWidgets()[0].component!.version, 2);
  assert.deepEqual(store.selectedIds(), ids);
  store.undo();
  assert.equal(store.selectedWidgets()[0].component!.version, 1);
  store.ungroup();
  assert.equal(store.selectedWidgets()[0].component, null);
});

test('rotated instance input edits preserve geometry, local actions and non-parameter bindings', () => {
  const store = new EditorStore();
  const { type, version } = fixture();
  store.publishComponent(type.name, type.description, version);
  const id = store.project().components[0].id;
  const entity = { entityId: crypto.randomUUID(), entityType: 'DEVICE' as const };
  store.placeComponent(id, { caption: 'Before' }, entity);
  store.rotateSelection();
  const before = structuredClone(store.selectedWidgets());
  store.selectOnly(before[0].id, true);
  store.updateWidget({
    action: { type: 'notify', message: 'Instance action' },
    propertyBindings: {
      ...before[0].propertyBindings,
      color: { type: 'constant', enabled: true, value: '#123456' },
    },
  });
  store.placeComponent(id, { caption: 'After' }, entity, before[0].component!.instanceId);
  const after = store.selectedWidgets();
  assert.deepEqual(
    after.map(({ x, y, width, height, rotation }) => ({ x, y, width, height, rotation })),
    before.map(({ x, y, width, height, rotation }) => ({ x, y, width, height, rotation })),
  );
  assert.deepEqual(after[0].action, { type: 'notify', message: 'Instance action' });
  assert.equal(after[0].propertyBindings.color!.type, 'constant');
  assert.equal(projectSchema.safeParse(store.project()).success, true);
  store.selectOnly(after[0].id, true);
  store.copy();
  store.paste();
  assert.equal(store.selectedWidgets()[0].component, null);
});

test('regrouping and partial deletion detach component links without corrupting saved projects', () => {
  const store = new EditorStore();
  const { type, version } = fixture();
  store.publishComponent(type.name, type.description, version);
  const id = store.project().components[0].id;
  store.placeComponent(id, {}, { entityId: crypto.randomUUID(), entityType: 'DEVICE' });
  store.group();
  assert.ok(store.selectedWidgets().every((widget) => widget.component === null));
  store.undo();
  const members = store.selectedWidgets();
  store.selectOnly(members[0].id, true);
  store.delete();
  assert.ok(
    store.screen().widgets.find((widget) => widget.id === members[1].id)!.component === null,
  );
  assert.equal(projectSchema.safeParse(store.project()).success, true);
});

test('reusable frames include pinned wiring outside the object bounds', () => {
  const pump = { ...newWidget('pump', 0), x: 100, y: 100, width: 160, height: 100 };
  const pipe = { ...newWidget('pipe', 1), x: 400, y: 100, width: 240, height: 100 };
  const version = captureComponent(
    [pump, pipe],
    [
      {
        id: 'pinned',
        from: { widgetId: pump.id, port: 'outlet' },
        to: { widgetId: pipe.id, port: 'inlet' },
        bendPoints: [
          { x: 50, y: 50 },
          { x: 650, y: 50 },
        ],
      },
    ],
  );
  const type = { id: 'pinned-panel', name: 'Pinned panel', description: '', versions: [version] };
  const instance = materializeComponent(type, version, 'pinned-instance', {}, null, {
    x: 40,
    y: 40,
    width: 600,
    height: 150,
  });
  assert.deepEqual(instance.connections[0].bendPoints, [
    { x: 40, y: 40 },
    { x: 640, y: 40 },
  ]);
  assert.equal(instance.widgets[0].x, 90);
  assert.equal(instance.widgets[0].y, 90);
});

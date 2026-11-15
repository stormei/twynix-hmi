import {
  type Widget,
  type ProcessConnection,
  type ComponentVersion,
  type ComponentParameter,
  type ComponentInstance,
  type ReusableComponent,
  type PropertyValue,
  bindableProperties,
  propertyBinding,
  validatePropertyValue,
  componentVersionSchema,
} from '../../model/src';
import { boundsOf, scaleWidgets, type Rect } from './geometry';

/** Include pinned routes in the reusable frame so insertion never clips its wiring. */
export function componentBounds(version: Pick<ComponentVersion, 'widgets' | 'connections'>): Rect {
  return boundsOf([
    ...version.widgets,
    ...version.connections.flatMap((link) =>
      (link.bendPoints ?? []).map((point) => ({ ...point, width: 0, height: 0 })),
    ),
  ])!;
}
export const UNASSIGNED_ENTITY = '00000000-0000-0000-0000-000000000000';
/** Capture only internal wiring. Device targets are never inherited by a new instance. */
export function captureComponent(
  widgets: Widget[],
  connections: ProcessConnection[],
): ComponentVersion {
  if (!widgets.length || widgets.length > 50) throw new Error('Select between 1 and 50 widgets.');
  const selected = new Set(widgets.map((widget) => widget.id));
  const internal = connections.filter(
    (link) => selected.has(link.from.widgetId) && selected.has(link.to.widgetId),
  );
  const bounds = componentBounds({ widgets, connections: internal });
  const instanceId = widgets[0].component?.instanceId;
  const oneInstance =
    instanceId && widgets.every((widget) => widget.component?.instanceId === instanceId);
  const ids = new Map(
    widgets.map((widget) => [
      widget.id,
      oneInstance ? widget.component!.templateWidgetId : widget.id,
    ]),
  );
  const templates = structuredClone(widgets).map((widget) => {
    widget.id = ids.get(widget.id)!;
    widget.x -= bounds.x;
    widget.y -= bounds.y;
    widget.groupId = null;
    widget.component = null;
    widget.faceplate = null;
    widget.locked = false;
    if (widget.binding) widget.binding.entityId = UNASSIGNED_ENTITY;
    for (const binding of Object.values(widget.propertyBindings))
      if (binding.type !== 'constant' && binding.source)
        binding.source.entityId = UNASSIGNED_ENTITY;
    for (const key of ['action', 'doubleClickAction'] as const)
      if (['command', 'navigate'].includes(widget[key].type)) widget[key] = { type: 'none' };
    return widget;
  });
  return componentVersionSchema.parse({
    version: 1,
    createdAt: new Date().toISOString(),
    widgets: templates,
    connections: internal.map((link) => ({
      ...link,
      from: { ...link.from, widgetId: ids.get(link.from.widgetId)! },
      to: { ...link.to, widgetId: ids.get(link.to.widgetId)! },
      bendPoints: link.bendPoints?.map((point) => ({
        x: point.x - bounds.x,
        y: point.y - bounds.y,
      })),
    })),
    parameters: [],
  });
}
export function componentNeedsEntity(version: ComponentVersion) {
  return version.widgets.some((widget) =>
    bindableProperties.some((property) => {
      if (
        version.parameters.some(
          (parameter) => parameter.widgetId === widget.id && parameter.property === property,
        )
      )
        return false;
      const definition = propertyBinding(widget, property);
      return definition && definition.type !== 'constant' && definition.source;
    }),
  );
}
export function parameterDefault(
  widget: Widget,
  property: ComponentParameter['property'],
): PropertyValue {
  const definition = propertyBinding(widget, property);
  return definition?.type === 'constant'
    ? definition.value
    : property === 'value'
      ? widget.demoValue
      : widget[property];
}
export function materializeComponent(
  type: ReusableComponent,
  version: ComponentVersion,
  instanceId: string,
  values: Record<string, PropertyValue>,
  entity: ComponentInstance['entity'],
  target: Rect,
  existing: Widget[] = [],
) {
  if (componentNeedsEntity(version) && !entity)
    throw new Error('Assign a device or asset for this component’s telemetry.');
  const parameters = Object.fromEntries(
    version.parameters.map((parameter) => [
      parameter.name,
      validatePropertyValue(
        parameter.property,
        values[parameter.name] ?? parameter.value,
        version.widgets.find((widget) => widget.id === parameter.widgetId),
      ),
    ]),
  );
  const ids = new Map(
    version.widgets.map((template) => [
      template.id,
      existing.find((widget) => widget.component?.templateWidgetId === template.id)?.id ??
        crypto.randomUUID(),
    ]),
  );
  const widgets = scaleWidgets(
    structuredClone(version.widgets),
    componentBounds(version),
    target,
  ).map((widget) => {
    const templateId = widget.id;
    widget.id = ids.get(templateId)!;
    widget.groupId = instanceId;
    widget.component = {
      typeId: type.id,
      version: version.version,
      instanceId,
      templateWidgetId: templateId,
      values: parameters,
      entity,
    };
    if (entity) {
      if (widget.binding) Object.assign(widget.binding, entity);
      for (const binding of Object.values(widget.propertyBindings))
        if (binding.type !== 'constant' && binding.source) Object.assign(binding.source, entity);
    }
    for (const parameter of version.parameters.filter(
      (parameter) => parameter.widgetId === templateId,
    )) {
      widget.propertyBindings[parameter.property] = {
        type: 'constant',
        enabled: true,
        value: parameters[parameter.name],
      };
      if (parameter.property === 'value') widget.binding = null;
    }
    return widget;
  });
  if (
    widgets.some(
      (widget) =>
        widget.width < 40 || widget.height < 30 || widget.width > 2000 || widget.height > 2000,
    )
  )
    throw new Error('The component does not fit at the requested size.');
  const bounds = componentBounds(version);
  const connections: ProcessConnection[] = version.connections.map((link, index) => ({
    ...link,
    id: `${instanceId}:${index}`,
    from: { ...link.from, widgetId: ids.get(link.from.widgetId)! },
    to: { ...link.to, widgetId: ids.get(link.to.widgetId)! },
    bendPoints: link.bendPoints?.map((point) => ({
      x: target.x + ((point.x - bounds.x) * target.width) / bounds.width,
      y: target.y + ((point.y - bounds.y) * target.height) / bounds.height,
    })),
  }));
  return { widgets, connections };
}

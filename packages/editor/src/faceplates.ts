import type { FaceplateTemplate, FaceplateType, Widget } from '../../model/src';

const inheritedFields = [
  'color',
  'text',
  'demoValue',
  'visible',
  'enabled',
  'action',
  'behavior',
  'onClick',
  'onDoubleClick',
  'doubleClickAction',
] as const;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function faceplateOverrides(widget: Widget, type: FaceplateType): string[] {
  const baseline = type.versions.find(
    (version) => version.version === widget.faceplate?.version,
  )?.template;
  if (!baseline) return [];
  const overrides: string[] = inheritedFields.filter((key) => !equal(widget[key], baseline[key]));
  for (const property of ['text', 'color', 'visible', 'enabled'] as const)
    if (!equal(widget.propertyBindings[property], baseline.propertyBindings[property]))
      overrides.push(`${property} binding`);
  return overrides;
}
export function updateFaceplateInstance(
  widget: Widget,
  type: FaceplateType,
  reset = false,
): Widget {
  const baseline = type.versions.find(
    (version) => version.version === widget.faceplate?.version,
  )?.template;
  const latest = type.versions.at(-1)!;
  const next = structuredClone(widget);
  for (const field of inheritedFields) {
    if (reset || (baseline && equal(widget[field], baseline[field])))
      (next as unknown as Record<string, unknown>)[field] = structuredClone(latest.template[field]);
  }
  for (const property of ['text', 'color', 'visible', 'enabled'] as const) {
    if (reset || equal(widget.propertyBindings[property], baseline?.propertyBindings[property])) {
      const definition = latest.template.propertyBindings[property];
      if (definition) next.propertyBindings[property] = structuredClone(definition);
      else delete next.propertyBindings[property];
    }
  }
  next.faceplate = { typeId: type.id, version: latest.version };
  return next;
}
export function instantiateFaceplate(
  type: FaceplateType,
  id: string,
  name: string,
  x: number,
  y: number,
): Widget {
  const version = type.versions.at(-1)!;
  return {
    ...structuredClone(version.template),
    id,
    name,
    x,
    y,
    kind: type.kind,
    groupId: null,
    component: null,
    locked: false,
    faceplate: { typeId: type.id, version: version.version },
  };
}
export interface FaceplateDraft {
  name: string;
  description: string;
  telemetryKey: string;
  template: FaceplateTemplate;
}

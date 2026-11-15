import { commandPolicySchema } from './commands';
export * from './commands';
export * from './discovery';
import {
  dashboardKinds,
  dashboardConfigSchema,
  defaultDashboardConfig,
  isDashboardKind,
  isControlKind,
} from './dashboard';
export * from './dashboard';
import { z } from 'zod';

export const widgetKinds = [
  'tank',
  'pump',
  'valve',
  'value',
  'label',
  'button',
  'trend',
  'motor',
  'fan',
  'pipe',
  'conveyor',
  'sensor',
  'elbow',
  'tee',
  'connector',
  'instrument',
  ...dashboardKinds,
] as const;
export const symbolStyles = ['industrial', 'isa', 'high-performance'] as const;
export type SymbolStyle = (typeof symbolStyles)[number];
export const instrumentFunctions = [
  'PT',
  'TT',
  'FT',
  'LT',
  'PI',
  'TI',
  'FI',
  'LI',
  'PIC',
  'TIC',
  'FIC',
  'LIC',
] as const;
export type InstrumentFunction = (typeof instrumentFunctions)[number];
export const bindingSchema = z.object({
  dataType: z.enum(['TIME_SERIES', 'ATTRIBUTE']).optional(),
  entityId: z.uuid(),
  entityType: z.enum(['DEVICE', 'ASSET']),
  key: z.string().min(1).max(128),
  unit: z.string().max(24).default(''),
  staleAfterMs: z.number().int().min(1000).max(86400000).default(30000),
});
export const bindableProperties = ['value', 'text', 'color', 'visible', 'enabled'] as const;
export type BindableProperty = (typeof bindableProperties)[number];
export const primitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const propertyBindingSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('constant'),
    enabled: z.boolean().default(true),
    value: primitiveSchema,
  }),
  z.object({
    type: z.literal('telemetry'),
    enabled: z.boolean().default(true),
    source: bindingSchema,
  }),
  z.object({
    type: z.literal('expression'),
    enabled: z.boolean().default(true),
    expression: z.string().trim().min(1).max(4000),
    source: bindingSchema.nullable().default(null),
  }),
]);
export type PropertyBinding = z.infer<typeof propertyBindingSchema>;
export type PropertyValue = z.infer<typeof primitiveSchema>;
export const propertyBindingMapSchema = z
  .object({
    value: propertyBindingSchema.optional(),
    text: propertyBindingSchema.optional(),
    color: propertyBindingSchema.optional(),
    visible: propertyBindingSchema.optional(),
    enabled: propertyBindingSchema.optional(),
  })
  .strict()
  .default({});
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('navigate'), screenId: z.string().max(80) }),
  z.object({ type: z.literal('notify'), message: z.string().max(500) }),
  z.object({
    type: z.literal('command'),
    deviceId: z.uuid(),
    method: z.string().regex(/^[a-zA-Z][\w.]{0,79}$/),
    params: z.record(z.string(), z.json()),
    confirmation: z.string().min(1).max(300),
    policy: commandPolicySchema.optional(),
  }),
]);
export const operatingRangeSchema = z
  .object({ min: z.number(), max: z.number(), normalLow: z.number(), normalHigh: z.number() })
  .refine(
    (range) =>
      range.min < range.max &&
      range.normalLow >= range.min &&
      range.normalHigh <= range.max &&
      range.normalLow <= range.normalHigh,
    { message: 'Use min < max and a normal range inside those limits.' },
  );
export const componentInstanceSchema = z.object({
  typeId: z.string().min(1).max(80),
  version: z.number().int().positive(),
  instanceId: z.string().min(1).max(80),
  templateWidgetId: z.string().min(1).max(80),
  values: z.record(z.string().max(100), primitiveSchema).default({}),
  entity: z
    .object({ entityId: z.uuid(), entityType: z.enum(['DEVICE', 'ASSET']) })
    .nullable()
    .default(null),
});
export const widgetSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(widgetKinds),
  name: z.string().min(1).max(100),
  x: z.number().min(0).max(4000),
  y: z.number().min(0).max(4000),
  width: z.number().min(40).max(2000),
  height: z.number().min(30).max(2000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text: z.string().max(300),
  demoValue: z.number(),
  operatingRange: operatingRangeSchema.nullable().default(null),
  dashboard: dashboardConfigSchema.nullable().default(null),
  instrumentFunction: z.enum(instrumentFunctions).default('PT'),
  instrumentLocation: z.enum(['field', 'panel', 'shared']).default('field'),
  rotation: z.number().finite().min(0).lt(360).default(0),
  rotationSize: z
    .object({ width: z.number().positive().max(3000), height: z.number().positive().max(3000) })
    .nullable()
    .default(null),
  pipeRotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  binding: bindingSchema.nullable(),
  propertyBindings: propertyBindingMapSchema,
  groupId: z.string().min(1).max(80).nullable().default(null),
  locked: z.boolean().default(false),
  component: componentInstanceSchema.nullable().default(null),
  faceplate: z
    .object({ typeId: z.string().min(1).max(80), version: z.number().int().min(1) })
    .nullable()
    .default(null),
  visible: z.boolean().default(true),
  enabled: z.boolean().default(true),
  action: actionSchema,
  behavior: z.string().max(20000).default(''),
  onClick: z.string().max(20000).default(''),
  onDoubleClick: z.string().max(20000).default(''),
  doubleClickAction: actionSchema.default({ type: 'none' }),
});
export const faceplateTemplateSchema = widgetSchema.omit({
  id: true,
  name: true,
  x: true,
  y: true,
  groupId: true,
  locked: true,
  faceplate: true,
  component: true,
});
export const faceplateTypeSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(100),
  kind: z.enum(['pump', 'valve', 'tank']),
  description: z.string().max(500),
  telemetryKey: z.string().min(1).max(128),
  versions: z
    .array(
      z.object({
        version: z.number().int().min(1),
        createdAt: z.string(),
        template: faceplateTemplateSchema,
      }),
    )
    .min(1)
    .max(100),
});
export type FaceplateType = z.infer<typeof faceplateTypeSchema>;
export type FaceplateTemplate = z.infer<typeof faceplateTemplateSchema>;
export const portNames = ['inlet', 'outlet', 'branch'] as const;
export const signalPortNames = ['signal-in', 'signal-out', 'actuator'] as const;
export const connectionMedia = ['process', 'electrical', 'pneumatic', 'digital'] as const;
export type ConnectionMedium = (typeof connectionMedia)[number];
export type SignalMedium = Exclude<ConnectionMedium, 'process'>;
export function equipmentSignalPortNames(kind: WidgetKind): readonly string[] {
  return kind === 'instrument'
    ? ['signal-in', 'signal-out']
    : kind === 'sensor'
      ? ['signal-out']
      : kind === 'valve'
        ? ['actuator']
        : [];
}
export const portEndpointSchema = z.object({
  widgetId: z.string().min(1).max(80),
  port: z.enum([...portNames, ...signalPortNames]),
});
export const routePointSchema = z.object({
  x: z.number().min(0).max(4000),
  y: z.number().min(0).max(4000),
});
export const processConnectionSchema = z.object({
  id: z.string().min(1).max(80),
  from: portEndpointSchema,
  to: portEndpointSchema,
  medium: z.enum(connectionMedia).optional(),
  bendPoints: z.array(routePointSchema).max(32).optional(),
});
export type PortEndpoint = z.infer<typeof portEndpointSchema>;
export type ProcessConnection = z.infer<typeof processConnectionSchema>;
export function equipmentPortNames(kind: WidgetKind): readonly string[] {
  return kind === 'tee'
    ? portNames
    : ['tank', 'pump', 'valve', 'pipe', 'elbow', 'connector'].includes(kind)
      ? ['inlet', 'outlet']
      : [];
}
export const componentParameterSchema = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  widgetId: z.string().min(1).max(80),
  property: z.enum(bindableProperties),
  value: primitiveSchema,
});
export const componentVersionSchema = z
  .object({
    version: z.number().int().positive(),
    createdAt: z.string(),
    widgets: z.array(widgetSchema).min(1).max(50),
    connections: z.array(processConnectionSchema).max(100),
    parameters: z.array(componentParameterSchema).max(100),
  })
  .superRefine((version, ctx) => {
    const ids = new Set(version.widgets.map((widget) => widget.id));
    if (
      ids.size !== version.widgets.length ||
      version.widgets.some((widget) => widget.component || widget.groupId || widget.faceplate)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Component templates must contain unique, detached widgets.',
      });
    for (const widget of version.widgets) {
      if (
        ['command', 'navigate'].includes(widget.action.type) ||
        ['command', 'navigate'].includes(widget.doubleClickAction.type)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Shared component types cannot contain device or screen action targets.',
        });
      if (isDashboardKind(widget.kind) && widget.dashboard?.type !== widget.kind)
        ctx.addIssue({
          code: 'custom',
          message: 'Component widget configuration does not match its kind.',
        });
      for (const property of bindableProperties) {
        const binding = widget.propertyBindings[property];
        if (binding?.type === 'constant')
          try {
            validatePropertyValue(property, binding.value, widget);
          } catch {
            ctx.addIssue({ code: 'custom', message: 'Invalid component property constant.' });
          }
      }
    }
    const names = new Set<string>(),
      targets = new Set<string>();
    for (const parameter of version.parameters) {
      const target = parameter.widgetId + ':' + parameter.property;
      if (!ids.has(parameter.widgetId) || names.has(parameter.name) || targets.has(target))
        ctx.addIssue({
          code: 'custom',
          message: 'Component inputs need unique names and property targets.',
        });
      names.add(parameter.name);
      targets.add(target);
      try {
        validatePropertyValue(
          parameter.property,
          parameter.value,
          version.widgets.find((widget) => widget.id === parameter.widgetId),
        );
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid component input default.' });
      }
    }
    const usedPorts = new Set<string>(),
      connectionIds = new Set<string>();
    for (const link of version.connections) {
      if (connectionIds.has(link.id))
        ctx.addIssue({ code: 'custom', message: 'Component connection IDs must be unique.' });
      connectionIds.add(link.id);
      if (
        link.medium &&
        link.medium !== 'process' &&
        (link.from.port !== 'signal-out' || !['signal-in', 'actuator'].includes(link.to.port))
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid component signal direction.' });
      for (const endpoint of [link.from, link.to]) {
        const key = endpoint.widgetId + ':' + endpoint.port;
        if (usedPorts.has(key))
          ctx.addIssue({
            code: 'custom',
            message: 'A component port cannot have multiple connections.',
          });
        usedPorts.add(key);
      }
      const from = version.widgets.find((widget) => widget.id === link.from.widgetId);
      const to = version.widgets.find((widget) => widget.id === link.to.widgetId);
      const ports =
        link.medium && link.medium !== 'process' ? equipmentSignalPortNames : equipmentPortNames;
      if (
        !from ||
        !to ||
        from.id === to.id ||
        !ports(from.kind).includes(link.from.port) ||
        !ports(to.kind).includes(link.to.port)
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid internal component connection.' });
    }
  });
export const reusableComponentSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(100),
    description: z.string().max(500),
    versions: z.array(componentVersionSchema).min(1).max(100),
  })
  .superRefine((type, ctx) => {
    if (
      new Set(type.versions.map((version) => version.version)).size !== type.versions.length ||
      type.versions.some(
        (version, index) => index > 0 && version.version <= type.versions[index - 1].version,
      )
    )
      ctx.addIssue({ code: 'custom', message: 'Component versions must be unique.' });
  });
export type ReusableComponent = z.infer<typeof reusableComponentSchema>;
export type ComponentVersion = z.infer<typeof componentVersionSchema>;
export type ComponentParameter = z.infer<typeof componentParameterSchema>;
export type ComponentInstance = z.infer<typeof componentInstanceSchema>;
export const screenSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(100),
  width: z.number().min(400).max(4000),
  height: z.number().min(300).max(4000),
  widgets: z.array(widgetSchema).max(500),
  connections: z.array(processConnectionSchema).max(1000).default([]),
  groups: z.record(z.string().max(80), z.string().min(1).max(100)).default({}),
});
export const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    symbolStyle: z.enum(symbolStyles).default('industrial'),
    id: z.uuid(),
    name: z.string().min(1).max(100),
    revision: z.number().int().min(0),
    screens: z.array(screenSchema).min(1).max(100),
    components: z.array(reusableComponentSchema).max(100).default([]),
    faceplates: z
      .array(faceplateTypeSchema)
      .max(100)
      .default(() => createBuiltinFaceplates()),
  })
  .superRefine((project, ctx) => {
    if (new Set(project.components.map((type) => type.id)).size !== project.components.length)
      ctx.addIssue({ code: 'custom', message: 'Component type IDs must be unique.' });
    for (const screen of project.screens)
      for (const widget of screen.widgets) {
        const instance = widget.component;
        if (!instance) continue;
        const version = project.components
          .find((type) => type.id === instance.typeId)
          ?.versions.find((version) => version.version === instance.version);
        if (
          !version?.widgets.some((template) => template.id === instance.templateWidgetId) ||
          widget.groupId !== instance.instanceId
        )
          ctx.addIssue({ code: 'custom', message: 'Invalid reusable component reference.' });
      }
    const typeIds = new Set<string>();
    for (const type of project.faceplates) {
      if (typeIds.has(type.id))
        ctx.addIssue({ code: 'custom', message: 'Faceplate type IDs must be unique' });
      typeIds.add(type.id);
      const versions = new Set<number>();
      for (const version of type.versions) {
        if (versions.has(version.version) || version.template.kind !== type.kind)
          ctx.addIssue({ code: 'custom', message: 'Invalid faceplate version' });
        versions.add(version.version);
        for (const property of bindableProperties) {
          const definition = version.template.propertyBindings[property];
          if (definition?.type === 'constant') {
            try {
              validatePropertyValue(property, definition.value, version.template);
            } catch {
              ctx.addIssue({ code: 'custom', message: 'Invalid faceplate property constant' });
            }
          }
        }
      }
    }
    const screens = new Set<string>();
    for (const screen of project.screens) {
      if (screens.has(screen.id))
        ctx.addIssue({ code: 'custom', message: 'Screen IDs must be unique' });
      screens.add(screen.id);
      const occupiedPorts = new Set<string>();
      const connectionIds = new Set<string>();
      for (const connection of screen.connections) {
        if (connectionIds.has(connection.id) || connection.from.widgetId === connection.to.widgetId)
          ctx.addIssue({ code: 'custom', message: 'Invalid or duplicate diagram connection' });
        connectionIds.add(connection.id);
        const signal = connection.medium && connection.medium !== 'process';
        if (
          signal &&
          (connection.from.port !== 'signal-out' ||
            !['signal-in', 'actuator'].includes(connection.to.port))
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Signals must connect an output to an instrument input or valve actuator',
          });
        if (
          connection.bendPoints?.some((point) => point.x > screen.width || point.y > screen.height)
        )
          ctx.addIssue({ code: 'custom', message: 'Connection bend point is outside the screen' });
        for (const endpoint of [connection.from, connection.to]) {
          const widget = screen.widgets.find((widget) => widget.id === endpoint.widgetId);
          const key = `${endpoint.widgetId}:${endpoint.port}`;
          if (
            !widget ||
            !(
              signal ? equipmentSignalPortNames(widget.kind) : equipmentPortNames(widget.kind)
            ).includes(endpoint.port) ||
            occupiedPorts.has(key)
          )
            ctx.addIssue({ code: 'custom', message: 'Invalid or occupied equipment port' });
          occupiedPorts.add(key);
        }
      }
      const widgets = new Set<string>();
      for (const widget of screen.widgets) {
        if (widgets.has(widget.id))
          ctx.addIssue({ code: 'custom', message: 'Widget IDs must be unique within a screen' });
        widgets.add(widget.id);
        if (widget.dashboard && widget.dashboard.type !== widget.kind)
          ctx.addIssue({
            code: 'custom',
            message: 'Dashboard configuration must match its widget kind.',
          });
        if (widget.x + widget.width > screen.width || widget.y + widget.height > screen.height)
          ctx.addIssue({ code: 'custom', message: `${widget.name} is outside the screen` });
        for (const property of bindableProperties) {
          const definition = widget.propertyBindings[property];
          if (definition?.type === 'constant') {
            try {
              validatePropertyValue(property, definition.value, widget);
            } catch (error) {
              ctx.addIssue({
                code: 'custom',
                message: `${widget.name}.${property}: ${(error as Error).message}`,
              });
            }
          }
        }
        if (widget.groupId && !screen.groups[widget.groupId])
          ctx.addIssue({ code: 'custom', message: 'Group reference does not exist' });
        if (widget.faceplate) {
          const type = project.faceplates.find((type) => type.id === widget.faceplate!.typeId);
          if (
            !type ||
            type.kind !== widget.kind ||
            !type.versions.some((version) => version.version === widget.faceplate!.version)
          )
            ctx.addIssue({ code: 'custom', message: 'Faceplate version does not exist' });
        }
        for (const action of [widget.action, widget.doubleClickAction]) {
          if (action.type === 'command' && action.policy?.feedback && !action.policy.previewOnly) {
            const binding = propertyBinding(widget, 'value');
            if (!binding?.enabled || binding.type === 'constant' || !binding.source)
              ctx.addIssue({
                code: 'custom',
                message: 'Command readback requires an enabled value source.',
              });
          }
          if (action.type === 'navigate' && !project.screens.some((s) => s.id === action.screenId))
            ctx.addIssue({ code: 'custom', message: 'Navigation target does not exist' });
        }
      }
    }
  });
export type WidgetKind = (typeof widgetKinds)[number];
export type Widget = z.infer<typeof widgetSchema>;
export type Screen = z.infer<typeof screenSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Binding = z.infer<typeof bindingSchema>;
export interface TagValue {
  value: unknown;
  timestamp: number;
  quality: 'good' | 'stale' | 'bad' | 'unknown';
}
export interface Alarm {
  id: string;
  name: string;
  severity: string;
  status: string;
  createdTime: number;
  originator: string;
}
export interface User {
  id: { id: string };
  tenantId: { id: string };
  authority: string;
  email: string;
  firstName?: string;
  lastName?: string;
}
export interface Release {
  id: string;
  publishedAt: string;
  project: Project;
}
export interface ScriptEffect {
  type: 'text' | 'color' | 'notify' | 'action';
  value: string;
}
export const bindingKey = (binding: Binding) =>
  `${binding.dataType === 'ATTRIBUTE' ? 'ATTRIBUTE:' : ''}${binding.entityType}:${binding.entityId}:${binding.key}`;

export function newWidget(kind: WidgetKind, index: number): Widget {
  return {
    id: crypto.randomUUID(),
    kind,
    name: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${index + 1}`,
    x: 60 + (index % 5) * 140,
    y: 120 + Math.floor(index / 5) * 110,
    width:
      kind === 'toggle'
        ? 240
        : ['dropdown', 'slider', 'radio', 'sparkline', 'linear-gauge'].includes(kind)
          ? 300
          : isDashboardKind(kind)
            ? 360
            : ['elbow', 'tee', 'connector'].includes(kind)
              ? 120
              : kind === 'tank'
                ? 160
                : kind === 'trend'
                  ? 280
                  : kind === 'conveyor' || kind === 'pipe'
                    ? 240
                    : 130,
    height: ['dropdown', 'slider', 'toggle', 'segmented', 'sparkline'].includes(kind)
      ? 110
      : ['radio', 'linear-gauge'].includes(kind)
        ? 140
        : isDashboardKind(kind)
          ? 240
          : ['elbow', 'tee', 'connector'].includes(kind)
            ? 120
            : kind === 'tank'
              ? 220
              : kind === 'trend'
                ? 140
                : kind === 'label'
                  ? 40
                  : 100,
    color: '#329c8c',
    text:
      kind === 'button'
        ? 'Open details'
        : ((
            {
              motor: 'M-101',
              fan: 'F-101',
              pipe: 'PL-101',
              conveyor: 'CV-101',
              sensor: 'S-101',
              elbow: 'EL-101',
              tee: 'T-101',
              connector: 'J-101',
              instrument: 'PT-101',
            } as Partial<Record<WidgetKind, string>>
          )[kind] ?? ''),
    dashboard: isDashboardKind(kind) ? defaultDashboardConfig(kind) : null,
    operatingRange: null,
    instrumentFunction: 'PT',
    instrumentLocation: 'field',
    rotation: 0,
    rotationSize: null,
    pipeRotation: 0,
    demoValue: isControlKind(kind)
      ? 0
      : kind === 'tank'
        ? 68
        : ['motor', 'fan', 'pipe', 'conveyor', 'sensor'].includes(kind)
          ? 1
          : 42,
    binding: null,
    propertyBindings: {},
    groupId: null,
    locked: false,
    component: null,
    faceplate: null,
    visible: true,
    enabled: true,
    action: { type: 'none' },
    behavior: '',
    onClick: '',
    onDoubleClick: '',
    doubleClickAction: { type: 'none' },
  };
}

/** A gallery that can be inserted as a separate screen, without replacing a project. */
export function createDashboardWidgets(): Widget[] {
  const layouts = [
    { kind: 'chart', name: 'Production trend', x: 40, y: 40, width: 700, height: 300 },
    { kind: 'gauge', name: 'Capacity', x: 780, y: 40, width: 460, height: 300 },
    { kind: 'markdown', name: 'Operator notes', x: 40, y: 380, width: 400, height: 320 },
    { kind: 'html', name: 'Custom HTML panel', x: 480, y: 380, width: 360, height: 320 },
    { kind: 'iframe', name: 'Embedded dashboard', x: 880, y: 380, width: 360, height: 320 },
  ] as const;
  return layouts.map((layout, index) => ({ ...newWidget(layout.kind, index), ...layout }));
}

export function createStarterProject(): Project {
  const make = (
    kind: WidgetKind,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    value = 0,
    text = '',
  ): Widget => ({
    ...newWidget(kind, 0),
    name,
    x,
    y,
    width,
    height,
    demoValue: value,
    text,
  });
  const project: Project = {
    schemaVersion: 1,
    symbolStyle: 'industrial',
    id: crypto.randomUUID(),
    name: 'Water treatment plant',
    revision: 0,
    components: [],
    faceplates: createBuiltinFaceplates(),
    screens: [
      {
        id: 'overview',
        name: 'Process overview',
        width: 1120,
        height: 680,
        groups: {},
        connections: [],
        widgets: [
          make('label', 'Process heading', 48, 30, 600, 42, 0, 'Raw water treatment'),
          make(
            'label',
            'Process subtitle',
            48,
            76,
            650,
            30,
            0,
            'INTAKE  /  FILTRATION  /  STORAGE',
          ),
          make('tank', 'Raw water tank', 100, 170, 180, 240, 68, 'TK-101'),
          make('pump', 'Feed pump', 380, 260, 130, 110, 1, 'P-101'),
          make('valve', 'Flow control valve', 590, 275, 110, 90, 75, 'FV-101'),
          make('tank', 'Clean water tank', 810, 170, 180, 240, 82, 'TK-102'),
          make('value', 'Intake pressure', 72, 470, 205, 105, 3.6, 'bar'),
          make('value', 'Flow rate', 322, 470, 205, 105, 24.8, 'm³/h'),
          make('value', 'Water temperature', 572, 470, 205, 105, 18.4, '°C'),
          {
            ...make('button', 'Pump controls', 822, 490, 200, 56, 0, 'Pump controls ↗'),
            action: { type: 'notify', message: 'Configure a device command in the Actions panel.' },
          },
        ],
      },
      {
        id: 'equipment',
        name: 'Equipment detail',
        width: 1120,
        height: 680,
        groups: {},
        connections: [],
        widgets: [
          make('label', 'Equipment heading', 48, 30, 600, 42, 0, 'Equipment detail'),
          make('pump', 'Feed pump detail', 130, 150, 200, 170, 1, 'P-101'),
          make('trend', 'Pump trend', 430, 150, 540, 260, 0, 'Discharge pressure'),
        ],
      },
    ],
  };
  const overview = project.screens[0];
  const equipment = overview.widgets.filter((widget) =>
    ['tank', 'pump', 'valve'].includes(widget.kind),
  );
  overview.connections = equipment.slice(1).map((widget, index) => ({
    id: crypto.randomUUID(),
    from: { widgetId: equipment[index].id, port: 'outlet' },
    to: { widgetId: widget.id, port: 'inlet' },
  }));
  return project;
}

/** Read legacy value bindings without changing imported or published projects. */
export function propertyBinding(
  widget: Widget,
  property: BindableProperty,
): PropertyBinding | undefined {
  return (
    widget.propertyBindings?.[property] ??
    (property === 'value' && widget.binding
      ? { type: 'telemetry', enabled: true, source: widget.binding }
      : undefined)
  );
}
export function widgetBindings(widget: Widget): Binding[] {
  const bindings = new Map<string, Binding>();
  for (const property of bindableProperties) {
    const definition = propertyBinding(widget, property);
    if (definition?.enabled && definition.type !== 'constant' && definition.source) {
      const source = definition.source;
      const existing = bindings.get(bindingKey(source));
      bindings.set(bindingKey(source), {
        ...source,
        staleAfterMs: Math.min(source.staleAfterMs, existing?.staleAfterMs ?? Infinity),
      });
    }
  }
  return [...bindings.values()];
}
export function validatePropertyValue(
  property: BindableProperty,
  raw: unknown,
  widget?: Pick<Widget, 'kind' | 'dashboard'>,
): PropertyValue {
  if (property === 'value' && widget?.kind === 'toggle') {
    if ([true, 1, 'true', '1'].includes(raw as string | number | boolean)) return true;
    if ([false, 0, 'false', '0'].includes(raw as string | number | boolean)) return false;
    throw new Error('Toggle value must be true or false.');
  }
  if (property === 'value' && widget?.dashboard && 'options' in widget.dashboard) {
    if (!['string', 'number', 'boolean'].includes(typeof raw))
      throw new Error('Value must match a configured control option.');
    const option =
      widget.dashboard.options.find((option) => String(option.value) === String(raw)) ??
      widget.dashboard.options.find(
        (option) =>
          typeof option.value === 'number' &&
          (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')) &&
          Number.isFinite(Number(raw)) &&
          Number(raw) === option.value,
      );
    if (option) return option.value;
    throw new Error('Value must match a configured control option.');
  }
  if (property === 'text') {
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean')
      throw new Error('Text must be a string, number or boolean.');
    const text = String(raw);
    if (text.length > 300) throw new Error('Text must be at most 300 characters.');
    return text;
  }
  if (property === 'color') {
    if (typeof raw !== 'string' || !/^#[a-f0-9]{6}$/i.test(raw))
      throw new Error('Colour must be a six-digit hex value, such as #329c8c.');
    return raw;
  }
  if (property === 'visible' || property === 'enabled') {
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
    throw new Error('State must be true or false (or 1 or 0).');
  }
  if (
    raw === null ||
    raw === '' ||
    typeof raw === 'boolean' ||
    (typeof raw !== 'number' && typeof raw !== 'string') ||
    !Number.isFinite(Number(raw))
  )
    throw new Error('Value must be a finite number.');
  return Number(raw);
}

export function captureFaceplate(widget: Widget): FaceplateTemplate {
  const template = faceplateTemplateSchema.parse(widget);
  template.binding = null;
  if (template.propertyBindings.value?.type === 'telemetry') delete template.propertyBindings.value;
  // Equipment command targets must be configured per instance, never cloned into a shared type.
  if (template.action.type === 'command' || template.action.type === 'navigate')
    template.action = { type: 'none' };
  if (
    template.doubleClickAction.type === 'command' ||
    template.doubleClickAction.type === 'navigate'
  )
    template.doubleClickAction = { type: 'none' };
  return template;
}
export function createBuiltinFaceplates(): FaceplateType[] {
  return (['pump', 'valve', 'tank'] as const).map((kind) => {
    const widget = newWidget(kind, 0);
    widget.text = kind === 'pump' ? 'P-101' : kind === 'valve' ? 'FV-101' : 'TK-101';
    widget.demoValue = kind === 'pump' ? 1 : kind === 'valve' ? 75 : 68;
    return {
      id: `standard-${kind}`,
      name: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} · standard`,
      kind,
      description: `Reusable ${kind} with independent equipment binding, appearance and operator details.`,
      telemetryKey: kind === 'pump' ? 'running' : kind === 'valve' ? 'position' : 'level',
      versions: [
        { version: 1, createdAt: '2026-11-13T00:00:00.000Z', template: captureFaceplate(widget) },
      ],
    };
  });
}

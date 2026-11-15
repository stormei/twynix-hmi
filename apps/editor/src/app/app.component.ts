import { ActionEditorComponent } from './action-editor.component';
import { CommandFeedbackComponent } from './command-feedback.component';
import { CommandStateService } from './command-state.service';
import { bindingKey } from '@twynix/model';
import { RotationHandleComponent } from './rotation-handle.component';
import { ComponentLibraryComponent } from './component-library.component';
import {
  widgetContentSize,
  selectionFrame,
  resizeRotatedSelection,
} from '../../../../packages/editor/src/rotation';
import {
  loadLibraryPreferences,
  saveLibraryPreferences,
  type LibraryTab,
} from './library-preferences';
import { SymbolLibraryComponent } from './symbol-library.component';
import { DashboardWidgetComponent } from './dashboard/dashboard-widget.component';
import { DashboardPropertiesComponent } from './dashboard/dashboard-properties.component';
import {
  createDashboardWidgets,
  isDashboardKind,
  isControlKind,
  type ControlValue,
} from '@twynix/model';
import {
  equalSpacing,
  smartAlignment,
  spacingIndicators,
  type Guide,
  type Spacing,
} from '../../../../packages/editor/src/smart-guides';
import {
  afterNextRender,
  Injector,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BindableProperty,
  bindableProperties,
  propertyBinding,
  PropertyBinding,
  widgetBindings,
  createStarterProject,
  Project,
  projectSchema,
  Release,
  ScriptEffect,
  Widget,
  WidgetKind,
  widgetKinds,
  FaceplateType,
  PortEndpoint,
  instrumentFunctions,
  SymbolStyle,
  ConnectionMedium,
  SignalMedium,
  ProcessConnection,
} from '@twynix/model';
import {
  processPorts,
  snapToPort,
  ProcessPort,
  portKey,
} from '../../../../packages/editor/src/ports';
import { routeConnection, type RoutePoint } from '../../../../packages/editor/src/pipe-routing';
import { buildPipeBridges } from '../../../../packages/editor/src/pipe-bridges';
import { OperatingRangeComponent } from './operating-range.component';
import {
  signalPorts,
  signalStyles,
  signalDecorations,
} from '../../../../packages/editor/src/signals';
import {
  compatibleSignalTargets,
  nearestSignalTarget,
  previewSignalToPointer,
} from '../../../../packages/editor/src/signal-drag';
import { routePath } from '../../../../packages/editor/src/pipe-routing';
import { DropdownComponent } from './dropdown.component';
import { RulersComponent } from './rulers.component';
import { canvasToScreen } from '../../../../packages/editor/src/viewport';
import { ApiService } from './api.service';
import { EditorStore } from './editor.store';
import { RealtimeService } from './realtime.service';
import { ScriptService } from './script.service';
import { SymbolComponent } from './symbol.component';
import { IconComponent } from './icon.component';
import { PropertyRowComponent } from './property-row.component';
import { BindingEditorComponent } from './binding-editor.component';
import { SelectionToolsComponent } from './selection-tools.component';
import { MultiInspectorComponent } from './multi-inspector.component';
import { LayerRowComponent } from './layer-row.component';
import { ModalDirective } from './modal.directive';
import { ConfirmationComponent } from './confirmation.component';
import { ScreenEditorComponent } from './screen-editor.component';
import { FaceplateEditorComponent } from './faceplate-editor.component';
import { ContextMenuComponent } from './context-menu.component';
import type { MenuItem } from './context-menu.component';
import {
  boundsOf,
  clamp,
  intersects,
  moveWidgets,
  Rect,
  ResizeHandle,
  resizeBounds,
  scaleWidgets,
  selectionUnits,
} from '../../../../packages/editor/src/geometry';
import { FaceplateDraft, faceplateOverrides } from '../../../../packages/editor/src/faceplates';
import {
  BindingEnvironment,
  defaultProperties,
  ResolvedProperties,
  resolveWidgetProperties,
} from '../../../../packages/bindings/src/resolve';

@Component({
  selector: 'twynix-app',
  standalone: true,
  imports: [
    ActionEditorComponent,
    CommandFeedbackComponent,
    RotationHandleComponent,
    ComponentLibraryComponent,
    FormsModule,
    DropdownComponent,
    RulersComponent,
    DatePipe,
    DecimalPipe,
    SymbolComponent,
    SymbolLibraryComponent,
    DashboardWidgetComponent,
    DashboardPropertiesComponent,
    OperatingRangeComponent,
    IconComponent,
    PropertyRowComponent,
    BindingEditorComponent,
    SelectionToolsComponent,
    MultiInspectorComponent,
    LayerRowComponent,
    ModalDirective,
    ConfirmationComponent,
    ScreenEditorComponent,
    FaceplateEditorComponent,
    ContextMenuComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly store = inject(EditorStore);
  readonly api = inject(ApiService);
  readonly commands = inject(CommandStateService);
  private readonly injector = inject(Injector);
  readonly realtime = inject(RealtimeService);
  private readonly scripts = inject(ScriptService);
  readonly dataSource = signal<'simulation' | 'live'>('simulation');
  readonly mode = signal<'edit' | 'preview' | 'runtime'>('edit');
  readonly inspector = signal<'properties' | 'binding' | 'actions' | 'script'>('properties');
  private readonly libraryPreferences = loadLibraryPreferences();
  readonly leftTab = signal<LibraryTab>(this.libraryPreferences.activeTab);
  // Workspace-owned state survives tab changes and is restored from local preferences.
  readonly symbolSearch = signal(this.libraryPreferences.search);
  readonly expandedSymbolCategories = signal<string[]>(this.libraryPreferences.expanded);
  readonly bottomTab = signal<'alarms' | 'console'>('alarms');
  readonly loginOpen = signal(false);
  readonly projectsOpen = signal(false);
  readonly busy = signal(false);
  readonly loginBusy = signal(false);
  readonly loginError = signal('');
  readonly toast = signal('');
  readonly logs = signal<{ time: number; message: string; error: boolean }[]>([]);
  readonly bindingTarget = signal<BindableProperty | null>(null);
  readonly propertyNames = bindableProperties;
  readonly propertyLabels: Record<BindableProperty, string> = {
    value: 'Value',
    text: 'Display text',
    color: 'Accent colour',
    visible: 'Visibility',
    enabled: 'Enabled state',
  };
  readonly resolvedProperties = signal<Record<string, ResolvedProperties>>({});
  private bindingGeneration = 0;
  private resolvingBindings = false;
  private queuedBindings?: {
    widgets: Widget[];
    environment: BindingEnvironment;
    generation: number;
    demos: Map<string, number>;
  };
  private resolvedWidgets = new Map<string, Widget>();
  readonly savedProjects = signal<Project[]>([]);
  readonly releases = signal<Release[]>([]);
  readonly activeRelease = signal<Release | null>(null);
  readonly runtimeProject = signal<Project | null>(null);
  readonly runtimeScreenId = signal('');
  readonly displayScreen = computed(() =>
    this.mode() === 'runtime'
      ? (this.runtimeProject()!.screens.find((s) => s.id === this.runtimeScreenId()) ??
        this.runtimeProject()!.screens[0])
      : this.store.screen(),
  );
  readonly zoom = signal(0.75);
  readonly canvasArea = viewChild.required<ElementRef<HTMLElement>>('canvasArea');
  readonly tick = signal(0);
  readonly effects = signal<Record<string, { text?: string; color?: string }>>({});
  readonly histories = signal<Record<string, number[]>>({});
  readonly scriptTarget = signal<'behavior' | 'onClick' | 'onDoubleClick'>('behavior');
  readonly commandExampleControls = computed(() =>
    this.mode() === 'preview'
      ? this.displayScreen().widgets.filter(
          (widget) =>
            widget.action.type === 'command' &&
            widget.action.policy?.previewOnly &&
            widget.action.params['line'] === 'preview-lab',
        )
      : [],
  );
  resetCommandExample() {
    if (!this.commandExampleControls().length) return;
    const values = { ...this.previewInputs() };
    for (const widget of this.commandExampleControls()) delete values[widget.id];
    this.previewInputs.set(values);
    this.commands.reset(true);
    this.commands.simulationResult = 'confirmed';
  }
  async addCommandExample() {
    if (this.mode() !== 'edit' || this.commands.busy()) return;
    const projectId = this.store.project().id;
    const { createCommandPreviewWidgets } =
      await import('../../../../packages/editor/src/examples/command-preview');
    if (this.mode() !== 'edit' || this.commands.busy() || projectId !== this.store.project().id)
      return;
    this.safe(() =>
      this.store.addScreen('Command Preview lab', 1280, 800, createCommandPreviewWidgets()),
    );
    this.rightOpen.set(false);
    this.leftTab.set('screens');
    this.setMode('preview');
    afterNextRender(() => this.fit(this.canvasArea().nativeElement), { injector: this.injector });
  }
  addDashboardExample() {
    this.store.addScreen('Operations dashboard', 1280, 800, createDashboardWidgets());
    this.fit(this.canvasArea().nativeElement);
  }
  readonly isDashboardKind = isDashboardKind;
  readonly graphicsStyles: { value: SymbolStyle; label: string }[] = [
    { value: 'industrial', label: 'Industrial' },
    { value: 'isa', label: 'ISA-inspired P&ID' },
    { value: 'high-performance', label: 'High-performance HMI' },
  ];
  readonly interactionHint = computed(() =>
    this.mode() === 'preview'
      ? 'Preview · Device commands are simulated'
      : this.mode() === 'runtime'
        ? 'Published runtime · ' + this.realtime.state()
        : this.signalDrag()
          ? this.signalDrag()!.target
            ? 'Release to connect · Esc cancels'
            : 'Drag to a highlighted input · Esc cancels'
          : this.pendingPort()
            ? 'Choose another free port · Esc cancels'
            : this.snappedPorts()
              ? 'Ports aligned · Release to connect'
              : this.connectionMedium() !== 'process'
                ? signalStyles[this.connectionMedium() as SignalMedium].label +
                  ' · Drag a free output to connect'
                : this.api.user()
                  ? 'ThingsBoard · ' + this.realtime.state()
                  : 'Local workspace · Simulation',
  );
  readonly instrumentFunctions = instrumentFunctions;
  readonly visualStyle = computed(
    () =>
      (this.mode() === 'runtime' ? this.runtimeProject() : this.store.project())?.symbolStyle ??
      'industrial',
  );
  readonly screenBackground = computed(() =>
    this.visualStyle() === 'high-performance' ? '#e8ecef' : '#ffffff',
  );
  readonly descriptions: Record<WidgetKind, string> = {
    tank: 'Tank',
    pump: 'Pump',
    valve: 'Valve',
    value: 'Value display',
    label: 'Text label',
    button: 'Button',
    trend: 'Trend',
    motor: 'Motor',
    fan: 'Fan',
    pipe: 'Pipe',
    conveyor: 'Conveyor',
    sensor: 'Sensor',
    elbow: 'Pipe elbow',
    tee: 'Pipe tee',
    connector: 'Pipe connector',
    instrument: 'Instrument bubble',
    chart: 'Chart',
    gauge: 'Gauge',
    markdown: 'Markdown',
    iframe: 'Embedded page',
    html: 'HTML panel',
    dropdown: 'Dropdown',
    slider: 'Slider',
    radio: 'Radio group',
    toggle: 'Toggle switch',
    segmented: 'Multi-state button',
    sparkline: 'Sparkline',
    'linear-gauge': 'Linear gauge',
  };
  username = '';
  password = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private drag?: {
    x: number;
    y: number;
    originals: Widget[];
    bounds: Rect;
    handle?: ResizeHandle;
    moved: boolean;
  };
  private marqueeStart?: { x: number; y: number; base: string[] };
  private panDrag?: { x: number; y: number; original: { x: number; y: number } };
  private paneDrag?: { axis: 'left' | 'right' | 'bottom'; start: number; original: number };
  private spaceHeld = false;
  private singleClick?: ReturnType<typeof setTimeout>;
  readonly pan = signal({ x: 0, y: 0 });
  readonly tool = signal<'select' | 'hand'>('select');
  readonly snap = signal(true);
  readonly grid = signal(true);
  readonly marquee = signal<Rect | null>(null);
  // Preview in canvas coordinates so zoom, snapping and group offsets stay exact.
  readonly dragGhosts = signal<Widget[]>([]);
  readonly alignmentGuides = signal<Guide[]>([]);
  readonly spacingHints = signal<Spacing[]>([]);
  readonly portSnap = signal(true);
  readonly connectionMedium = signal<ConnectionMedium>('process');
  readonly signalStyles = signalStyles;
  readonly activeConnectionLabel = computed(() =>
    this.connectionMedium() === 'process'
      ? 'Process piping'
      : signalStyles[this.connectionMedium() as SignalMedium].label,
  );
  readonly signalMedia: SignalMedium[] = ['electrical', 'pneumatic', 'digital'];
  connectionName(link: ProcessConnection) {
    return link.medium && link.medium !== 'process'
      ? signalStyles[link.medium].label
      : 'Pipe connection';
  }
  chooseConnectionMedium(medium: ConnectionMedium) {
    this.connectionMedium.set(medium);
    this.tool.set('select');
    this.pendingPort.set(null);
    this.signalDrag.set(null);
    this.portSnap.set(true);
  }
  readonly pendingPort = signal<PortEndpoint | null>(null);
  readonly signalDrag = signal<{
    source: ProcessPort;
    medium: SignalMedium;
    x: number;
    y: number;
    cursor: RoutePoint;
    target: ProcessPort | null;
    moved: boolean;
  } | null>(null);
  readonly signalTargets = computed(() => {
    const source = this.signalDrag()?.source;
    return source
      ? compatibleSignalTargets(
          source,
          this.store.screen().widgets,
          this.store.screen().connections,
        )
      : [];
  });
  readonly signalTargetKeys = computed(() => new Set(this.signalTargets().map(portKey)));
  readonly signalDragPreview = computed(() => {
    const drag = this.signalDrag();
    if (!drag?.moved) return null;
    const screen = this.store.screen();
    const route = drag.target
      ? routeConnection(
          { id: 'signal-preview', medium: drag.medium, from: drag.source, to: drag.target },
          screen.widgets,
          screen,
        )
      : previewSignalToPointer(drag.source, drag.cursor, screen.widgets, screen);
    return {
      ...route,
      path: routePath(route.points),
      style: signalStyles[drag.medium],
      marks: signalDecorations(route.points, drag.medium),
    };
  });
  readonly snappedPorts = signal<{ from: ProcessPort; to: ProcessPort } | null>(null);
  readonly rotationPreview = signal<Widget[]>([]);
  readonly canvasWidgets = computed(() => {
    const rotated = new Map(this.rotationPreview().map((widget) => [widget.id, widget]));
    return this.displayScreen().widgets.map((widget) => rotated.get(widget.id) ?? widget);
  });
  readonly renderedPorts = computed(() => {
    const ghosts = new Map(
      [...this.dragGhosts(), ...this.rotationPreview()].map((widget) => [widget.id, widget]),
    );
    return this.displayScreen().widgets.flatMap((widget) =>
      (this.connectionMedium() === 'process' ? processPorts : signalPorts)(
        ghosts.get(widget.id) ?? widget,
      ),
    );
  });
  readonly occupiedPortKeys = computed(
    () =>
      new Set(
        this.displayScreen().connections.flatMap((link) => [portKey(link.from), portKey(link.to)]),
      ),
  );
  readonly portKey = portKey;
  readonly selectedRouteId = signal<string | null>(null);
  readonly routePreview = signal<{ id: string; points: RoutePoint[] } | null>(null);
  private routeDrag?: {
    id: string;
    index: number;
    original: RoutePoint[];
    point: RoutePoint;
    x: number;
    y: number;
    moved: boolean;
  };
  readonly routedConnections = computed(() => {
    const screen = this.displayScreen();
    const ghosts = new Map(
      [...this.dragGhosts(), ...this.rotationPreview()].map((widget) => [widget.id, widget]),
    );
    const widgets = screen.widgets.map((widget) => ghosts.get(widget.id) ?? widget);
    const preview = this.routePreview();
    const routes = screen.connections.map((connection) => {
      const link =
        preview?.id === connection.id ? { ...connection, bendPoints: preview.points } : connection;
      const route = routeConnection(link, widgets, screen);
      const medium = link.medium && link.medium !== 'process' ? link.medium : null;
      return {
        link,
        ...route,
        signalStyle: medium ? signalStyles[medium] : null,
        signalMarks: medium
          ? signalDecorations(route.points, medium)
          : { slashes: [], circles: [] },
      };
    });
    return buildPipeBridges(
      routes,
      widgets.filter((widget) => widget.visible),
      screen,
    );
  });
  readonly selectedRoute = computed(
    () =>
      this.routedConnections().find((route) => route.link.id === this.selectedRouteId()) ?? null,
  );
  readonly routeHandles = computed(() => {
    const route = this.selectedRoute();
    if (!route) return [];
    const pins = route.link.bendPoints ?? [];
    const handles = pins.map((point, index) => ({
      point,
      index,
      insert: false,
      label: `Move route bend ${index + 1}`,
    }));
    if (pins.length >= 32) return handles;
    for (let i = 1; i < route.points.length - 1; i++) {
      const point = route.points[i];
      if (!pins.some((pin) => Math.hypot(pin.x - point.x, pin.y - point.y) < 1))
        handles.push({
          point,
          index: route.legs[i - 1] ?? 0,
          insert: true,
          label: `Adjust route corner ${i}`,
        });
    }
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 35) continue;
      handles.push({
        point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        index: route.legs[i - 1] ?? 0,
        insert: true,
        label: `Add route bend on segment ${i}`,
      });
    }
    return handles;
  });
  readonly portsFor = processPorts;
  readonly fittingKinds = ['elbow', 'tee', 'connector'];
  readonly selectionOutline = computed(() =>
    selectionFrame(
      this.rotationPreview().length
        ? this.rotationPreview()
        : this.dragGhosts().length
          ? this.dragGhosts()
          : this.store.selectedWidgets(),
    ),
  );
  readonly dragBounds = computed(() =>
    this.rotationPreview().length
      ? boundsOf(this.rotationPreview())
      : this.dragGhosts().length
        ? boundsOf(this.dragGhosts())
        : this.store.selectionBounds(),
  );
  readonly layerSearch = signal('');
  readonly collapsedGroups = signal<string[]>([]);
  readonly leftOpen = signal(true);
  readonly rightOpen = signal(typeof window === 'undefined' || window.innerWidth >= 1180);
  readonly bottomOpen = signal(false);
  readonly leftWidth = signal(248);
  readonly rightWidth = signal(320);
  readonly bottomHeight = signal(155);
  readonly shortcutsOpen = signal(false);
  readonly screenDialog = signal<'new' | 'edit' | null>(null);
  readonly faceplateEditor = signal<{ source: Widget; type: FaceplateType | null } | null>(null);
  readonly equipmentDetails = signal<Widget | null>(null);
  readonly confirmation = signal<{
    title: string;
    message: string;
    label: string;
    danger: boolean;
    resolve: (accepted: boolean) => void;
  } | null>(null);
  readonly contextMenu = signal<{ x: number; y: number } | null>(null);
  readonly widgetContentSize = widgetContentSize;
  readonly previewInputs = signal<Record<string, ControlValue>>({});
  readonly handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  readonly selectionUnitCount = computed(() => selectionUnits(this.store.selectedWidgets()).length);
  readonly layerEntries = computed(() => {
    const widgets = [...this.store.screen().widgets].reverse();
    const query = this.layerSearch().trim().toLowerCase();
    const seen = new Set<string>();
    const entries: { id: string; name: string; grouped: boolean; widgets: Widget[] }[] = [];
    for (const widget of widgets) {
      const id = widget.groupId ?? widget.id;
      if (seen.has(id)) continue;
      seen.add(id);
      const members = widget.groupId
        ? widgets.filter((item) => item.groupId === widget.groupId)
        : [widget];
      const name = widget.groupId ? (this.store.screen().groups[id] ?? 'Group') : widget.name;
      if (
        query &&
        !name.toLowerCase().includes(query) &&
        !members.some((item) => item.name.toLowerCase().includes(query))
      )
        continue;
      entries.push({ id, name, grouped: !!widget.groupId, widgets: members });
    }
    return entries;
  });
  readonly contextItems = computed<MenuItem[]>(() => [
    { id: 'copy', label: 'Copy', shortcut: '⌘C', disabled: !this.store.selected() },
    { id: 'paste', label: 'Paste', shortcut: '⌘V', disabled: !this.store.hasClipboard() },
    { id: 'duplicate', label: 'Duplicate', shortcut: '⌘D', disabled: !this.store.selected() },
    {
      id: 'group',
      label: 'Group selection',
      shortcut: '⌘G',
      disabled: !this.store.canTransform() || this.store.selectedWidgets().length < 2,
    },
    {
      id: 'ungroup',
      label: 'Ungroup',
      shortcut: '⇧⌘G',
      disabled: !this.store.selectedWidgets().some((widget) => widget.groupId),
    },
    { id: 'front', label: 'Bring to front', disabled: !this.store.canTransform() },
    { id: 'back', label: 'Bring to back', disabled: !this.store.canTransform() },
    { id: 'rotate', label: 'Rotate clockwise', disabled: !this.store.canTransform() },
    {
      id: 'lock',
      label: this.store.selected()?.locked ? 'Unlock selection' : 'Lock selection',
      disabled: !this.store.selected(),
    },
    {
      id: 'delete',
      label: 'Delete',
      shortcut: '⌫',
      danger: true,
      disabled: !this.store.canTransform(),
    },
  ]);
  private generation = 0;
  private bindingSignature = '';
  private scriptRunning = false;
  readonly alarmBusy = signal<string | null>(null);

  constructor() {
    effect(() =>
      saveLibraryPreferences({
        version: 1,
        search: this.symbolSearch(),
        expanded: this.expandedSymbolCategories(),
        activeTab: this.leftTab(),
      }),
    );
    effect(() => {
      if (this.store.selectedIds().length) this.selectedRouteId.set(null);
    });
    effect(() => {
      this.mode();
      this.store.screenId();
      this.rotationPreview.set([]);
      this.pendingPort.set(null);
      this.signalDrag.set(null);
      this.selectedRouteId.set(null);
      this.routePreview.set(null);
    });
    void this.api.restore();
    afterNextRender(() => this.fit(this.canvasArea().nativeElement));
    effect(() => {
      const current = this.commands.current();
      if (!current) return;
      const widget = this.displayScreen().widgets.find((widget) => widget.id === current.widgetId);
      if (!widget) return;
      const binding = propertyBinding(widget, 'value');
      const source = binding && binding.type !== 'constant' ? binding.source : null;
      const sample = source ? this.realtime.values()[bindingKey(source)] : undefined;
      this.commands.observe(this.value(widget), this.quality(widget), sample?.timestamp ?? 0);
    });
    effect(() => {
      const user = this.api.user();
      const screen = this.displayScreen();
      const bindings = screen.widgets.flatMap(widgetBindings);
      const signature = `${user?.id.id ?? ''}:${JSON.stringify(bindings)}`;
      if (signature === this.bindingSignature) return;
      this.bindingSignature = signature;
      if (user) {
        this.dataSource.set('live');
        this.realtime.connect(bindings);
      } else this.realtime.disconnect(this.dataSource() === 'simulation');
    });
    effect(() => {
      if (this.realtime.expired()) {
        this.api.clearSession();
        this.notify('Your session expired. Live values are stale. Sign in again.', true);
        this.loginOpen.set(true);
      }
    });
    effect(() => {
      const screen = this.displayScreen();
      const environment = this.bindingEnvironment();
      const generation = ++this.bindingGeneration;
      this.queuedBindings = {
        widgets: screen.widgets,
        environment,
        generation,
        demos: new Map(screen.widgets.map((widget) => [widget.id, this.simulatedValue(widget)])),
      };
      void this.refreshBindings();
    });
    setInterval(() => {
      this.tick.update((t) => t + 1);
      this.recordSamples();
      if (this.mode() !== 'edit') void this.runBehaviors();
    }, 2000);
  }
  private async refreshBindings() {
    if (this.resolvingBindings) return;
    this.resolvingBindings = true;
    try {
      // Coalesce updates while the interpreter is busy instead of growing its work queue.
      while (this.queuedBindings) {
        const batch = this.queuedBindings;
        this.queuedBindings = undefined;
        const entries = await Promise.all(
          batch.widgets.map(
            async (widget) =>
              [
                widget.id,
                await resolveWidgetProperties(
                  widget,
                  { ...batch.environment, demoValue: batch.demos.get(widget.id)! },
                  (source, context) => this.scripts.expression(source, context),
                ),
              ] as const,
          ),
        );
        if (batch.generation === this.bindingGeneration) {
          this.resolvedWidgets = new Map(batch.widgets.map((widget) => [widget.id, widget]));
          this.resolvedProperties.set(Object.fromEntries(entries));
        }
      }
    } finally {
      this.resolvingBindings = false;
    }
  }
  notify(message: string, error = false) {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 6500);
    this.log(message, error);
  }
  log(message: string, error = false) {
    this.logs.update((logs) => [{ time: Date.now(), message, error }, ...logs].slice(0, 100));
  }
  bindingEnvironment(): BindingEnvironment {
    this.tick();
    return {
      simulation: this.dataSource() === 'simulation',
      connected: this.realtime.state() === 'connected',
      values: this.realtime.values(),
      demoValue: this.store.selected()?.demoValue ?? 0,
      now: Date.now(),
    };
  }
  private simulatedValue(widget: Widget) {
    return isControlKind(widget.kind) ||
      ['pump', 'motor', 'fan', 'pipe', 'conveyor', 'sensor'].includes(widget.kind)
      ? widget.demoValue
      : Math.round(
          (widget.demoValue +
            (this.mode() === 'edit' ? 0 : Math.sin(this.tick() / 3 + widget.x) * 1.5)) *
            10,
        ) / 10;
  }
  properties(widget: Widget): ResolvedProperties {
    const resolved = this.resolvedProperties()[widget.id];
    if (resolved && this.resolvedWidgets.get(widget.id) === widget) return resolved;
    const defaults = defaultProperties(widget, {
      ...this.bindingEnvironment(),
      demoValue: this.simulatedValue(widget),
    });
    // Do not retain an old enabled/hidden result while a new definition is being evaluated.
    if (propertyBinding(widget, 'enabled')?.enabled)
      defaults.enabled = { value: false, quality: 'unknown' };
    if (propertyBinding(widget, 'visible')?.enabled)
      defaults.visible = { value: true, quality: 'unknown' };
    if (propertyBinding(widget, 'value')?.enabled)
      defaults.value = { value: null, quality: 'unknown' };
    return defaults;
  }
  value(widget: Widget): unknown {
    return this.properties(widget).value.value;
  }
  quality(widget: Widget) {
    return this.properties(widget).value.quality;
  }
  widgetColor(widget: Widget) {
    if (propertyBinding(widget, 'color')?.enabled)
      return String(this.properties(widget).color.value);
    const appearance = this.mode() !== 'edit' ? this.effects()[widget.id]?.color : undefined;
    return appearance && /^#[a-f\d]{6}$/i.test(appearance) ? appearance : widget.color;
  }
  widgetText(widget: Widget): string | null {
    if (propertyBinding(widget, 'text')?.enabled)
      return String(this.properties(widget).text.value ?? '');
    return this.mode() !== 'edit' ? (this.effects()[widget.id]?.text ?? null) : null;
  }
  precision(value: number) {
    return Math.round(value * 100) / 100;
  }
  widgetUnit(widget: Widget) {
    const definition = propertyBinding(widget, 'value');
    if (definition?.enabled && definition.type !== 'constant' && definition.source?.unit)
      return definition.source.unit;
    return widget.kind === 'value'
      ? widget.text
      : ['tank', 'valve'].includes(widget.kind)
        ? '%'
        : '';
  }
  widgetVisible(widget: Widget) {
    return this.properties(widget).visible.value === true;
  }
  widgetEnabled(widget: Widget) {
    return this.properties(widget).enabled.value === true;
  }
  bound(widget: Widget, property: BindableProperty) {
    return !!propertyBinding(widget, property)?.enabled;
  }
  hasBindings(widget: Widget) {
    return bindableProperties.some((property) => !!propertyBinding(widget, property));
  }
  bindingDescription(widget: Widget, property: BindableProperty) {
    const definition = propertyBinding(widget, property);
    return !definition
      ? 'Not bound'
      : !definition.enabled
        ? 'Disabled'
        : definition.type === 'constant'
          ? 'Constant'
          : definition.type === 'expression'
            ? 'Expression'
            : definition.source.key;
  }
  propertyDisplay(widget: Widget, property: BindableProperty) {
    const value = this.properties(widget)[property].value;
    return value === null
      ? '—'
      : typeof value === 'boolean'
        ? value
          ? 'True'
          : 'False'
        : String(value);
  }
  openBinding(property: BindableProperty) {
    if (this.mode() === 'edit' && !this.store.selected()?.locked) this.bindingTarget.set(property);
  }
  applyPropertyBinding(definition: PropertyBinding | null) {
    const widget = this.store.selected(),
      property = this.bindingTarget();
    if (!widget || !property || this.mode() !== 'edit') return;
    const propertyBindings = { ...widget.propertyBindings };
    if (definition) propertyBindings[property] = definition;
    else delete propertyBindings[property];
    this.store.updateWidget({
      propertyBindings,
      ...(property === 'value' ? { binding: null } : {}),
    });
    this.bindingTarget.set(null);
    this.notify(`${this.propertyLabels[property]} binding ${definition ? 'applied' : 'removed'}.`);
  }
  controlQuality(widget: Widget) {
    return this.isPreviewCommand(widget) ? 'simulation' : this.quality(widget);
  }
  private isPreviewCommand(widget: Widget) {
    return (
      this.mode() !== 'runtime' &&
      widget.action.type === 'command' &&
      widget.action.policy?.previewOnly
    );
  }
  controlDisplayValue(widget: Widget) {
    if (
      this.mode() === 'preview' &&
      isControlKind(widget.kind) &&
      Object.hasOwn(this.previewInputs(), widget.id)
    )
      return this.previewInputs()[widget.id];
    if (this.isPreviewCommand(widget)) {
      const config = widget.dashboard;
      return config && 'options' in config
        ? config.options[0].value
        : widget.kind === 'toggle'
          ? !!widget.demoValue
          : widget.demoValue;
    }
    return this.value(widget);
  }
  controlInput(widget: Widget, value: ControlValue) {
    if (this.mode() === 'edit' || !this.widgetEnabled(widget) || !this.widgetVisible(widget))
      return;
    if (this.mode() === 'preview')
      this.previewInputs.update((values) => ({ ...values, [widget.id]: value }));
    void this.activate(widget, 'activate', value);
  }
  samples(widget: Widget) {
    return this.histories()[widget.id] ?? [];
  }
  private recordSamples() {
    const next = { ...this.histories() };
    for (const widget of this.displayScreen().widgets)
      if (
        ['trend', 'chart', 'sparkline'].includes(widget.kind) &&
        ['good', 'simulation'].includes(this.quality(widget))
      ) {
        const value = this.value(widget);
        if (value !== null && Number.isFinite(Number(value)))
          next[widget.id] = [...(next[widget.id] ?? []), Number(value)].slice(-80);
      }
    this.histories.set(next);
  }
  selectRoute(event: Event, id: string) {
    event.preventDefault();
    event.stopPropagation();
    if (this.mode() !== 'edit') return;
    this.store.clearSelection();
    this.pendingPort.set(null);
    this.selectedRouteId.set(id);
    this.canvasArea().nativeElement.focus({ preventScroll: true });
  }
  routeHandleDown(
    event: PointerEvent,
    handle: { point: RoutePoint; index: number; insert: boolean },
  ) {
    event.preventDefault();
    event.stopPropagation();
    const route = this.selectedRoute();
    if (!route || event.button !== 0) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const original = structuredClone(route.link.bendPoints ?? []);
    if (handle.insert) original.splice(handle.index, 0, { ...handle.point });
    this.routeDrag = {
      id: route.link.id,
      index: handle.index,
      original,
      point: handle.point,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  }
  routeHandleKey(
    event: KeyboardEvent,
    handle: { point: RoutePoint; index: number; insert: boolean },
  ) {
    const route = this.selectedRoute();
    if (!route) return;
    if (['Delete', 'Backspace'].includes(event.key) && !handle.insert) {
      event.preventDefault();
      event.stopPropagation();
      const points = [...(route.link.bendPoints ?? [])];
      points.splice(handle.index, 1);
      this.store.updatePipeBends(route.link.id, points);
      return;
    }
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 8 : 1;
    const points = structuredClone(route.link.bendPoints ?? []);
    const point = {
      x: clamp(
        handle.point.x +
          (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
        0,
        this.store.screen().width,
      ),
      y: clamp(
        handle.point.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
        0,
        this.store.screen().height,
      ),
    };
    if (handle.insert) points.splice(handle.index, 0, point);
    else points[handle.index] = point;
    this.store.updatePipeBends(route.link.id, points);
    requestAnimationFrame(() =>
      this.canvasArea()
        .nativeElement.querySelector<SVGElement>(`circle[data-pin-index="${handle.index}"]`)
        ?.focus(),
    );
  }
  removeRoutePin(index: number) {
    const route = this.selectedRoute();
    if (!route) return;
    this.store.updatePipeBends(
      route.link.id,
      (route.link.bendPoints ?? []).filter((_, i) => i !== index),
    );
  }
  portDown(event: Event, port: ProcessPort) {
    event.preventDefault();
    event.stopPropagation();
    if (this.mode() !== 'edit' || this.occupiedPortKeys().has(portKey(port))) return;
    if (this.store.screen().widgets.find((widget) => widget.id === port.widgetId)?.locked) return;
    const first = this.pendingPort();
    if (
      (!first || portKey(first) === portKey(port)) &&
      this.connectionMedium() !== 'process' &&
      port.port === 'signal-out' &&
      event instanceof PointerEvent
    ) {
      if (event.button !== 0) return;
      this.pendingPort.set(null);
      this.selectedRouteId.set(null);
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      this.canvasArea().nativeElement.focus({ preventScroll: true });
      this.signalDrag.set({
        source: port,
        medium: this.connectionMedium() as SignalMedium,
        x: event.clientX,
        y: event.clientY,
        cursor: { x: port.x, y: port.y },
        target: null,
        moved: false,
      });
      return;
    }
    if (!first) this.pendingPort.set(port);
    else {
      const connected = this.store.connectPorts(first, port, true, this.connectionMedium());
      if (!connected)
        this.notify(
          this.connectionMedium() === 'process'
            ? 'Choose two free process ports on different components.'
            : 'Connect a free signal output to an instrument input or valve actuator.',
          true,
        );
      this.pendingPort.set(null);
    }
  }
  rotateFitting() {
    const widget = this.store.selected();
    if (!widget || !this.fittingKinds.includes(widget.kind)) return;
    this.store.updateWidget({
      pipeRotation: ((widget.pipeRotation + 90) % 360) as 0 | 90 | 180 | 270,
    });
  }
  select(widget: Widget, event?: MouseEvent | KeyboardEvent) {
    this.selectedRouteId.set(null);
    if (this.mode() !== 'edit') return;
    this.store.select(
      widget.id,
      !!(event?.shiftKey || event?.metaKey || event?.ctrlKey),
      !!event?.altKey,
    );
  }
  selectGroup(ids: string[], event: MouseEvent) {
    const selected = new Set(this.store.selectedIds());
    if (event.shiftKey || event.metaKey) {
      if (ids.every((id) => selected.has(id))) ids.forEach((id) => selected.delete(id));
      else ids.forEach((id) => selected.add(id));
      this.store.selectIds([...selected], false);
    } else this.store.selectIds(ids, false);
  }
  numericValue(widget: Widget) {
    return Number(this.value(widget));
  }
  groupSelected(widgets: Widget[]) {
    return widgets.every((widget) => this.store.selectedIds().includes(widget.id));
  }
  groupIds(widgets: Widget[]) {
    return widgets.map((widget) => widget.id);
  }
  toggleGroup(id: string) {
    this.collapsedGroups.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }
  worldPoint(event: { clientX: number; clientY: number }) {
    const rect = this.canvasArea().nativeElement.getBoundingClientRect();
    return canvasToScreen(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      { width: rect.width, height: rect.height },
      this.displayScreen(),
      this.zoom(),
      this.pan(),
    );
  }
  private startPan(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.panDrag = { x: event.clientX, y: event.clientY, original: { ...this.pan() } };
  }
  backgroundDown(event: PointerEvent) {
    if (event.button === 1 || this.tool() === 'hand' || this.spaceHeld) {
      this.startPan(event);
      return;
    }
    if (this.mode() !== 'edit' || event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.selectedRouteId.set(null);
    const point = this.worldPoint(event);
    this.marqueeStart = {
      x: point.x,
      y: point.y,
      base: event.shiftKey ? [...this.store.selectedIds()] : [],
    };
  }
  pointerDown(event: PointerEvent, widget: Widget) {
    this.selectedRouteId.set(null);
    if (event.button === 1 || this.tool() === 'hand' || this.spaceHeld) {
      this.startPan(event);
      return;
    }
    if (this.mode() !== 'edit' || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    if (widget.locked) return;
    this.canvasArea().nativeElement.focus({ preventScroll: true });
    if (event.shiftKey || event.metaKey || event.ctrlKey) this.select(widget, event);
    else if (!this.store.selectedIds().includes(widget.id))
      this.store.selectOnly(widget.id, event.altKey);
    if (!this.store.canTransform()) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = {
      x: event.clientX,
      y: event.clientY,
      originals: structuredClone(this.store.selectedWidgets()),
      bounds: this.store.selectionBounds()!,
      moved: false,
    };
  }
  resizeCursor(handle: ResizeHandle, rotation: number) {
    const angle =
      (Math.atan2(
        handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0,
        handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0,
      ) *
        180) /
        Math.PI +
      rotation;
    return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][
      ((Math.round(angle / 45) % 4) + 4) % 4
    ];
  }
  resizeDown(event: PointerEvent, handle: ResizeHandle) {
    if (this.mode() !== 'edit' || !this.store.canTransform()) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = {
      x: event.clientX,
      y: event.clientY,
      originals: structuredClone(this.store.selectedWidgets()),
      bounds: this.store.selectionBounds()!,
      handle,
      moved: false,
    };
  }
  resizePane(event: PointerEvent, axis: 'left' | 'right' | 'bottom') {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.paneDrag = {
      axis,
      start: axis === 'bottom' ? event.clientY : event.clientX,
      original:
        axis === 'left'
          ? this.leftWidth()
          : axis === 'right'
            ? this.rightWidth()
            : this.bottomHeight(),
    };
  }
  paneKey(event: KeyboardEvent, axis: 'left' | 'right' | 'bottom') {
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 16 : -16;
    if (axis === 'left') this.leftWidth.update((width) => clamp(width + delta, 200, 400));
    if (axis === 'right') this.rightWidth.update((width) => clamp(width - delta, 270, 460));
    if (axis === 'bottom') this.bottomHeight.update((height) => clamp(height - delta, 100, 350));
  }
  private updateSignalDrag(event: PointerEvent) {
    const drag = this.signalDrag();
    if (!drag) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 4;
    const point = this.worldPoint(event),
      screen = this.store.screen();
    const cursor = { x: clamp(point.x, 0, screen.width), y: clamp(point.y, 0, screen.height) };
    this.signalDrag.set({
      ...drag,
      moved,
      cursor,
      target: nearestSignalTarget(point, this.signalTargets(), this.zoom()),
    });
  }
  @HostListener('window:pointermove', ['$event']) pointerMove(event: PointerEvent) {
    if (this.signalDrag()) {
      this.updateSignalDrag(event);
      return;
    }
    if (this.routeDrag) {
      const drag = this.routeDrag,
        dx = (event.clientX - drag.x) / this.zoom(),
        dy = (event.clientY - drag.y) / this.zoom();
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      drag.moved = true;
      const snap = this.snap() && !event.ctrlKey && !event.metaKey;
      const x = drag.point.x + dx,
        y = drag.point.y + dy;
      const points = structuredClone(drag.original);
      points[drag.index] = {
        x: clamp(snap ? Math.round(x / 8) * 8 : x, 0, this.store.screen().width),
        y: clamp(snap ? Math.round(y / 8) * 8 : y, 0, this.store.screen().height),
      };
      this.routePreview.set({ id: drag.id, points });
      return;
    }
    if (this.paneDrag) {
      const pane = this.paneDrag,
        delta = (pane.axis === 'bottom' ? event.clientY : event.clientX) - pane.start;
      if (pane.axis === 'left')
        this.leftWidth.set(
          clamp(pane.original + delta, 200, Math.min(400, window.innerWidth * 0.3)),
        );
      else if (pane.axis === 'right')
        this.rightWidth.set(
          clamp(pane.original - delta, 270, Math.min(460, window.innerWidth * 0.35)),
        );
      else
        this.bottomHeight.set(
          clamp(pane.original - delta, 100, Math.min(350, window.innerHeight * 0.4)),
        );
      return;
    }
    if (this.panDrag) {
      this.pan.set({
        x: this.panDrag.original.x + event.clientX - this.panDrag.x,
        y: this.panDrag.original.y + event.clientY - this.panDrag.y,
      });
      return;
    }
    if (this.marqueeStart) {
      const point = this.worldPoint(event),
        start = this.marqueeStart;
      const box = {
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      };
      if (box.width + box.height < 4) return;
      this.marquee.set(box);
      this.store.selectIds([
        ...start.base,
        ...this.store
          .screen()
          .widgets.filter((widget) => !widget.locked && intersects(widget, box))
          .map((widget) => widget.id),
      ]);
      return;
    }
    const drag = this.drag;
    if (!drag) return;
    let dx = (event.clientX - drag.x) / this.zoom(),
      dy = (event.clientY - drag.y) / this.zoom();
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    if (!drag.moved) {
      if (drag.handle) this.store.checkpoint('Resize selection');
      drag.moved = true;
    }
    if (this.snap() && !event.ctrlKey && !event.metaKey) {
      dx = Math.round(dx / 8) * 8;
      dy = Math.round(dy / 8) * 8;
    }
    const screen = {
      x: 0,
      y: 0,
      width: this.store.screen().width,
      height: this.store.screen().height,
    };
    if (drag.handle && drag.originals.some((widget) => widget.rotation !== 0)) {
      const resized = resizeRotatedSelection(
        drag.originals,
        drag.handle,
        dx,
        dy,
        screen,
        event.shiftKey,
      );
      if (resized) this.store.replaceWidgets(resized, false);
    } else if (drag.handle) {
      const minWidth = Math.max(
        ...drag.originals.map((widget) => (40 / widget.width) * drag.bounds.width),
      );
      const minHeight = Math.max(
        ...drag.originals.map((widget) => (30 / widget.height) * drag.bounds.height),
      );
      const target = resizeBounds(
        drag.bounds,
        drag.handle,
        dx,
        dy,
        screen,
        minWidth,
        minHeight,
        event.shiftKey,
      );
      const maxWidth = Math.min(
        ...drag.originals.map((widget) => (2000 / widget.width) * drag.bounds.width),
      );
      const maxHeight = Math.min(
        ...drag.originals.map((widget) => (2000 / widget.height) * drag.bounds.height),
      );
      if (target.width > maxWidth || target.height > maxHeight) return;
      this.store.replaceWidgets(scaleWidgets(drag.originals, drag.bounds, target), false);
    } else {
      if (event.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      let moving = moveWidgets(drag.originals, dx, dy, screen);
      const references = this.store
        .screen()
        .widgets.filter(
          (widget) =>
            !drag.originals.some((original) => original.id === widget.id) && widget.visible,
        );
      const bypassGuides = event.ctrlKey || event.metaKey;
      const axes = !event.shiftKey ? { x: true, y: true } : { x: dy === 0, y: dx === 0 };
      if (!bypassGuides) {
        const alignment = smartAlignment(
          boundsOf(moving)!,
          references,
          screen,
          5 / this.zoom(),
          axes,
        );
        const spacing = equalSpacing(boundsOf(moving)!, references, screen, 5 / this.zoom(), axes);
        moving = moveWidgets(
          moving,
          spacing.matched.x ? spacing.offset.x : alignment.offset.x,
          spacing.matched.y ? spacing.offset.y : alignment.offset.y,
          screen,
        );
      }
      const movingIds = new Set(moving.map((widget) => widget.id));
      const snapped =
        this.portSnap() && this.connectionMedium() === 'process' && !event.ctrlKey && !event.metaKey
          ? snapToPort(
              moving,
              this.store
                .screen()
                .widgets.filter((widget) => !movingIds.has(widget.id) && !widget.locked),
              this.store.screen().connections,
              14 / this.zoom(),
              screen,
            )
          : { widgets: moving, connection: null };
      this.snappedPorts.set(snapped.connection);
      this.dragGhosts.set(snapped.widgets);
      // Port attachment wins; derive overlays from the final ghost position.
      this.alignmentGuides.set(
        bypassGuides
          ? []
          : smartAlignment(boundsOf(snapped.widgets)!, references, screen, 0.05).guides,
      );
      const finalBounds = boundsOf(snapped.widgets)!;
      const equalHints = equalSpacing(finalBounds, references, screen, 0.05).indicators;
      const measured = spacingIndicators(finalBounds, references).filter(
        (gap) => !equalHints.some((equal) => (equal.x1 === equal.x2) === (gap.x1 === gap.x2)),
      );
      this.spacingHints.set(bypassGuides ? [] : [...measured, ...equalHints]);
    }
  }
  @HostListener('window:pointerup', ['$event']) pointerUp(event?: PointerEvent) {
    if (this.signalDrag()) {
      if (event) this.updateSignalDrag(event);
      const drag = this.signalDrag()!;
      if (drag.moved) {
        if (drag.target && this.store.connectPorts(drag.source, drag.target, true, drag.medium)) {
          this.store.clearSelection();
          this.selectedRouteId.set(this.store.screen().connections.at(-1)!.id);
        }
        this.pendingPort.set(null);
      } else this.pendingPort.set(drag.source); // Retain click-to-connect and keyboard workflows.
      this.signalDrag.set(null);
    }
    const preview = this.routePreview();
    if (this.routeDrag?.moved && preview) this.store.updatePipeBends(preview.id, preview.points);
    this.routeDrag = undefined;
    this.routePreview.set(null);
    if (this.marqueeStart && !this.marquee()) this.store.selectIds(this.marqueeStart.base, false);
    if (this.dragGhosts().length) this.store.placeConnected(this.dragGhosts(), this.snappedPorts());
    this.dragGhosts.set([]);
    this.alignmentGuides.set([]);
    this.spacingHints.set([]);
    this.snappedPorts.set(null);
    if (this.drag?.moved) this.store.flushRecovery();
    this.drag = undefined;
    this.panDrag = undefined;
    this.paneDrag = undefined;
    this.marqueeStart = undefined;
    this.marquee.set(null);
  }
  @HostListener('window:pointercancel') pointerCancel() {
    this.signalDrag.set(null);
    this.routeDrag = undefined;
    this.routePreview.set(null);
    this.dragGhosts.set([]);
    this.alignmentGuides.set([]);
    this.spacingHints.set([]);
    this.pointerUp();
  }
  @HostListener('window:keyup', ['$event']) keyUp(event: KeyboardEvent) {
    if (event.code === 'Space') this.spaceHeld = false;
  }
  @HostListener('window:blur') blur() {
    this.spaceHeld = false;
    this.pointerCancel();
  }
  @HostListener('document:pointerdown', ['$event']) outsideMenu(event: PointerEvent) {
    if (!(event.target as HTMLElement).closest('tx-context-menu')) this.contextMenu.set(null);
  }
  @HostListener('window:keydown', ['$event']) keyboard(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented) return;
    if (
      target.closest('input, textarea, select, [contenteditable], dialog, tx-context-menu') ||
      (target.closest('tx-dropdown') && !event.metaKey && !event.ctrlKey) ||
      this.bindingTarget() ||
      this.loginOpen() ||
      this.projectsOpen() ||
      this.commands.pending() ||
      this.confirmation() ||
      this.screenDialog() ||
      this.faceplateEditor() ||
      this.shortcutsOpen() ||
      this.equipmentDetails()
    )
      return;
    const mod = event.metaKey || event.ctrlKey,
      key = event.key.toLowerCase();
    if (event.code === 'Space' && !target.closest('button')) {
      event.preventDefault();
      this.spaceHeld = true;
      return;
    }
    if (mod && key === 's') {
      event.preventDefault();
      void this.save();
      return;
    }
    if (event.key === '?' || key === 'f1') {
      event.preventDefault();
      this.shortcutsOpen.set(true);
      return;
    }
    if (event.shiftKey && event.code === 'Digit1') {
      event.preventDefault();
      this.fit(this.canvasArea().nativeElement);
      return;
    }
    if (event.shiftKey && event.code === 'Digit2') {
      event.preventDefault();
      this.fitSelection();
      return;
    }
    if (mod && ['=', '+', '-', '0'].includes(key)) {
      event.preventDefault();
      if (key === '0') this.setZoomTo(1);
      else this.setZoom(key === '-' ? -0.1 : 0.1);
      return;
    }
    if (this.mode() !== 'edit') return;
    if (mod && ['z', 'c', 'v', 'd', 'g', 'a'].includes(key)) {
      event.preventDefault();
      if (key === 'z') {
        if (event.shiftKey) this.store.redo();
        else this.store.undo();
      }
      if (key === 'c') this.store.copy();
      if (key === 'v') this.safe(() => this.store.paste());
      if (key === 'd') this.safe(() => this.store.duplicate());
      if (key === 'g') {
        if (event.shiftKey) this.store.ungroup();
        else this.store.group();
      }
      if (key === 'a') this.store.selectAll();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (this.selectedRouteId()) {
        this.store.deletePipe(this.selectedRouteId()!);
        this.selectedRouteId.set(null);
      } else this.store.delete();
    } else if (event.key === 'Escape') {
      if (this.signalDrag()) {
        this.signalDrag.set(null);
        this.pendingPort.set(null);
        return;
      }
      this.pendingPort.set(null);
      if (this.routeDrag) {
        this.pointerCancel();
        return;
      }
      this.selectedRouteId.set(null);
      if (this.drag) {
        this.pointerCancel();
        return;
      }
      this.contextMenu.set(null);
      this.store.clearSelection();
      this.tool.set('select');
    } else if (event.key.startsWith('Arrow') && this.store.selected()) {
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 1;
      this.store.nudge(
        event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0,
        event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0,
      );
    } else if (!mod && key === 'v') this.tool.set('select');
    else if (!mod && key === 'h') this.tool.set('hand');
  }
  updateNumber(key: 'x' | 'y' | 'width' | 'height' | 'demoValue', value: string) {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    const bounds = this.store.selectionBounds();
    if (!bounds || !this.store.canTransform()) return;
    if (key === 'demoValue') {
      this.store.updateWidget({ demoValue: number });
      return;
    }
    const screen = this.store.screen();
    if (key === 'x' || key === 'y') {
      this.store.nudge(
        key === 'x' ? clamp(number, 0, screen.width - bounds.width) - bounds.x : 0,
        key === 'y' ? clamp(number, 0, screen.height - bounds.height) - bounds.y : 0,
      );
      return;
    }
    const target = {
      ...bounds,
      [key]:
        key === 'width'
          ? clamp(number, 40, screen.width - bounds.x)
          : clamp(number, 30, screen.height - bounds.y),
    };
    this.safe(() => this.store.resizeSelection(target));
  }
  setZoom(delta: number) {
    this.setZoomTo(this.zoom() + delta);
  }
  setZoomTo(value: number, anchor?: { x: number; y: number }) {
    const next = clamp(Math.round(value * 100) / 100, 0.1, 3),
      old = this.zoom();
    const point = anchor ?? { x: 0, y: 0 },
      pan = this.pan();
    this.pan.set({
      x: point.x - ((point.x - pan.x) * next) / old,
      y: point.y - ((point.y - pan.y) * next) / old,
    });
    this.zoom.set(next);
  }
  wheel(event: WheelEvent) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = this.canvasArea().nativeElement.getBoundingClientRect();
      this.setZoomTo(this.zoom() * Math.exp(-event.deltaY * 0.005), {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      });
    } else this.pan.update((point) => ({ x: point.x - event.deltaX, y: point.y - event.deltaY }));
  }
  fit(container: HTMLElement) {
    this.zoom.set(
      clamp(
        Math.min(
          1,
          (container.clientWidth - 112) / this.displayScreen().width,
          (container.clientHeight - 96) / this.displayScreen().height,
        ),
        0.1,
        3,
      ),
    );
    this.pan.set({ x: 0, y: 0 });
  }
  fitSelection() {
    const route = this.selectedRoute();
    const box = route?.points.length
      ? boundsOf([
          ...route.points.map((point) => ({ ...point, width: 0, height: 0 })),
          ...this.displayScreen().widgets.filter(
            (widget) =>
              widget.id === route.link.from.widgetId || widget.id === route.link.to.widgetId,
          ),
        ])
      : this.store.selectionBounds();
    if (!box) {
      this.fit(this.canvasArea().nativeElement);
      return;
    }
    const area = this.canvasArea().nativeElement,
      zoom = clamp(
        Math.min(
          (area.clientWidth - 120) / Math.max(40, box.width),
          (area.clientHeight - 120) / Math.max(40, box.height),
        ),
        0.1,
        3,
      );
    this.zoom.set(zoom);
    this.pan.set({
      x: (this.displayScreen().width / 2 - box.x - box.width / 2) * zoom,
      y: (this.displayScreen().height / 2 - box.y - box.height / 2) * zoom,
    });
  }
  paletteDrag(event: DragEvent, kind: string, faceplate = false) {
    event.dataTransfer?.setData('application/x-twynix-symbol', JSON.stringify({ kind, faceplate }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }
  allowDrop(event: DragEvent) {
    if (this.mode() === 'edit' && event.dataTransfer?.types.includes('application/x-twynix-symbol'))
      event.preventDefault();
  }
  drop(event: DragEvent) {
    if (this.mode() !== 'edit') return;
    event.preventDefault();
    try {
      const payload = JSON.parse(event.dataTransfer?.getData('application/x-twynix-symbol') ?? '');
      const point = this.worldPoint(event);
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > this.store.screen().width ||
        point.y > this.store.screen().height
      ) {
        this.notify('Drop inside the target screen.');
        return;
      }
      if (payload.faceplate) this.store.addFaceplate(String(payload.kind), point);
      else if (widgetKinds.includes(payload.kind))
        this.store.add(
          payload.kind,
          point,
          this.portSnap() &&
            this.connectionMedium() === 'process' &&
            !event.ctrlKey &&
            !event.metaKey
            ? 14 / this.zoom()
            : 0,
        );
    } catch {
      this.notify('This item could not be added to the screen.', true);
    }
  }
  openContext(event: MouseEvent, widget?: Widget) {
    if (this.mode() !== 'edit') return;
    event.preventDefault();
    event.stopPropagation();
    if (widget && !this.store.selectedIds().includes(widget.id)) this.store.selectOnly(widget.id);
    this.contextMenu.set({
      x: clamp(event.clientX, 4, window.innerWidth - 245),
      y: clamp(event.clientY, 4, window.innerHeight - 350),
    });
  }
  closeContext() {
    this.contextMenu.set(null);
    this.canvasArea().nativeElement.focus({ preventScroll: true });
  }
  setObjectRotation(angle: number) {
    const widget = this.store.selected();
    if (!widget) return;
    // Rotate directly in one history transaction rather than creating several undo steps.
    this.safe(() => this.store.setSelectionRotation(Math.round(angle / 5) * 5));
  }
  rotateObjects(clockwise: boolean) {
    this.safe(() => this.store.rotateSelection(clockwise));
  }
  menuAction(id: string) {
    this.closeContext();
    if (id === 'copy') this.store.copy();
    if (id === 'paste') this.safe(() => this.store.paste());
    if (id === 'duplicate') this.safe(() => this.store.duplicate());
    if (id === 'group') this.store.group();
    if (id === 'ungroup') this.store.ungroup();
    if (id === 'front') this.store.reorder(2);
    if (id === 'back') this.store.reorder(-2);
    if (id === 'rotate') this.safe(() => this.store.rotateSelection());
    if (id === 'lock') {
      const lock = !this.store.selected()?.locked;
      this.store.replaceWidgets(
        this.store.selectedWidgets().map((widget) => ({ ...widget, locked: lock })),
        true,
        lock ? 'Lock selection' : 'Unlock selection',
      );
    }
    if (id === 'delete') this.store.delete();
  }
  safe(action: () => void) {
    try {
      action();
    } catch (error) {
      this.notify(this.message(error), true);
    }
  }
  ask(title: string, message: string, label = 'Continue', danger = false): Promise<boolean> {
    return new Promise((resolve) =>
      this.confirmation.set({ title, message, label, danger, resolve }),
    );
  }
  answer(accepted: boolean) {
    const confirmation = this.confirmation();
    this.confirmation.set(null);
    confirmation?.resolve(accepted);
  }
  saveScreen(input: { name: string; width: number; height: number }) {
    this.safe(() => {
      if (this.screenDialog() === 'new')
        this.store.addScreen(input.name, input.width, input.height);
      else this.store.configureScreen(input.name, input.width, input.height);
      this.screenDialog.set(null);
      this.fit(this.canvasArea().nativeElement);
    });
  }
  async deleteScreen() {
    if (
      await this.ask(
        'Delete screen?',
        `Delete “${this.store.screen().name}” and its components? You can undo this change.`,
        'Delete screen',
        true,
      )
    )
      this.safe(() => this.store.deleteScreen());
  }
  typeFor(widget: Widget): FaceplateType | null {
    const project = this.mode() === 'runtime' ? this.runtimeProject()! : this.store.project();
    return project.faceplates.find((type) => type.id === widget.faceplate?.typeId) ?? null;
  }
  overrides(widget: Widget) {
    const type = this.typeFor(widget);
    return type ? faceplateOverrides(widget, type) : [];
  }
  canCreateFaceplate() {
    return (
      this.store.selectedWidgets().length === 1 &&
      ['pump', 'valve', 'tank'].includes(this.store.selected()!.kind)
    );
  }
  editFaceplate(type?: FaceplateType) {
    const widget = this.store.selected();
    const source = type
      ? ({
          ...type.versions.at(-1)!.template,
          id: '',
          name: type.name,
          x: 0,
          y: 0,
          groupId: null,
          locked: false,
          faceplate: null,
        } as Widget)
      : widget;
    if (!source || !['pump', 'valve', 'tank'].includes(source.kind)) return;
    this.faceplateEditor.set({ source, type: type ?? null });
  }
  publishFaceplate(draft: FaceplateDraft) {
    this.safe(() => {
      const type = this.store.publishFaceplate(draft, this.faceplateEditor()?.type?.id);
      this.faceplateEditor.set(null);
      this.leftTab.set('faceplates');
      this.notify(
        `${type.name} v${type.versions.at(-1)!.version} published to the project library.`,
      );
    });
  }
  async resetFaceplate() {
    if (
      await this.ask(
        'Reset instance overrides?',
        'Apply the latest type defaults while keeping this instance’s equipment binding, name, size and position.',
        'Reset overrides',
      )
    )
      this.store.updateFaceplate(true);
  }
  isInteractive(widget: Widget) {
    return (
      !!widget.faceplate ||
      widget.action.type !== 'none' ||
      widget.doubleClickAction.type !== 'none' ||
      !!widget.onClick ||
      !!widget.onDoubleClick
    );
  }
  clickWidget(widget: Widget) {
    if (this.mode() === 'edit') return;
    if (widget.doubleClickAction.type !== 'none' || widget.onDoubleClick) {
      clearTimeout(this.singleClick);
      this.singleClick = setTimeout(() => void this.activate(widget), 260);
    } else void this.activate(widget);
  }
  doubleClickWidget(widget: Widget) {
    if (this.mode() === 'edit') return;
    clearTimeout(this.singleClick);
    void this.activate(widget, 'doubleClick');
  }
  async login() {
    this.loginBusy.set(true);
    this.loginError.set('');
    try {
      await this.api.login(this.username, this.password);
      this.password = '';
      this.loginOpen.set(false);
      this.histories.set({});
      this.notify('Connected to ThingsBoard. Values now use live bindings.');
    } catch (error) {
      this.loginError.set(this.message(error));
    } finally {
      this.loginBusy.set(false);
    }
  }
  async logout() {
    try {
      await this.api.logout();
    } catch (error) {
      this.log(this.message(error), true);
    }
    const wasSending =
      this.commands.current()?.phase === 'sending' && !this.commands.current()?.simulated;
    this.commands.reset();
    this.dataSource.set('simulation');
    this.realtime.disconnect();
    this.histories.set({});
    this.setMode('edit');
    if (wasSending)
      this.log(
        'Session ended with a command in flight. Verify equipment state before issuing another command.',
        true,
      );
    this.notify('Signed out. Simulation workspace is active.');
  }
  continueOffline() {
    this.dataSource.set('simulation');
    this.realtime.disconnect();
    this.histories.set({});
    this.loginOpen.set(false);
  }
  async save() {
    if (this.mode() === 'runtime' || this.busy()) return;
    if (!this.api.user()) {
      if (this.dataSource() === 'live') {
        this.loginOpen.set(true);
        return;
      }
      this.store.export();
      this.notify('Project exported. Sign in to save to the gateway.');
      return;
    }
    this.busy.set(true);
    try {
      const snapshot = projectSchema.parse(this.store.project());
      const saved = await this.api.save(snapshot);
      this.store.saved(saved);
      this.notify(`Draft saved · revision ${saved.revision}`);
    } catch (error) {
      this.notify(this.message(error), true);
    } finally {
      this.busy.set(false);
    }
  }
  async publish() {
    if (!this.api.user()) {
      this.loginOpen.set(true);
      return;
    }
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const snapshot = projectSchema.parse(this.store.project());
      const saved = await this.api.save(snapshot);
      this.store.saved(saved);
      const release = await this.api.publish(saved);
      this.releases.update((all) => [...all, release]);
      this.activeRelease.set(release);
      this.notify(`Published revision ${release.project.revision}. Open Runtime to use it.`);
    } catch (error) {
      this.notify(this.message(error), true);
    } finally {
      this.busy.set(false);
    }
  }
  setMode(mode: 'edit' | 'preview' | 'runtime') {
    if (this.commands.busy()) {
      this.notify('Complete the current command before switching mode.');
      return;
    }
    this.commands.reset();
    this.previewInputs.set({});
    if (mode === 'runtime') {
      const release = this.activeRelease();
      if (!release) {
        this.notify('Publish a project or open a saved release first.');
        return;
      }
      this.runtimeProject.set(projectSchema.parse(release.project));
      this.runtimeScreenId.set(release.project.screens[0].id);
    }
    clearTimeout(this.singleClick);
    this.contextMenu.set(null);
    this.tool.set('select');
    this.mode.set(mode);
    this.effects.set({});
    this.histories.set({});
    this.generation++;
    if (mode !== 'edit') void this.runBehaviors();
  }
  switchScreen(id: string) {
    if (this.commands.busy()) {
      this.notify('Complete the current command before switching screens.');
      return;
    }
    this.commands.reset();
    this.previewInputs.set({});
    clearTimeout(this.singleClick);
    this.pan.set({ x: 0, y: 0 });
    if (this.mode() === 'runtime') this.runtimeScreenId.set(id);
    else this.store.selectScreen(id);
    this.effects.set({});
    this.histories.set({});
    this.generation++;
  }
  async openProjects() {
    if (this.commands.busy()) {
      this.notify('Complete the current command before opening another project.');
      return;
    }
    if (!this.api.user()) {
      this.loginOpen.set(true);
      return;
    }
    try {
      this.savedProjects.set(await this.api.listProjects());
      this.projectsOpen.set(true);
    } catch (error) {
      this.notify(this.message(error), true);
    }
  }
  async loadProject(id: string) {
    if (
      this.store.dirty() &&
      !(await this.ask(
        'Replace unsaved draft?',
        'Export the current draft first if you want to keep a copy.',
        'Replace draft',
      ))
    )
      return;
    try {
      const stored = await this.api.loadProject(id);
      this.store.load(stored.draft);
      this.releases.set(stored.releases);
      this.activeRelease.set(stored.releases.at(-1) ?? null);
      this.projectsOpen.set(false);
      this.setMode('edit');
      this.notify('Project opened.');
    } catch (error) {
      this.notify(this.message(error), true);
    }
  }
  async restoreRelease(release: Release) {
    if (
      !(await this.ask(
        'Restore release to draft?',
        'Unsaved draft changes will be replaced. The published release remains unchanged.',
        'Restore draft',
      ))
    )
      return;
    this.store.load(
      {
        ...structuredClone(release.project),
        revision: this.store.project().revision,
      },
      true,
    );
    this.projectsOpen.set(false);
    this.setMode('edit');
    this.notify('Release copied to draft. Save and publish to deploy this revision.');
  }
  async importFile(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Project files must be smaller than 2 MB.');
      const project = projectSchema.parse(JSON.parse(await file.text()));
      if (
        this.store.dirty() &&
        !(await this.ask(
          'Replace unsaved draft?',
          'Importing replaces the current draft. Export it first to keep a copy.',
          'Import project',
        ))
      )
        return;
      this.store.load({ ...project, id: crypto.randomUUID(), revision: 0 }, true);
      this.activeRelease.set(null);
      this.releases.set([]);
      this.setMode('edit');
      this.notify('Imported as a new project.');
    } catch (error) {
      this.notify(this.message(error), true);
    } finally {
      input.value = '';
    }
  }
  async newProject() {
    if (
      this.store.dirty() &&
      !(await this.ask(
        'Create a new project?',
        'Export the current draft first if you want to keep a copy.',
        'Create project',
      ))
    )
      return;
    const project = createStarterProject();
    project.name = 'Untitled project';
    this.store.load(project, true);
    this.activeRelease.set(null);
    this.releases.set([]);
    this.setMode('edit');
  }
  updateScript(source: string) {
    this.store.updateWidget({ [this.scriptTarget()]: source });
  }
  insertExample() {
    this.updateScript(
      this.scriptTarget() === 'behavior'
        ? '// Runs when values refresh in Preview and Runtime.\nif (context.quality === "good" || context.quality === "simulation") {\n  hmi.setColor(Number(context.value) > 75 ? "#da8054" : "#329c8c");\n}'
        : '// Runs when the operator clicks this symbol.\nhmi.notify("Selected " + context.name);\nhmi.runAction();',
    );
  }
  async testScript() {
    const widget = this.store.selected();
    if (!widget) return;
    try {
      const effects = await this.scripts.run(widget[this.scriptTarget()], {
        value: this.value(widget),
        quality: this.quality(widget),
        name: widget.name,
      });
      this.bottomTab.set('console');
      this.log(`Script passed: ${JSON.stringify(effects)}. Test does not execute device actions.`);
    } catch (error) {
      this.bottomTab.set('console');
      this.notify(this.message(error), true);
    }
  }
  private async runBehaviors() {
    if (this.scriptRunning) return;
    this.scriptRunning = true;
    const generation = this.generation;
    try {
      const next: Record<string, { text?: string; color?: string }> = {};
      for (const widget of this.displayScreen().widgets) {
        if (!widget.behavior.trim()) continue;
        try {
          const effects = await this.scripts.run(widget.behavior, {
            value: this.value(widget),
            quality: this.quality(widget),
            name: widget.name,
          });
          const appearance: { text?: string; color?: string } = {};
          for (const effect of effects) {
            if (effect.type === 'text') appearance.text = effect.value;
            if (effect.type === 'color') appearance.color = effect.value;
          }
          next[widget.id] = appearance;
        } catch (error) {
          const message = `${widget.name}: ${this.message(error)}`;
          if (!this.logs().some((log) => log.message === message)) this.log(message, true);
        }
      }
      if (generation === this.generation) this.effects.set(next);
    } finally {
      this.scriptRunning = false;
    }
  }
  async activate(
    widget: Widget,
    event: 'activate' | 'doubleClick' = 'activate',
    inputValue?: ControlValue,
  ) {
    if (this.mode() === 'edit') {
      this.select(widget);
      return;
    }
    if (!this.widgetEnabled(widget) || !this.widgetVisible(widget)) return;
    const script = event === 'activate' ? widget.onClick : widget.onDoubleClick;
    if (!script.trim()) {
      this.performAction(widget, event, inputValue);
      return;
    }
    const sourceMode = this.mode(),
      sourceScreen = this.displayScreen();
    try {
      const effects: ScriptEffect[] = await this.scripts.run(script, {
        value: inputValue ?? this.value(widget),
        quality: this.quality(widget),
        name: widget.name,
      });
      // An asynchronous Preview script must never become a Runtime command after navigation.
      if (this.mode() !== sourceMode || this.displayScreen() !== sourceScreen) return;
      let actionRequested = false;
      for (const effect of effects) {
        if (effect.type === 'notify') this.notify(effect.value);
        if (effect.type === 'action' && !actionRequested) {
          actionRequested = true;
          this.performAction(widget, event, inputValue);
        }
        if (effect.type === 'text' || effect.type === 'color')
          this.effects.update((all) => ({
            ...all,
            [widget.id]: { ...all[widget.id], [effect.type]: effect.value },
          }));
      }
    } catch (error) {
      this.notify(this.message(error), true);
    }
  }
  private performAction(
    widget: Widget,
    event: 'activate' | 'doubleClick' = 'activate',
    inputValue?: ControlValue,
  ) {
    if (!this.widgetEnabled(widget) || !this.widgetVisible(widget)) return;
    const action = event === 'activate' ? widget.action : widget.doubleClickAction;
    if (action.type === 'none') {
      if (widget.faceplate) this.equipmentDetails.set(widget);
      return;
    }
    if (action.type === 'notify') this.notify(action.message);
    if (action.type === 'navigate') this.switchScreen(action.screenId);
    if (action.type === 'command') {
      this.commands.prepare(
        {
          widget,
          event,
          screenId: this.displayScreen().id,
          mode: this.mode() === 'runtime' ? 'runtime' : 'preview',
          release: this.activeRelease() ?? undefined,
          canActivate: () =>
            this.widgetEnabled(widget) &&
            this.widgetVisible(widget) &&
            (!isControlKind(widget.kind) || this.quality(widget) === 'good'),
        },
        inputValue ?? (this.value(widget) as ControlValue),
      );
    }
  }
  async acknowledge(id: string) {
    if (this.alarmBusy()) return;
    this.alarmBusy.set(id);
    try {
      await this.api.acknowledge(id);
      this.notify('Acknowledgement requested. Waiting for ThingsBoard update.');
    } catch (error) {
      this.notify(this.message(error), true);
    } finally {
      this.alarmBusy.set(null);
    }
  }
  private message(error: unknown) {
    return error instanceof Error ? error.message : 'Operation failed.';
  }
}

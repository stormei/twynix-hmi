import { DatePipe, DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { BehaviorConfig } from '@twynix/model';
import {
  behaviorConfigurationError,
  bindableProperties,
  BindableProperty,
  createDashboardWidgets,
  FaceplateType,
  instrumentFunctions,
  isDashboardKind,
  propertyBinding,
  PropertyBinding,
  Screen,
  SignalMedium,
  SymbolStyle,
  Widget,
  WidgetKind,
  widgetKinds,
  type ControlValue,
} from '@twynix/model';
import { FaceplateDraft, faceplateOverrides } from '../../../../packages/editor/src/faceplates';
import { clamp, ResizeHandle, selectionUnits } from '../../../../packages/editor/src/geometry';
import { widgetContentSize } from '../../../../packages/editor/src/rotation';
import { runtimeWidget } from '../../../../packages/editor/src/runtime-appearance';
import { signalStyles } from '../../../../packages/editor/src/signals';
import { behaviorDraft } from '../../../../packages/scripting/src/authoring';
import { validateAppearance } from '../../../../packages/scripting/src/evaluate';
import { scriptInputs } from '../../../../packages/scripting/src/inputs';
import { ActionEditorComponent } from './action-editor.component';
import { ApiService } from './api.service';
import { BehaviorEditorComponent } from './behavior-editor.component';
import { BindingEditorComponent } from './binding-editor.component';
import { CommandFeedbackComponent } from './command-feedback.component';
import { CommandStateService } from './command-state.service';
import { ComponentLibraryComponent } from './component-library.component';
import { ConfirmationComponent } from './confirmation.component';
import type { MenuItem } from './context-menu.component';
import { ContextMenuComponent } from './context-menu.component';
import { DashboardPropertiesComponent } from './dashboard/dashboard-properties.component';
import { DashboardWidgetComponent } from './dashboard/dashboard-widget.component';
import { DropdownComponent } from './dropdown.component';
import { EditorCanvasService } from './editor-canvas.service';
import { EditorWorkspaceService } from './editor-workspace.service';
import { EditorStore } from './editor.store';
import { FaceplateEditorComponent } from './faceplate-editor.component';
import { HmiActionsService } from './hmi-actions.service';
import { HmiBehaviorRuntime } from './hmi-behavior-runtime.service';
import { HmiBindingRuntime } from './hmi-binding-runtime.service';
import { HmiFeedbackService } from './hmi-feedback.service';
import { HmiRuntimeContext } from './hmi-runtime-context.service';
import { HmiViewportService } from './hmi-viewport.service';
import { IconComponent } from './icon.component';
import { LayerRowComponent } from './layer-row.component';
import {
  loadLibraryPreferences,
  saveLibraryPreferences,
  type LibraryTab,
} from './library-preferences';
import { ModalDirective } from './modal.directive';
import { MultiInspectorComponent } from './multi-inspector.component';
import { OperatingRangeComponent } from './operating-range.component';
import { PropertyRowComponent } from './property-row.component';
import { RealtimeService } from './realtime.service';
import { RotationHandleComponent } from './rotation-handle.component';
import { RulersComponent } from './rulers.component';
import { ScreenEditorComponent } from './screen-editor.component';
import { ScriptService } from './script.service';
import { SelectionToolsComponent } from './selection-tools.component';
import { SymbolLibraryComponent } from './symbol-library.component';
import { SymbolComponent } from './symbol.component';

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
    BehaviorEditorComponent,
    SelectionToolsComponent,
    MultiInspectorComponent,
    LayerRowComponent,
    ModalDirective,
    ConfirmationComponent,
    ScreenEditorComponent,
    FaceplateEditorComponent,
    ContextMenuComponent,
  ],
  providers: [
    CommandStateService,
    HmiRuntimeContext,
    HmiFeedbackService,
    HmiBindingRuntime,
    HmiBehaviorRuntime,
    HmiActionsService,
    HmiViewportService,
    EditorWorkspaceService,
    EditorCanvasService,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly context = inject(HmiRuntimeContext);
  readonly workspace = inject(EditorWorkspaceService);
  readonly feedback = inject(HmiFeedbackService);
  readonly bindings = inject(HmiBindingRuntime);
  readonly behavior = inject(HmiBehaviorRuntime);
  readonly actions = inject(HmiActionsService);
  readonly viewport = inject(HmiViewportService);
  readonly canvas = inject(EditorCanvasService);
  readonly toast = this.feedback.toast;
  readonly logs = this.feedback.logs;
  readonly confirmation = this.feedback.confirmation;
  readonly notify = this.feedback.notify.bind(this.feedback);
  readonly log = this.feedback.log.bind(this.feedback);
  readonly safe = this.feedback.safe.bind(this.feedback);
  readonly ask = this.feedback.ask.bind(this.feedback);
  readonly answer = this.feedback.answer.bind(this.feedback);
  private readonly message = (error: unknown) =>
    error instanceof Error ? error.message : 'Operation failed.';
  readonly loginOpen = this.workspace.loginOpen;
  readonly projectsOpen = this.workspace.projectsOpen;
  readonly busy = this.workspace.busy;
  readonly loginBusy = this.workspace.loginBusy;
  readonly loginError = this.workspace.loginError;
  get username() {
    return this.workspace.username;
  }
  set username(value: string) {
    this.workspace.username = value;
  }
  get password() {
    return this.workspace.password;
  }
  set password(value: string) {
    this.workspace.password = value;
  }
  readonly savedProjects = this.workspace.savedProjects;
  readonly releases = this.workspace.releases;
  readonly alarmBusy = this.workspace.alarmBusy;
  readonly login = this.workspace.login.bind(this.workspace);
  readonly logout = this.workspace.logout.bind(this.workspace);
  readonly continueOffline = this.workspace.continueOffline.bind(this.workspace);
  readonly save = this.workspace.save.bind(this.workspace);
  readonly publish = this.workspace.publish.bind(this.workspace);
  readonly openProjects = this.workspace.openProjects.bind(this.workspace);
  readonly loadProject = this.workspace.loadProject.bind(this.workspace);
  readonly restoreRelease = this.workspace.restoreRelease.bind(this.workspace);
  readonly importFile = this.workspace.importFile.bind(this.workspace);
  readonly newProject = this.workspace.newProject.bind(this.workspace);
  readonly acknowledge = this.workspace.acknowledge.bind(this.workspace);
  readonly tick = this.bindings.tick;
  readonly histories = this.bindings.histories;
  readonly resolvedProperties = this.bindings.resolvedProperties;
  readonly properties = this.bindings.properties.bind(this.bindings);
  readonly value = this.bindings.value.bind(this.bindings);
  readonly quality = this.bindings.quality.bind(this.bindings);
  readonly widgetUnit = this.bindings.widgetUnit.bind(this.bindings);
  readonly widgetVisible = this.bindings.widgetVisible.bind(this.bindings);
  readonly widgetEnabled = this.bindings.widgetEnabled.bind(this.bindings);
  readonly bound = this.bindings.bound.bind(this.bindings);
  readonly hasBindings = this.bindings.hasBindings.bind(this.bindings);
  readonly bindingDescription = this.bindings.bindingDescription.bind(this.bindings);
  readonly propertyDisplay = this.bindings.propertyDisplay.bind(this.bindings);
  readonly samples = this.bindings.samples.bind(this.bindings);
  readonly effects = this.behavior.effects;
  readonly behaviorDiagnostics = this.behavior.behaviorDiagnostics;
  readonly runtimePresentation = this.behavior.runtimePresentation;
  readonly runtimeWidgets = this.behavior.runtimeWidgets;
  readonly previewInputs = this.actions.previewInputs;
  readonly equipmentDetails = this.actions.equipmentDetails;
  readonly isInteractive = this.actions.isInteractive.bind(this.actions);
  readonly clickWidget = this.actions.clickWidget.bind(this.actions);
  readonly doubleClickWidget = this.actions.doubleClickWidget.bind(this.actions);
  readonly controlQuality = this.actions.controlQuality.bind(this.actions);
  readonly controlDisplayValue = this.actions.controlDisplayValue.bind(this.actions);
  readonly controlInput = this.actions.controlInput.bind(this.actions);
  async activate(
    widget: Widget,
    event: 'activate' | 'doubleClick' = 'activate',
    inputValue?: ControlValue,
  ) {
    if (this.mode() === 'edit') {
      this.select(widget);
      return;
    }
    await this.actions.activate(widget, event, inputValue);
  }
  readonly zoom = this.viewport.zoom;
  readonly pan = this.viewport.pan;
  readonly setZoom = this.viewport.setZoom.bind(this.viewport);
  readonly setZoomTo = this.viewport.setZoomTo.bind(this.viewport);
  readonly wheel = this.viewport.wheel.bind(this.viewport);
  readonly fit = this.viewport.fit.bind(this.viewport);
  readonly tool = this.canvas.tool;
  readonly snap = this.canvas.snap;
  readonly grid = this.canvas.grid;
  readonly marquee = this.canvas.marquee;
  readonly dragGhosts = this.canvas.dragGhosts;
  readonly alignmentGuides = this.canvas.alignmentGuides;
  readonly spacingHints = this.canvas.spacingHints;
  readonly portSnap = this.canvas.portSnap;
  readonly connectionMedium = this.canvas.connectionMedium;
  readonly signalStyles = this.canvas.signalStyles;
  readonly activeConnectionLabel = this.canvas.activeConnectionLabel;
  readonly pendingPort = this.canvas.pendingPort;
  readonly signalDrag = this.canvas.signalDrag;
  readonly signalTargets = this.canvas.signalTargets;
  readonly signalTargetKeys = this.canvas.signalTargetKeys;
  readonly signalDragPreview = this.canvas.signalDragPreview;
  readonly snappedPorts = this.canvas.snappedPorts;
  readonly rotationPreview = this.canvas.rotationPreview;
  readonly canvasWidgets = this.canvas.canvasWidgets;
  readonly renderedPorts = this.canvas.renderedPorts;
  readonly occupiedPortKeys = this.canvas.occupiedPortKeys;
  readonly portKey = this.canvas.portKey;
  readonly selectedRouteId = this.canvas.selectedRouteId;
  readonly routePreview = this.canvas.routePreview;
  readonly routedConnections = this.canvas.routedConnections;
  readonly selectedRoute = this.canvas.selectedRoute;
  readonly routeHandles = this.canvas.routeHandles;
  readonly portsFor = this.canvas.portsFor;
  readonly fittingKinds = this.canvas.fittingKinds;
  readonly selectionOutline = this.canvas.selectionOutline;
  readonly dragBounds = this.canvas.dragBounds;
  readonly leftWidth = this.canvas.leftWidth;
  readonly rightWidth = this.canvas.rightWidth;
  readonly bottomHeight = this.canvas.bottomHeight;
  readonly connectionName = this.canvas.connectionName.bind(this.canvas);
  readonly chooseConnectionMedium = this.canvas.chooseConnectionMedium.bind(this.canvas);
  readonly selectRoute = this.canvas.selectRoute.bind(this.canvas);
  readonly routeHandleDown = this.canvas.routeHandleDown.bind(this.canvas);
  readonly routeHandleKey = this.canvas.routeHandleKey.bind(this.canvas);
  readonly removeRoutePin = this.canvas.removeRoutePin.bind(this.canvas);
  readonly portDown = this.canvas.portDown.bind(this.canvas);
  readonly rotateFitting = this.canvas.rotateFitting.bind(this.canvas);
  readonly select = this.canvas.select.bind(this.canvas);
  readonly selectGroup = this.canvas.selectGroup.bind(this.canvas);
  readonly backgroundDown = this.canvas.backgroundDown.bind(this.canvas);
  readonly pointerDown = this.canvas.pointerDown.bind(this.canvas);
  readonly resizeCursor = this.canvas.resizeCursor.bind(this.canvas);
  readonly resizeDown = this.canvas.resizeDown.bind(this.canvas);
  readonly resizePane = this.canvas.resizePane.bind(this.canvas);
  readonly paneKey = this.canvas.paneKey.bind(this.canvas);
  @HostListener('window:pointermove', ['$event'])
  pointerMove(event: PointerEvent) {
    this.canvas.pointerMove(event);
  }
  @HostListener('window:pointerup', ['$event'])
  pointerUp(event?: PointerEvent) {
    this.canvas.pointerUp(event);
  }
  @HostListener('window:pointercancel')
  pointerCancel() {
    this.canvas.pointerCancel();
  }
  @HostListener('window:keyup', ['$event'])
  keyUp(event: KeyboardEvent) {
    this.canvas.keyUp(event);
  }
  @HostListener('window:blur')
  blur() {
    this.canvas.blur();
  }
  readonly fitSelection = this.canvas.fitSelection.bind(this.canvas);
  readonly mode = this.context.mode;
  readonly dataSource = this.context.dataSource;
  readonly activeRelease = this.context.activeRelease;
  readonly runtimeProject = this.context.runtimeProject;
  readonly runtimeScreenId = this.context.runtimeScreenId;
  readonly displayScreen = this.context.screen;
  readonly setMode = this.workspace.setMode.bind(this.workspace);
  readonly switchScreen = this.actions.switchScreen.bind(this.actions);
  readonly retryBehavior = this.behavior.retryBehavior.bind(this.behavior);
  readonly worldPoint = this.viewport.worldPoint.bind(this.viewport);
  get spaceHeld() {
    return this.canvas.spaceHeld;
  }
  set spaceHeld(value: boolean) {
    this.canvas.spaceHeld = value;
  }
  bindingEnvironment() {
    return {
      ...this.bindings.bindingEnvironment(),
      demoValue: this.store.selected()?.demoValue ?? 0,
    };
  }
  constructor() {
    this.context.attachEditor(this.store.screen, (id) => this.store.selectScreen(id));
    effect(() =>
      saveLibraryPreferences({
        version: 1,
        search: this.symbolSearch(),
        expanded: this.expandedSymbolCategories(),
        activeTab: this.leftTab(),
      }),
    );
    afterNextRender(() => {
      this.viewport.attach(this.canvasArea().nativeElement);
      this.fit(this.canvasArea().nativeElement);
    });
    effect(() => {
      const transition = this.context.transition();
      untracked(() => {
        this.previewInputs.set({});
        if (transition.kind === 'mode') {
          this.contextMenu.set(null);
          this.tool.set('select');
        } else this.pan.set({ x: 0, y: 0 });
      });
    });
  }

  readonly store = inject(EditorStore);
  readonly api = inject(ApiService);
  readonly commands = inject(CommandStateService);
  private readonly injector = inject(Injector);
  readonly realtime = inject(RealtimeService);
  private readonly scripts = inject(ScriptService);

  readonly inspector = signal<'properties' | 'binding' | 'actions' | 'script'>('properties');
  private readonly libraryPreferences = loadLibraryPreferences();
  readonly leftTab = signal<LibraryTab>(this.libraryPreferences.activeTab);
  // Workspace-owned state survives tab changes and is restored from local preferences.
  readonly symbolSearch = signal(this.libraryPreferences.search);
  readonly expandedSymbolCategories = signal<string[]>(this.libraryPreferences.expanded);
  readonly bottomTab = signal<'alarms' | 'console'>('alarms');

  readonly bindingTarget = signal<BindableProperty | null>(null);
  readonly propertyNames = bindableProperties;
  readonly propertyLabels: Record<BindableProperty, string> = {
    value: 'Value',
    text: 'Display text',
    color: 'Accent colour',
    visible: 'Visibility',
    enabled: 'Enabled state',
  };

  readonly canvasArea = viewChild.required<ElementRef<HTMLElement>>('canvasArea');

  readonly scriptTarget = signal<'behavior' | 'onClick' | 'onDoubleClick'>('behavior');
  readonly behaviorEditor = signal<{ widget: Widget; screen: Screen } | null>(null);
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

  // Preview in canvas coordinates so zoom, snapping and group offsets stay exact.

  readonly signalMedia: SignalMedium[] = ['electrical', 'pneumatic', 'digital'];

  readonly layerSearch = signal('');
  readonly collapsedGroups = signal<string[]>([]);
  readonly leftOpen = signal(true);
  readonly rightOpen = signal(typeof window === 'undefined' || window.innerWidth >= 1180);
  readonly bottomOpen = signal(false);

  readonly shortcutsOpen = signal(false);
  readonly screenDialog = signal<'new' | 'edit' | null>(null);
  readonly faceplateEditor = signal<{ source: Widget; type: FaceplateType | null } | null>(null);

  readonly contextMenu = signal<{ x: number; y: number } | null>(null);
  readonly widgetContentSize = widgetContentSize;

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

  widgetColor(widget: Widget) {
    if (propertyBinding(widget, 'color')?.enabled)
      return String(this.properties(widget).color.value);
    const appearance =
      this.mode() !== 'edit' ? this.runtimePresentation().appearances[widget.id]?.color : undefined;
    return appearance && /^#[a-f\d]{6}$/i.test(appearance) ? appearance : widget.color;
  }
  widgetText(widget: Widget): string | null {
    if (propertyBinding(widget, 'text')?.enabled)
      return String(this.properties(widget).text.value ?? '');
    return this.mode() !== 'edit'
      ? (this.runtimePresentation().appearances[widget.id]?.text ?? null)
      : null;
  }
  precision(value: number) {
    return Math.round(value * 100) / 100;
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
      this.behaviorEditor() ||
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
      if (this.canvas.routeDragging()) {
        this.pointerCancel();
        return;
      }
      this.selectedRouteId.set(null);
      if (this.canvas.dragging()) {
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

  openBehaviorEditor(widget: Widget) {
    if (this.mode() === 'edit') this.behaviorEditor.set({ widget, screen: this.store.screen() });
  }
  behaviorContext(widget: Widget) {
    return { value: this.value(widget), quality: this.quality(widget), name: widget.name };
  }
  applyBehavior(draft: { source: string; config: BehaviorConfig }) {
    const editor = this.behaviorEditor();
    if (!editor) return;
    if (
      this.mode() !== 'edit' ||
      this.store.selected()?.id !== editor.widget.id ||
      this.store.screen() !== editor.screen
    ) {
      this.notify(
        'The widget changed while the editor was open. Reopen it to apply the behavior.',
        true,
      );
      return;
    }
    try {
      const validated = behaviorDraft(
        editor.widget,
        draft.source,
        draft.config,
        this.store.screen(),
      );
      this.store.updateWidget({ behavior: validated.source, behaviorConfig: validated.config });
      this.behaviorEditor.set(null);
    } catch (error) {
      this.notify(this.message(error), true);
    }
  }
  updateScript(source: string) {
    this.store.updateWidget({ [this.scriptTarget()]: source });
  }
  insertExample() {
    const config = this.store.selected()?.behaviorConfig;
    if (this.scriptTarget() === 'behavior' && config?.resultMode === 'appearance') {
      const fields = [];
      if (config.outputs.includes('text'))
        fields.push('text: String(context.value ?? "Unavailable")');
      if (config.outputs.includes('position')) fields.push('position: { offsetX: 0, offsetY: 0 }');
      if (config.outputs.includes('rotation')) fields.push('rotation: { offsetDegrees: 0 }');
      if (config.outputs.includes('color'))
        fields.push(
          'color: context.quality === "good" || context.quality === "simulation" ? "#329c8c" : "#808080"',
        );
      this.updateScript(
        `// Returns a replacement appearance for declared outputs.\nreturn { ${fields.join(', ')} };`,
      );
      return;
    }
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
      const evaluate =
        this.scriptTarget() === 'behavior' && widget.behaviorConfig?.resultMode === 'appearance'
          ? this.scripts.behavior.bind(this.scripts)
          : this.scripts.run.bind(this.scripts);
      const effects = await evaluate(widget[this.scriptTarget()], {
        value: this.value(widget),
        quality: this.quality(widget),
        name: widget.name,
        inputs: scriptInputs(
          widget.behaviorConfig,
          this.realtime.values(),
          this.realtime.state() === 'connected',
          Date.now(),
        ),
      });
      if (
        this.scriptTarget() === 'behavior' &&
        widget.behaviorConfig?.resultMode === 'appearance'
      ) {
        const error = behaviorConfigurationError(widget);
        if (error) throw new Error(error);
        const appearance = validateAppearance(effects, widget.behaviorConfig.outputs);
        runtimeWidget(widget, appearance, this.displayScreen());
      }
      this.bottomTab.set('console');
      this.log(`Script passed: ${JSON.stringify(effects)}. Test does not execute device actions.`);
    } catch (error) {
      this.bottomTab.set('console');
      this.notify(this.message(error), true);
    }
  }
}

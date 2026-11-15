import { componentBounds, materializeComponent } from '../../../../packages/editor/src/components';
import type {
  ReusableComponent,
  ComponentVersion,
  ComponentInstance,
  PropertyValue,
} from '@twynix/model';
import { rotateWidgetsBy } from '../../../../packages/editor/src/rotation';
import { computed, Injectable, signal } from '@angular/core';
import {
  captureFaceplate,
  createStarterProject,
  FaceplateType,
  newWidget,
  Project,
  PortEndpoint,
  ProcessConnection,
  projectSchema,
  Screen,
  Widget,
  WidgetKind,
  SymbolStyle,
  InstrumentFunction,
  ConnectionMedium,
  SignalMedium,
} from '@twynix/model';
import {
  Alignment,
  alignWidgets,
  boundsOf,
  distributeWidgets,
  moveWidgets,
  Rect,
  scaleWidgets,
} from '../../../../packages/editor/src/geometry';
import {
  FaceplateDraft,
  instantiateFaceplate,
  updateFaceplateInstance,
} from '../../../../packages/editor/src/faceplates';

import { freePorts, portKey, snapToPort } from '../../../../packages/editor/src/ports';

import { freeSignalPorts, normalizeSignalEndpoints } from '../../../../packages/editor/src/signals';

const fingerprint = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
const STORAGE_KEY = 'twynix.local-project.v1';
function localWorkspaceKey() {
  if (typeof location === 'undefined') return STORAGE_KEY;
  const workspace = new URL(location.href).searchParams.get('workspace');
  return workspace && /^[a-z0-9-]{1,40}$/i.test(workspace)
    ? `${STORAGE_KEY}:${workspace}`
    : STORAGE_KEY;
}
interface HistoryEntry {
  project: Project;
  screenId: string;
  selection: string[];
  label: string;
}
interface Clipboard {
  widgets: Widget[];
  groups: Record<string, string>;
  connections: ProcessConnection[];
}
@Injectable({ providedIn: 'root' })
export class EditorStore {
  private readonly storageKey = localWorkspaceKey();
  private readonly initial = this.restore();
  readonly project = signal<Project>(this.initial.project);
  readonly screenId = signal(this.project().screens[0].id);
  readonly selectedIds = signal<string[]>([]);
  readonly selectedId = computed(() => this.selectedIds().at(-1) ?? null);
  readonly screen = computed(
    () =>
      this.project().screens.find((screen) => screen.id === this.screenId()) ??
      this.project().screens[0],
  );
  readonly selectedWidgets = computed(() =>
    this.screen().widgets.filter((widget) => this.selectedIds().includes(widget.id)),
  );
  readonly selected = computed(
    () => this.screen().widgets.find((widget) => widget.id === this.selectedId()) ?? null,
  );
  readonly selectionBounds = computed(() => boundsOf(this.selectedWidgets()));
  readonly canTransform = computed(
    () =>
      this.selectedWidgets().length > 0 && this.selectedWidgets().every((widget) => !widget.locked),
  );
  readonly dirty = signal(this.initial.dirty);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly undoLabel = signal('');
  readonly redoLabel = signal('');
  readonly hasClipboard = signal(false);
  readonly recoveryTime = signal(this.initial.updatedAt);
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private savedContent = this.initial.dirty ? '' : fingerprint(this.initial.project);
  private history: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private clipboard?: Clipboard;

  constructor() {
    if (typeof window !== 'undefined')
      window.addEventListener('beforeunload', () => this.flushRecovery());
  }
  private restore(): { project: Project; dirty: boolean; updatedAt: number | null } {
    try {
      const value = localStorage.getItem(this.storageKey);
      if (value) {
        const stored = JSON.parse(value);
        return {
          project: projectSchema.parse(stored.project ?? stored),
          dirty: stored.project ? stored.dirty !== false : true,
          updatedAt: stored.updatedAt ?? null,
        };
      }
    } catch {
      /* Invalid local data never prevents opening a new workspace. */
    }
    return { project: createStarterProject(), dirty: false, updatedAt: null };
  }
  private snapshot(label: string): HistoryEntry {
    return {
      project: structuredClone(this.project()),
      screenId: this.screenId(),
      selection: [...this.selectedIds()],
      label,
    };
  }
  checkpoint(label = 'Transform selection') {
    this.history.push(this.snapshot(label));
    if (this.history.length > 80) this.history.shift();
    this.future = [];
    this.syncHistory();
  }
  private syncHistory() {
    this.canUndo.set(this.history.length > 0);
    this.canRedo.set(this.future.length > 0);
    this.undoLabel.set(this.history.at(-1)?.label ?? '');
    this.redoLabel.set(this.future.at(-1)?.label ?? '');
  }
  flushRecovery() {
    this.persist();
  }
  private persist(defer = false) {
    clearTimeout(this.recoveryTimer);
    if (defer) {
      this.dirty.set(true);
      this.recoveryTimer = setTimeout(() => this.persist(), 120);
      return;
    }
    this.dirty.set(fingerprint(this.project()) !== this.savedContent);
    const now = Date.now();
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({ project: this.project(), dirty: this.dirty(), updatedAt: now }),
      );
      this.recoveryTime.set(now);
    } catch {
      /* Export remains available when local storage is full. */
    }
  }
  clearSelection() {
    this.selectedIds.set([]);
  }
  selectOnly(id: string, deep = false) {
    this.selectIds([id], !deep);
  }
  selectIds(ids: string[], expandGroups = true) {
    const widgets = this.screen().widgets,
      groupIds = new Set(
        widgets
          .filter((widget) => ids.includes(widget.id) && widget.groupId)
          .map((widget) => widget.groupId),
      );
    const expanded = widgets
      .filter((widget) => ids.includes(widget.id) || (expandGroups && groupIds.has(widget.groupId)))
      .map((widget) => widget.id);
    this.selectedIds.set([...new Set(expanded)]);
  }
  select(id: string, toggle = false, deep = false) {
    const widget = this.screen().widgets.find((widget) => widget.id === id);
    if (!widget) return;
    const members =
      !deep && widget.groupId
        ? this.screen()
            .widgets.filter((item) => item.groupId === widget.groupId)
            .map((item) => item.id)
        : [id];
    if (!toggle) {
      this.selectIds(members, false);
      return;
    }
    const selected = new Set(this.selectedIds());
    if (members.every((member) => selected.has(member)))
      members.forEach((member) => selected.delete(member));
    else members.forEach((member) => selected.add(member));
    this.selectIds([...selected], false);
  }
  selectAll() {
    this.selectIds(
      this.screen()
        .widgets.filter((widget) => !widget.locked)
        .map((widget) => widget.id),
    );
  }
  private modifyScreen(change: (screen: Screen) => Screen) {
    const id = this.screen().id;
    this.project.update((project) => ({
      ...project,
      screens: project.screens.map((screen) => (screen.id === id ? change(screen) : screen)),
    }));
  }
  replaceWidgets(widgets: Widget[], record = true, label = 'Transform selection') {
    if (
      !widgets.length ||
      widgets.every(
        (widget) =>
          fingerprint(this.screen().widgets.find((item) => item.id === widget.id)) ===
          fingerprint(widget),
      )
    )
      return;
    if (record) this.checkpoint(label);
    const map = new Map(widgets.map((widget) => [widget.id, widget]));
    this.modifyScreen((screen) => ({
      ...screen,
      widgets: screen.widgets.map((widget) => map.get(widget.id) ?? widget),
    }));
    this.persist(!record);
  }
  updatePipeBends(id: string, points: { x: number; y: number }[]) {
    const link = this.screen().connections.find((link) => link.id === id);
    if (
      !link ||
      points.length > 32 ||
      points.some(
        (point) =>
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          point.x < 0 ||
          point.y < 0 ||
          point.x > this.screen().width ||
          point.y > this.screen().height,
      )
    )
      return;
    if (fingerprint(link.bendPoints ?? []) === fingerprint(points)) return;
    const kind = link.medium && link.medium !== 'process' ? 'signal' : 'pipe';
    this.checkpoint(points.length ? `Adjust ${kind} route` : `Reset automatic ${kind} route`);
    this.modifyScreen((screen) => ({
      ...screen,
      connections: screen.connections.map((link) =>
        link.id === id ? { ...link, bendPoints: structuredClone(points) } : link,
      ),
    }));
    this.persist();
  }
  deletePipe(id: string) {
    if (!this.screen().connections.some((link) => link.id === id)) return;
    this.checkpoint('Delete connection');
    this.modifyScreen((screen) => ({
      ...screen,
      connections: screen.connections.filter((link) => link.id !== id),
    }));
    this.persist();
  }
  setSignalMedium(id: string, medium: SignalMedium) {
    const link = this.screen().connections.find((link) => link.id === id);
    if (!link?.medium || link.medium === 'process' || link.medium === medium) return;
    this.checkpoint('Change signal line style');
    this.modifyScreen((screen) => ({
      ...screen,
      connections: screen.connections.map((link) => (link.id === id ? { ...link, medium } : link)),
    }));
    this.persist();
  }
  connectPorts(
    from: PortEndpoint,
    to: PortEndpoint,
    record = true,
    medium: ConnectionMedium = 'process',
  ) {
    if (medium !== 'process') {
      const endpoints = normalizeSignalEndpoints(from, to);
      if (!endpoints) return false;
      from = endpoints.from;
      to = endpoints.to;
    }
    const available = (medium === 'process' ? freePorts : freeSignalPorts)(
      this.screen().widgets,
      this.screen().connections,
    );
    if (
      from.widgetId === to.widgetId ||
      ![from, to].every((endpoint) => available.some((port) => portKey(port) === portKey(endpoint)))
    )
      return false;
    if (
      [from, to].some(
        (endpoint) =>
          this.screen().widgets.find((widget) => widget.id === endpoint.widgetId)?.locked,
      )
    )
      return false;
    if (record)
      this.checkpoint(medium === 'process' ? 'Connect process ports' : 'Connect signal ports');
    this.modifyScreen((screen) => ({
      ...screen,
      connections: [
        ...screen.connections,
        {
          id: crypto.randomUUID(),
          ...(medium === 'process' ? {} : { medium }),
          from: { widgetId: from.widgetId, port: from.port },
          to: { widgetId: to.widgetId, port: to.port },
        },
      ],
    }));
    this.persist();
    return true;
  }
  disconnectPorts(widgetId: string) {
    if (this.screen().widgets.find((widget) => widget.id === widgetId)?.locked) return;
    if (
      !this.screen().connections.some(
        (link) => link.from.widgetId === widgetId || link.to.widgetId === widgetId,
      )
    )
      return;
    this.checkpoint('Disconnect component');
    this.modifyScreen((screen) => ({
      ...screen,
      connections: screen.connections.filter(
        (link) => link.from.widgetId !== widgetId && link.to.widgetId !== widgetId,
      ),
    }));
    this.persist();
  }
  placeConnected(widgets: Widget[], connection: { from: PortEndpoint; to: PortEndpoint } | null) {
    this.checkpoint('Move and connect selection');
    this.replaceWidgets(widgets, false);
    if (connection) this.connectPorts(connection.from, connection.to, false);
    this.flushRecovery();
  }
  updateWidget(patch: Partial<Widget>, record = true) {
    const widget = this.selected();
    if (!widget || widget.locked) return;
    this.replaceWidgets([{ ...widget, ...patch }], record, 'Edit component');
  }
  updateSelection(patch: Partial<Pick<Widget, 'color' | 'text' | 'visible' | 'enabled'>>) {
    if (!this.canTransform()) return;
    this.replaceWidgets(
      this.selectedWidgets().map((widget) => ({ ...widget, ...patch })),
      true,
      'Edit selection',
    );
  }
  setSymbolStyle(style: SymbolStyle) {
    if (this.project().symbolStyle === style) return;
    this.checkpoint('Change symbol display style');
    this.project.update((project) => ({ ...project, symbolStyle: style }));
    this.persist();
  }
  addInstrument(instrumentFunction: InstrumentFunction) {
    const widget = newWidget('instrument', this.screen().widgets.length);
    widget.instrumentFunction = instrumentFunction;
    widget.name = `${instrumentFunction} instrument`;
    widget.text = `${instrumentFunction}-101`;
    this.insert(widget);
  }
  renameProject(name: string) {
    if (!name.trim()) return;
    this.checkpoint('Rename project');
    this.project.update((project) => ({ ...project, name: name.trim() }));
    this.persist();
  }
  add(kind: WidgetKind, point?: { x: number; y: number }, snapDistance = 18) {
    const widget = newWidget(kind, this.screen().widgets.length);
    if (point) {
      widget.x = point.x;
      widget.y = point.y;
    }
    this.insert(widget, point ? snapDistance : 0);
  }
  private insert(widget: Widget, snapDistance = 0) {
    const screen = this.screen();
    widget.width = Math.min(widget.width, screen.width);
    widget.height = Math.min(widget.height, screen.height);
    widget.x = Math.max(0, Math.min(widget.x, screen.width - widget.width));
    widget.y = Math.max(0, Math.min(widget.y, screen.height - widget.height));
    const snapped = snapDistance
      ? snapToPort(
          [widget],
          screen.widgets.filter((item) => !item.locked),
          screen.connections,
          snapDistance,
          screen,
        )
      : null;
    widget = snapped?.widgets[0] ?? widget;
    this.checkpoint('Add component');
    this.modifyScreen((screen) => ({ ...screen, widgets: [...screen.widgets, widget] }));
    this.selectOnly(widget.id);
    if (snapped?.connection)
      this.connectPorts(snapped.connection.from, snapped.connection.to, false);
    this.persist();
  }
  addScreen(
    name = `Screen ${this.project().screens.length + 1}`,
    width = 1120,
    height = 680,
    widgets: Widget[] = [],
  ) {
    this.checkpoint('Add screen');
    const screen: Screen = {
      id: crypto.randomUUID(),
      name,
      width,
      height,
      widgets,
      connections: [],
      groups: {},
    };
    this.project.update((project) => ({ ...project, screens: [...project.screens, screen] }));
    this.selectScreen(screen.id);
    this.persist();
  }
  configureScreen(name: string, width: number, height: number) {
    if (!name.trim() || width < 400 || height < 300 || width > 4000 || height > 4000)
      throw new Error('Use a name and screen dimensions between 400 × 300 and 4000 × 4000.');
    if (
      this.screen().widgets.some(
        (widget) => widget.x + widget.width > width || widget.y + widget.height > height,
      )
    )
      throw new Error('The smaller screen would clip components. Move or resize them first.');
    if (
      this.screen().connections.some((link) =>
        link.bendPoints?.some((point) => point.x > width || point.y > height),
      )
    )
      throw new Error('Move connection bend points inside the smaller screen before resizing it.');
    this.checkpoint('Screen settings');
    this.modifyScreen((screen) => ({ ...screen, name: name.trim(), width, height }));
    this.persist();
  }
  duplicateScreen() {
    this.checkpoint('Duplicate screen');
    const screen = structuredClone(this.screen());
    screen.id = crypto.randomUUID();
    screen.name += ' copy';
    const remap = new Map(screen.widgets.map((widget) => [widget.id, crypto.randomUUID()]));
    const groupIds = new Map(Object.keys(screen.groups).map((id) => [id, crypto.randomUUID()]));
    screen.groups = Object.fromEntries(
      Object.entries(screen.groups).map(([id, name]) => [groupIds.get(id)!, name]),
    );
    screen.widgets = screen.widgets.map((widget) => ({
      ...widget,
      id: remap.get(widget.id)!,
      groupId: widget.groupId ? groupIds.get(widget.groupId)! : null,
      component: widget.component
        ? { ...widget.component, instanceId: groupIds.get(widget.component.instanceId)! }
        : null,
    }));
    screen.connections = screen.connections.map((link) => ({
      ...link,
      id: crypto.randomUUID(),
      from: { ...link.from, widgetId: remap.get(link.from.widgetId)! },
      to: { ...link.to, widgetId: remap.get(link.to.widgetId)! },
    }));
    this.project.update((project) => ({ ...project, screens: [...project.screens, screen] }));
    this.selectScreen(screen.id);
    this.persist();
  }
  deleteScreen() {
    if (this.project().screens.length < 2) throw new Error('A project needs at least one screen.');
    const id = this.screen().id;
    if (
      this.project().screens.some((screen) =>
        screen.widgets.some((widget) =>
          [widget.action, widget.doubleClickAction].some(
            (action) => action.type === 'navigate' && action.screenId === id,
          ),
        ),
      )
    )
      throw new Error('Remove navigation actions targeting this screen before deleting it.');
    this.checkpoint('Delete screen');
    this.project.update((project) => ({
      ...project,
      screens: project.screens.filter((screen) => screen.id !== id),
    }));
    this.selectScreen(this.project().screens[0].id);
    this.persist();
  }
  selectScreen(id: string) {
    this.screenId.set(id);
    this.clearSelection();
  }
  copy() {
    if (!this.selectedWidgets().length) return;
    this.clipboard = {
      connections: structuredClone(
        this.screen().connections.filter(
          (link) =>
            this.selectedIds().includes(link.from.widgetId) &&
            this.selectedIds().includes(link.to.widgetId),
        ),
      ),
      widgets: structuredClone(this.selectedWidgets()),
      groups: { ...this.screen().groups },
    };
    this.hasClipboard.set(true);
  }
  paste() {
    if (!this.clipboard?.widgets.length) return;
    const groups = { ...this.screen().groups },
      remap = new Map<string, string>();
    const completeInstance = (widget: Widget) => {
      const instance = widget.component;
      if (!instance) return false;
      const expected = this.project()
        .components.find((type) => type.id === instance.typeId)
        ?.versions.find((version) => version.version === instance.version)?.widgets.length;
      return (
        this.clipboard!.widgets.filter((item) => item.component?.instanceId === instance.instanceId)
          .length === expected
      );
    };
    let widgets: Widget[] = structuredClone(this.clipboard.widgets).map((widget) => {
      if (widget.groupId && !remap.has(widget.groupId)) {
        const id = crypto.randomUUID();
        remap.set(widget.groupId, id);
        groups[id] = `${this.clipboard!.groups[widget.groupId] ?? 'Group'} copy`;
      }
      const id = crypto.randomUUID();
      remap.set(widget.id, id);
      return {
        ...widget,
        id,
        name: `${widget.name} copy`,
        groupId: widget.groupId ? remap.get(widget.groupId)! : null,
        component:
          widget.component && widget.groupId && completeInstance(widget)
            ? { ...widget.component, instanceId: remap.get(widget.groupId)! }
            : null,
      };
    });
    widgets = moveWidgets(widgets, 24, 24, {
      x: 0,
      y: 0,
      width: this.screen().width,
      height: this.screen().height,
    });
    // A clipboard from a larger screen is fitted as a unit, with minimum-size validation.
    const bounds = boundsOf(widgets)!;
    if (bounds.width > this.screen().width || bounds.height > this.screen().height) {
      throw new Error('These components do not fit on this screen. Paste into a larger screen.');
    }
    this.checkpoint('Paste components');
    this.modifyScreen((screen) => ({
      ...screen,
      groups,
      widgets: [...screen.widgets, ...widgets],
      connections: [
        ...screen.connections,
        ...this.clipboard!.connections.map((link) => ({
          ...link,
          bendPoints: link.bendPoints?.map((point) => ({
            x: Math.max(
              0,
              Math.min(this.screen().width, point.x + widgets[0].x - this.clipboard!.widgets[0].x),
            ),
            y: Math.max(
              0,
              Math.min(this.screen().height, point.y + widgets[0].y - this.clipboard!.widgets[0].y),
            ),
          })),
          id: crypto.randomUUID(),
          from: { ...link.from, widgetId: remap.get(link.from.widgetId)! },
          to: { ...link.to, widgetId: remap.get(link.to.widgetId)! },
        })),
      ],
    }));
    this.selectIds(
      widgets.map((widget) => widget.id),
      false,
    );
    this.persist();
  }
  duplicate() {
    this.copy();
    this.paste();
  }
  delete() {
    const ids = new Set(
      this.selectedWidgets()
        .filter((widget) => !widget.locked)
        .map((widget) => widget.id),
    );
    if (!ids.size) return;
    this.checkpoint('Delete components');
    this.modifyScreen((screen) => {
      const affectedInstances = new Set(
        screen.widgets
          .filter((widget) => ids.has(widget.id))
          .map((widget) => widget.component?.instanceId)
          .filter(Boolean),
      );
      const widgets = screen.widgets
        .filter((widget) => !ids.has(widget.id))
        .map((widget) =>
          affectedInstances.has(widget.component?.instanceId)
            ? { ...widget, component: null }
            : widget,
        );
      return {
        ...screen,
        widgets,
        connections: screen.connections.filter(
          (link) => !ids.has(link.from.widgetId) && !ids.has(link.to.widgetId),
        ),
        groups: Object.fromEntries(
          Object.entries(screen.groups).filter(([id]) =>
            widgets.some((widget) => widget.groupId === id),
          ),
        ),
      };
    });
    this.clearSelection();
    this.persist();
  }
  group() {
    if (!this.canTransform() || this.selectedWidgets().length < 2) return;
    const detachedInstances = new Set(
      this.selectedWidgets()
        .map((widget) => widget.component?.instanceId)
        .filter(Boolean),
    );
    this.checkpoint('Group selection');
    const id = crypto.randomUUID();
    const selected = new Set(this.selectedIds());
    this.modifyScreen((screen) => {
      const widgets = screen.widgets.map((widget) =>
        selected.has(widget.id)
          ? { ...widget, groupId: id, component: null }
          : detachedInstances.has(widget.component?.instanceId)
            ? { ...widget, component: null }
            : widget,
      );
      const groups = { ...screen.groups, [id]: `Group ${Object.keys(screen.groups).length + 1}` };
      return {
        ...screen,
        widgets,
        groups: Object.fromEntries(
          Object.entries(groups).filter(([key]) =>
            widgets.some((widget) => widget.groupId === key),
          ),
        ),
      };
    });
    this.persist();
  }
  ungroup() {
    if (!this.canTransform()) return;
    const ids = new Set(
      this.selectedWidgets()
        .filter((widget) => !widget.locked)
        .map((widget) => widget.groupId)
        .filter(Boolean),
    );
    if (!ids.size) return;
    this.checkpoint('Ungroup selection');
    this.modifyScreen((screen) => ({
      ...screen,
      widgets: screen.widgets.map((widget) =>
        ids.has(widget.groupId) ? { ...widget, groupId: null, component: null } : widget,
      ),
      groups: Object.fromEntries(Object.entries(screen.groups).filter(([id]) => !ids.has(id))),
    }));
    this.persist();
  }
  renameGroup(id: string, name: string) {
    if (!name.trim()) return;
    this.checkpoint('Rename group');
    this.modifyScreen((screen) => ({ ...screen, groups: { ...screen.groups, [id]: name.trim() } }));
    this.persist();
  }
  toggleLocked(id: string) {
    const widget = this.screen().widgets.find((widget) => widget.id === id);
    if (!widget) return;
    this.replaceWidgets(
      [{ ...widget, locked: !widget.locked }],
      true,
      widget.locked ? 'Unlock component' : 'Lock component',
    );
  }
  toggleVisible(id: string) {
    const widget = this.screen().widgets.find((widget) => widget.id === id);
    if (!widget) return;
    this.replaceWidgets(
      [{ ...widget, visible: !widget.visible }],
      true,
      'Toggle design visibility',
    );
  }
  align(alignment: Alignment) {
    if (!this.canTransform()) return;
    this.replaceWidgets(
      alignWidgets(this.selectedWidgets(), alignment, {
        x: 0,
        y: 0,
        width: this.screen().width,
        height: this.screen().height,
      }),
      true,
      `Align ${alignment}`,
    );
  }
  distribute(axis: 'horizontal' | 'vertical') {
    if (!this.canTransform()) return;
    this.replaceWidgets(
      distributeWidgets(this.selectedWidgets(), axis, {
        x: 0,
        y: 0,
        width: this.screen().width,
        height: this.screen().height,
      }),
      true,
      `Distribute ${axis}`,
    );
  }
  nudge(dx: number, dy: number) {
    if (!this.canTransform()) return;
    this.replaceWidgets(
      moveWidgets(this.selectedWidgets(), dx, dy, {
        x: 0,
        y: 0,
        width: this.screen().width,
        height: this.screen().height,
      }),
      true,
      'Nudge selection',
    );
  }
  resizeSelection(target: Rect) {
    const bounds = this.selectionBounds();
    if (!bounds || !this.canTransform()) return;
    const widgets = scaleWidgets(this.selectedWidgets(), bounds, target);
    if (
      widgets.some(
        (widget) =>
          widget.width < 40 || widget.height < 30 || widget.width > 2000 || widget.height > 2000,
      )
    )
      throw new Error('Each component must remain between 40 × 30 and 2000 × 2000.');
    this.replaceWidgets(widgets, true, 'Resize selection');
  }
  setSelectionRotation(angle: Widget['rotation']) {
    if (!this.canTransform() || this.selectedWidgets().length !== 1) return;
    const screen = this.screen();
    this.replaceWidgets(
      rotateWidgetsBy([this.selected()!], angle - this.selected()!.rotation, {
        x: 0,
        y: 0,
        width: screen.width,
        height: screen.height,
      }),
      true,
      'Set object rotation',
    );
  }
  rotateSelection(clockwise = true) {
    if (!this.canTransform()) return;
    const screen = this.screen();
    const widgets = rotateWidgetsBy(this.selectedWidgets(), clockwise ? 5 : -5, {
      x: 0,
      y: 0,
      width: screen.width,
      height: screen.height,
    });
    this.replaceWidgets(widgets, true, clockwise ? 'Rotate clockwise' : 'Rotate counterclockwise');
  }
  reorder(direction: number) {
    if (!this.canTransform()) return;
    this.checkpoint('Reorder layers');
    const selected = new Set(this.selectedIds());
    this.modifyScreen((screen) => {
      const widgets = [...screen.widgets];
      if (Math.abs(direction) > 1)
        return {
          ...screen,
          widgets:
            direction > 0
              ? [
                  ...widgets.filter((widget) => !selected.has(widget.id)),
                  ...widgets.filter((widget) => selected.has(widget.id)),
                ]
              : [
                  ...widgets.filter((widget) => selected.has(widget.id)),
                  ...widgets.filter((widget) => !selected.has(widget.id)),
                ],
        };
      if (direction > 0) {
        for (let i = widgets.length - 2; i >= 0; i--)
          if (selected.has(widgets[i].id) && !selected.has(widgets[i + 1].id))
            [widgets[i], widgets[i + 1]] = [widgets[i + 1], widgets[i]];
      } else {
        for (let i = 1; i < widgets.length; i++)
          if (selected.has(widgets[i].id) && !selected.has(widgets[i - 1].id))
            [widgets[i], widgets[i - 1]] = [widgets[i - 1], widgets[i]];
      }
      return { ...screen, widgets };
    });
    this.persist();
  }
  publishComponent(name: string, description: string, version: ComponentVersion, typeId?: string) {
    const existing = this.project().components.find((type) => type.id === typeId);
    const type: ReusableComponent = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      description,
      versions: [
        ...(existing?.versions ?? []),
        { ...version, version: (existing?.versions.at(-1)?.version ?? 0) + 1 },
      ],
    };
    const project = projectSchema.parse({
      ...this.project(),
      components: [...this.project().components.filter((item) => item.id !== type.id), type],
    });
    this.checkpoint('Publish reusable component');
    this.project.set(project);
    this.dirty.set(true);
    this.persist();
  }
  placeComponent(
    typeId: string,
    values: Record<string, PropertyValue>,
    entity: ComponentInstance['entity'],
    instanceId?: string,
    upgrade = false,
  ) {
    const type = this.project().components.find((type) => type.id === typeId);
    if (!type) throw new Error('Component type no longer exists.');
    const screen = this.screen();
    const existing = instanceId
      ? screen.widgets.filter((widget) => widget.component?.instanceId === instanceId)
      : [];
    if (instanceId && !existing.length)
      throw new Error('This instance is no longer on the current screen.');
    if (existing.some((widget) => widget.locked))
      throw new Error('Unlock the instance before configuring it.');
    const version =
      !upgrade && existing.length
        ? type.versions.find((version) => version.version === existing[0].component!.version)!
        : type.versions.at(-1)!;
    const bounds = boundsOf(existing) ?? { ...componentBounds(version), x: 40, y: 40 };
    if (bounds.x + bounds.width > screen.width || bounds.y + bounds.height > screen.height)
      throw new Error('This component does not fit the screen.');
    const id = instanceId ?? crypto.randomUUID();
    const result = materializeComponent(
      type,
      version,
      id,
      values,
      entity,
      existing.length && !upgrade ? componentBounds(version) : bounds,
      existing,
    );
    const oldIds = new Set(existing.map((widget) => widget.id)),
      nextIds = new Set(result.widgets.map((widget) => widget.id));
    const external = screen.connections.filter(
      (link) => oldIds.has(link.from.widgetId) !== oldIds.has(link.to.widgetId),
    );
    if (
      external.some(
        (link) =>
          (oldIds.has(link.from.widgetId) && !nextIds.has(link.from.widgetId)) ||
          (oldIds.has(link.to.widgetId) && !nextIds.has(link.to.widgetId)),
      )
    )
      throw new Error('Disconnect removed component ports before upgrading.');
    // Input edits do not replace local geometry, actions, bindings or route adjustments.
    if (existing.length && !upgrade) {
      result.widgets = result.widgets.map((widget) => {
        const current = structuredClone(existing.find((item) => item.id === widget.id)!);
        current.component = widget.component;
        if (entity) {
          if (current.binding) Object.assign(current.binding, entity);
          for (const binding of Object.values(current.propertyBindings))
            if (binding.type !== 'constant' && binding.source)
              Object.assign(binding.source, entity);
        }
        for (const parameter of version.parameters.filter(
          (parameter) => parameter.widgetId === widget.component!.templateWidgetId,
        )) {
          current.propertyBindings[parameter.property] =
            widget.propertyBindings[parameter.property];
          if (parameter.property === 'value') current.binding = null;
        }
        return current;
      });
      result.connections = screen.connections.filter(
        (link) => oldIds.has(link.from.widgetId) && oldIds.has(link.to.widgetId),
      );
    }
    if (upgrade)
      result.widgets = result.widgets.map((widget) => {
        const current = existing.find((item) => item.id === widget.id);
        if (!current) return widget;
        return {
          ...widget,
          action:
            current.action.type === 'command' || current.action.type === 'navigate'
              ? current.action
              : widget.action,
          doubleClickAction:
            current.doubleClickAction.type === 'command' ||
            current.doubleClickAction.type === 'navigate'
              ? current.doubleClickAction
              : widget.doubleClickAction,
        };
      });
    const nextScreen = {
      ...screen,
      groups: { ...screen.groups, [id]: type.name },
      widgets: [...screen.widgets.filter((widget) => !oldIds.has(widget.id)), ...result.widgets],
      connections: [
        ...screen.connections.filter(
          (link) => !(oldIds.has(link.from.widgetId) && oldIds.has(link.to.widgetId)),
        ),
        ...result.connections,
      ],
    };
    projectSchema.parse({
      ...this.project(),
      screens: this.project().screens.map((item) => (item.id === screen.id ? nextScreen : item)),
    });
    this.checkpoint(
      upgrade
        ? 'Upgrade reusable component'
        : existing.length
          ? 'Configure reusable component'
          : 'Add reusable component',
    );
    this.modifyScreen(() => nextScreen);
    this.selectIds(result.widgets.map((widget) => widget.id));
    this.persist();
  }
  addFaceplate(typeId: string, point?: { x: number; y: number }) {
    const type = this.project().faceplates.find((type) => type.id === typeId);
    if (!type) return;
    const widget = instantiateFaceplate(
      type,
      crypto.randomUUID(),
      `${type.kind.charAt(0).toUpperCase()}${type.kind.slice(1)} ${this.screen().widgets.length + 1}`,
      point?.x ?? 80,
      point?.y ?? 120,
    );
    this.insert(widget);
  }
  publishFaceplate(draft: FaceplateDraft, typeId?: string) {
    const existing = typeId
      ? this.project().faceplates.find((type) => type.id === typeId)
      : undefined;
    const type: FaceplateType = {
      id: existing?.id ?? crypto.randomUUID(),
      name: draft.name,
      description: draft.description,
      kind: draft.template.kind as FaceplateType['kind'],
      telemetryKey: draft.telemetryKey,
      versions: [
        ...(existing?.versions ?? []),
        {
          version: (existing?.versions.at(-1)?.version ?? 0) + 1,
          createdAt: new Date().toISOString(),
          template: draft.template,
        },
      ],
    };
    this.checkpoint('Publish faceplate version');
    this.project.update((project) => ({
      ...project,
      faceplates: existing
        ? project.faceplates.map((item) => (item.id === type.id ? type : item))
        : [...project.faceplates, type],
    }));
    this.persist();
    return type;
  }
  updateFaceplate(reset = false) {
    const widget = this.selected();
    if (!widget?.faceplate || widget.locked) return;
    const type = this.project().faceplates.find((type) => type.id === widget.faceplate!.typeId);
    if (!type) return;
    this.replaceWidgets(
      [updateFaceplateInstance(widget, type, reset)],
      true,
      reset ? 'Reset faceplate overrides' : 'Upgrade faceplate instance',
    );
  }
  detachFaceplate() {
    this.updateWidget({ faceplate: null });
  }
  templateForSelection() {
    const widget = this.selected();
    return widget ? captureFaceplate(widget) : null;
  }
  undo() {
    const previous = this.history.pop();
    if (!previous) return;
    this.future.push(this.snapshot(previous.label));
    this.applyHistory(previous);
  }
  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(this.snapshot(next.label));
    this.applyHistory(next);
  }
  private applyHistory(entry: HistoryEntry) {
    this.project.set({ ...entry.project, revision: this.project().revision });
    this.screenId.set(
      entry.project.screens.some((screen) => screen.id === entry.screenId)
        ? entry.screenId
        : entry.project.screens[0].id,
    );
    this.selectIds(entry.selection, false);
    this.syncHistory();
    this.persist();
  }
  load(project: unknown, dirty = false) {
    const parsed = projectSchema.parse(project);
    this.project.set(parsed);
    this.selectScreen(parsed.screens[0].id);
    this.history = [];
    this.future = [];
    this.clipboard = undefined;
    this.hasClipboard.set(false);
    this.savedContent = dirty ? '' : fingerprint(parsed);
    this.syncHistory();
    this.persist();
  }
  saved(project: Project) {
    this.savedContent = fingerprint(project);
    this.project.update((current) => ({ ...current, revision: project.revision }));
    this.persist();
  }
  export() {
    const blob = new Blob([JSON.stringify(this.project(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `${this.project().name.replace(/[^a-z0-9]+/gi, '-')}.twynix.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

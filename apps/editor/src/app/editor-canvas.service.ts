import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import {
  ConnectionMedium,
  PortEndpoint,
  ProcessConnection,
  SignalMedium,
  Widget,
} from '@twynix/model';
import {
  boundsOf,
  clamp,
  intersects,
  moveWidgets,
  Rect,
  resizeBounds,
  ResizeHandle,
  scaleWidgets,
} from '../../../../packages/editor/src/geometry';
import {
  routeConnection,
  routePath,
  type RoutePoint,
} from '../../../../packages/editor/src/pipe-routing';
import {
  portKey,
  ProcessPort,
  processPorts,
  snapToPort,
} from '../../../../packages/editor/src/ports';
import { resizeRotatedSelection, selectionFrame } from '../../../../packages/editor/src/rotation';
import { screenConnections } from '../../../../packages/editor/src/screen-presentation';
import {
  compatibleSignalTargets,
  nearestSignalTarget,
  previewSignalToPointer,
} from '../../../../packages/editor/src/signal-drag';
import {
  signalDecorations,
  signalPorts,
  signalStyles,
} from '../../../../packages/editor/src/signals';
import {
  equalSpacing,
  smartAlignment,
  spacingIndicators,
  type Guide,
  type Spacing,
} from '../../../../packages/editor/src/smart-guides';
import { EditorStore } from './editor.store';
import { HmiBehaviorRuntime } from './hmi-behavior-runtime.service';
import { HmiFeedbackService } from './hmi-feedback.service';
import { HmiRuntimeContext } from './hmi-runtime-context.service';
import { HmiViewportService } from './hmi-viewport.service';

@Injectable()
export class EditorCanvasService {
  private readonly context = inject(HmiRuntimeContext);
  private readonly store = inject(EditorStore);
  private readonly behavior = inject(HmiBehaviorRuntime);
  private readonly viewport = inject(HmiViewportService);
  private readonly feedback = inject(HmiFeedbackService);
  readonly mode = this.context.mode;
  readonly displayScreen = this.context.screen;
  private readonly runtimeWidgets = this.behavior.runtimeWidgets;
  readonly zoom = this.viewport.zoom;
  readonly pan = this.viewport.pan;
  private readonly worldPoint = this.viewport.worldPoint.bind(this.viewport);
  private readonly startPan = this.viewport.startPan.bind(this.viewport);
  private readonly fit = this.viewport.fit.bind(this.viewport);
  private readonly notify = this.feedback.notify.bind(this.feedback);
  private destroyed = false;
  private readonly frames = new Set<number>();

  private drag?: {
    x: number;
    y: number;
    originals: Widget[];
    bounds: Rect;
    handle?: ResizeHandle;
    moved: boolean;
  };
  private marqueeStart?: { x: number; y: number; base: string[] };
  private paneDrag?: { axis: 'left' | 'right' | 'bottom'; start: number; original: number };
  spaceHeld = false;
  readonly tool = signal<'select' | 'hand'>('select');
  readonly snap = signal(true);
  readonly grid = signal(true);
  readonly marquee = signal<Rect | null>(null);
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
    const rotated = new Map(
      (this.mode() === 'edit' ? this.rotationPreview() : []).map((widget) => [widget.id, widget]),
    );
    return this.runtimeWidgets().map((widget) => rotated.get(widget.id) ?? widget);
  });
  readonly renderedPorts = computed(() => {
    const ghosts = new Map(
      (this.mode() === 'edit' ? [...this.dragGhosts(), ...this.rotationPreview()] : []).map(
        (widget) => [widget.id, widget],
      ),
    );
    return this.runtimeWidgets().flatMap((widget) =>
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
      (this.mode() === 'edit' ? [...this.dragGhosts(), ...this.rotationPreview()] : []).map(
        (widget) => [widget.id, widget],
      ),
    );
    const widgets = this.runtimeWidgets().map((widget) => ghosts.get(widget.id) ?? widget);
    const preview = this.routePreview();
    return screenConnections(
      screen,
      widgets,
      screen.connections.map((connection) =>
        preview?.id === connection.id ? { ...connection, bendPoints: preview.points } : connection,
      ),
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
  readonly leftWidth = signal(248);
  readonly rightWidth = signal(320);
  readonly bottomHeight = signal(155);
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
  selectRoute(event: Event, id: string) {
    event.preventDefault();
    event.stopPropagation();
    if (this.mode() !== 'edit') return;
    this.store.clearSelection();
    this.pendingPort.set(null);
    this.selectedRouteId.set(id);
    this.viewport.element().focus({ preventScroll: true });
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
    this.afterFrame(() =>
      this.viewport
        .element()
        .querySelector<SVGElement>(`circle[data-pin-index="${handle.index}"]`)
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
      this.viewport.element().focus({ preventScroll: true });
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
    this.viewport.element().focus({ preventScroll: true });
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
  pointerMove(event: PointerEvent) {
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
    if (this.viewport.movePan(event)) return;
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
  pointerUp(event?: PointerEvent) {
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
    this.viewport.endPan();
    this.paneDrag = undefined;
    this.marqueeStart = undefined;
    this.marquee.set(null);
  }
  pointerCancel() {
    this.signalDrag.set(null);
    this.routeDrag = undefined;
    this.routePreview.set(null);
    this.dragGhosts.set([]);
    this.alignmentGuides.set([]);
    this.spacingHints.set([]);
    this.pointerUp();
  }
  keyUp(event: KeyboardEvent) {
    if (event.code === 'Space') this.spaceHeld = false;
  }
  blur() {
    this.spaceHeld = false;
    this.pointerCancel();
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
      this.fit(this.viewport.element());
      return;
    }
    this.viewport.fitBounds(box);
  }
  constructor() {
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
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      for (const frame of this.frames) cancelAnimationFrame(frame);
      this.frames.clear();
      this.dragGhosts.set([]);
      this.rotationPreview.set([]);
    });
  }
  private afterFrame(work: () => void) {
    const id = requestAnimationFrame(() => {
      this.frames.delete(id);
      if (!this.destroyed) work();
    });
    this.frames.add(id);
  }
  routeDragging() {
    return !!this.routeDrag;
  }
  dragging() {
    return !!this.drag;
  }
}

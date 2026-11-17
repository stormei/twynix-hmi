import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import {
  bindableProperties,
  BindableProperty,
  bindingKey,
  isControlKind,
  propertyBinding,
  Screen,
  Widget,
  widgetBindings,
} from '@twynix/model';
import {
  BindingEnvironment,
  defaultProperties,
  ResolvedProperties,
  resolveWidgetProperties,
} from '../../../../packages/bindings/src/resolve';
import { ApiService } from './api.service';
import { HmiRuntimeContext } from './hmi-runtime-context.service';
import { RealtimeService } from './realtime.service';
import { ScriptService } from './script.service';

@Injectable()
export class HmiBindingRuntime {
  private readonly context = inject(HmiRuntimeContext);
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly scripts = inject(ScriptService);
  readonly mode = this.context.mode;
  readonly dataSource = this.context.dataSource;
  readonly displayScreen = this.context.screen;

  readonly tick = signal(0);
  readonly histories = signal<Record<string, number[]>>({});
  readonly resolvedProperties = signal<Record<string, ResolvedProperties>>({});
  private bindingGeneration = 0;
  private readonly bindingPending = signal(false);
  private bindingScreen?: Screen;
  private bindingSnapshot = '';
  private bindingRefreshTick = -1;
  private resolvingBindings = false;
  private queuedBindings?: {
    widgets: Widget[];
    environment: BindingEnvironment;
    generation: number;
    demos: Map<string, number>;
  };
  private resolvedWidgets = new Map<string, Widget>();
  private bindingSignature = '';
  private async refreshBindings() {
    if (this.resolvingBindings) return;
    this.resolvingBindings = true;
    try {
      // Coalesce updates while the interpreter is busy instead of growing its work queue.
      while (this.queuedBindings) {
        const batch = this.queuedBindings;
        this.queuedBindings = undefined;
        const entries: [string, ResolvedProperties][] = [];
        // Bound expression submissions even for 500-widget documents; abandon obsolete batches early.
        for (let offset = 0; offset < batch.widgets.length; offset += 8) {
          if (batch.generation !== this.bindingGeneration) break;
          const resolved = await Promise.all(
            batch.widgets
              .slice(offset, offset + 8)
              .map(
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
          entries.push(
            ...resolved.map(([id, properties]) => [id, properties] as [string, ResolvedProperties]),
          );
        }
        if (batch.generation === this.bindingGeneration) {
          this.resolvedWidgets = new Map(batch.widgets.map((widget) => [widget.id, widget]));
          this.resolvedProperties.set(Object.fromEntries(entries));
          this.bindingPending.set(false);
        }
      }
    } finally {
      this.resolvingBindings = false;
    }
  }
  bindingEnvironment(): BindingEnvironment {
    this.tick();
    return {
      simulation: this.dataSource() === 'simulation' && !this.context.operatorOnly(),
      connected: this.realtime.state() === 'connected',
      values: this.realtime.values(),
      demoValue: 0,
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
    // Runtime clones are presentation only; identity-based binding resolution uses the document.
    if (this.mode() !== 'edit')
      widget = this.displayScreen().widgets.find((base) => base.id === widget.id) ?? widget;
    const resolved = this.resolvedProperties()[widget.id];
    if (resolved && this.resolvedWidgets.get(widget.id) === widget && !this.bindingPending())
      return resolved;
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
  constructor() {
    effect(() => {
      if (!this.context.ready()) return;
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
      if (!this.context.ready()) return;
      const screen = this.displayScreen();
      const environment = this.bindingEnvironment();
      const demos = new Map(
        screen.widgets.map((widget) => [widget.id, this.simulatedValue(widget)]),
      );
      const freshness = screen.widgets.flatMap((widget) =>
        bindableProperties.map((property) => {
          const definition = propertyBinding(widget, property);
          const source =
            definition?.enabled && definition.type !== 'constant' ? definition.source : null;
          const sample = source ? environment.values[bindingKey(source)] : undefined;
          return source && sample ? environment.now - sample.timestamp > source.staleAfterMs : null;
        }),
      );
      const snapshot = JSON.stringify([
        environment.simulation,
        environment.connected,
        environment.values,
        freshness,
        environment.simulation ? [...demos] : null,
      ]);
      const changed = this.bindingScreen !== screen || this.bindingSnapshot !== snapshot;
      const periodic =
        !changed &&
        !this.resolvingBindings &&
        this.bindingRefreshTick !== this.tick() &&
        screen.widgets.some((widget) =>
          bindableProperties.some((property) => {
            const definition = propertyBinding(widget, property);
            return definition?.enabled && definition.type === 'expression';
          }),
        );
      if (!changed && !periodic) return;
      this.bindingScreen = screen;
      this.bindingSnapshot = snapshot;
      this.bindingRefreshTick = this.tick();
      const generation = ++this.bindingGeneration;
      // A time-only refresh has the same inputs: retain valid results without superseding identical work.
      if (changed) this.bindingPending.set(true);
      this.queuedBindings = {
        widgets: screen.widgets,
        environment,
        generation,
        demos,
      };
      void this.refreshBindings();
    });
    const samplingTimer = setInterval(() => {
      if (!this.context.ready()) return;
      this.tick.update((t) => t + 1);
      this.recordSamples();
    }, 2000);
    effect(() => {
      this.context.historyReset();
      untracked(() => this.histories.set({}));
    });
    inject(DestroyRef).onDestroy(() => {
      clearInterval(samplingTimer);
      this.bindingGeneration++;
      this.queuedBindings = undefined;
      this.realtime.disconnect();
    });
  }
}

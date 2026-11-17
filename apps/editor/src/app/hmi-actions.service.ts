import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import {
  bindingKey,
  isControlKind,
  propertyBinding,
  ScriptEffect,
  Widget,
  type ControlValue,
} from '@twynix/model';
import { scriptInputs } from '../../../../packages/scripting/src/inputs';
import { CommandStateService } from './command-state.service';
import { HmiBehaviorRuntime } from './hmi-behavior-runtime.service';
import { HmiBindingRuntime } from './hmi-binding-runtime.service';
import { HmiFeedbackService } from './hmi-feedback.service';
import { HmiRuntimeContext } from './hmi-runtime-context.service';
import { RealtimeService } from './realtime.service';
import { ScriptService } from './script.service';

@Injectable()
export class HmiActionsService {
  private readonly context = inject(HmiRuntimeContext);
  private readonly bindings = inject(HmiBindingRuntime);
  private readonly behavior = inject(HmiBehaviorRuntime);
  private readonly commands = inject(CommandStateService);
  private readonly realtime = inject(RealtimeService);
  private readonly scripts = inject(ScriptService);
  private readonly feedback = inject(HmiFeedbackService);
  readonly mode = this.context.mode;
  readonly displayScreen = this.context.screen;
  readonly activeRelease = this.context.activeRelease;
  private readonly effects = this.behavior.effects;
  private readonly value = this.bindings.value.bind(this.bindings);
  private readonly quality = this.bindings.quality.bind(this.bindings);
  private readonly widgetEnabled = this.bindings.widgetEnabled.bind(this.bindings);
  private readonly widgetVisible = this.bindings.widgetVisible.bind(this.bindings);
  private readonly notify = this.feedback.notify.bind(this.feedback);
  private readonly message = (error: unknown) =>
    error instanceof Error ? error.message : 'Operation failed.';

  readonly previewInputs = signal<Record<string, ControlValue>>({});
  readonly equipmentDetails = signal<Widget | null>(null);
  private destroyed = false;
  private singleClick?: ReturnType<typeof setTimeout>;
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
  async activate(
    widget: Widget,
    event: 'activate' | 'doubleClick' = 'activate',
    inputValue?: ControlValue,
  ) {
    if (this.mode() === 'edit') return;
    if (!this.widgetEnabled(widget) || !this.widgetVisible(widget)) return;
    const script = event === 'activate' ? widget.onClick : widget.onDoubleClick;
    if (!script.trim()) {
      this.performAction(widget, event, inputValue);
      return;
    }
    const transition = this.context.transition().sequence;
    const sourceMode = this.mode(),
      sourceScreen = this.displayScreen();
    try {
      const effects: ScriptEffect[] = await this.scripts.run(script, {
        value: inputValue ?? this.value(widget),
        quality: this.quality(widget),
        name: widget.name,
        inputs: scriptInputs(
          widget.behaviorConfig,
          this.realtime.values(),
          this.realtime.state() === 'connected',
          Date.now(),
        ),
      });
      // An asynchronous Preview script must never become a Runtime command after navigation.
      if (
        this.destroyed ||
        this.context.transition().sequence !== transition ||
        this.mode() !== sourceMode ||
        this.displayScreen() !== sourceScreen
      )
        return;
      let actionRequested = false;
      for (const effect of effects) {
        if (effect.type === 'notify') this.notify(effect.value);
        if (effect.type === 'action' && !actionRequested) {
          actionRequested = true;
          this.performAction(widget, event, inputValue);
        }
        if (
          (effect.type === 'text' || effect.type === 'color') &&
          !(
            widget.behaviorConfig?.resultMode === 'appearance' &&
            widget.behaviorConfig.outputs.includes(effect.type)
          )
        )
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
  constructor() {
    effect(() => {
      if (!this.context.ready()) return;
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
      this.context.transition();
      untracked(() => {
        clearTimeout(this.singleClick);
        this.previewInputs.set({});
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.commands.reset();
      clearTimeout(this.singleClick);
    });
  }
  switchScreen(id: string) {
    if (this.commands.busy()) {
      this.notify('Complete the current command before switching screens.');
      return;
    }
    this.commands.reset();
    this.context.navigate(id);
  }
}

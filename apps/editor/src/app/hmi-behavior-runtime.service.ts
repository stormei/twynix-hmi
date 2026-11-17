import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { behaviorConfigurationError, Screen, type Appearance } from '@twynix/model';
import { runtimeWidget } from '../../../../packages/editor/src/runtime-appearance';
import { validateAppearance } from '../../../../packages/scripting/src/evaluate';
import { scriptInputs } from '../../../../packages/scripting/src/inputs';
import {
  BehaviorScheduler,
  type BehaviorDiagnostic,
  type BehaviorJob,
} from '../../../../packages/scripting/src/scheduler';
import { ApiService } from './api.service';
import { HmiBindingRuntime } from './hmi-binding-runtime.service';
import { HmiFeedbackService } from './hmi-feedback.service';
import { HmiRuntimeContext } from './hmi-runtime-context.service';
import { RealtimeService } from './realtime.service';
import { ScriptService } from './script.service';

@Injectable()
export class HmiBehaviorRuntime {
  private readonly context = inject(HmiRuntimeContext);
  private readonly bindings = inject(HmiBindingRuntime);
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly scripts = inject(ScriptService);
  private readonly feedback = inject(HmiFeedbackService);
  readonly mode = this.context.mode;
  readonly displayScreen = this.context.screen;
  private readonly tick = this.bindings.tick;
  private readonly value = this.bindings.value.bind(this.bindings);
  private readonly quality = this.bindings.quality.bind(this.bindings);
  private readonly log = this.feedback.log.bind(this.feedback);

  readonly effects = signal<Record<string, Appearance>>({});
  readonly behaviorDiagnostics = signal<Record<string, BehaviorDiagnostic>>({});
  private behaviorScope = '';
  private behaviorScreen?: Screen;
  private readonly behaviorScheduler = new BehaviorScheduler(
    async (job) => {
      if (job.outputs) {
        const appearance = validateAppearance(
          await this.scripts.behavior(job.source, job.context),
          job.outputs,
        );
        const screen = this.displayScreen();
        const widget = screen.widgets.find((widget) => widget.id === job.id);
        if (widget) runtimeWidget(widget, appearance, screen);
        return appearance;
      }
      const effects = await this.scripts.run(job.source, job.context);
      const appearance: Appearance = {};
      for (const effect of effects) {
        if (effect.type === 'text') appearance.text = effect.value;
        if (effect.type === 'color') appearance.color = effect.value;
      }
      return appearance;
    },
    (id, appearance, diagnostic) => {
      const previous = this.behaviorDiagnostics()[id];
      this.effects.update((all) => ({ ...all, [id]: appearance }));
      this.behaviorDiagnostics.update((all) => ({ ...all, [id]: diagnostic }));
      if (
        (diagnostic.state === 'error' || diagnostic.state === 'quarantined') &&
        previous?.message !== diagnostic.message
      )
        this.log(
          `${this.displayScreen().widgets.find((widget) => widget.id === id)?.name ?? id}: ${diagnostic.message}`,
          true,
        );
      if (
        diagnostic.state === 'ok' &&
        previous &&
        (previous.state === 'error' || previous.state === 'quarantined')
      )
        this.log(
          `${this.displayScreen().widgets.find((widget) => widget.id === id)?.name ?? id}: Behavior recovered.`,
        );
    },
  );
  readonly runtimePresentation = computed(() => {
    if (!this.context.ready())
      return { widgets: [], appearances: {} as Record<string, Appearance> };
    const screen = this.displayScreen();
    const appearances: Record<string, Appearance> = {};
    const widgets = screen.widgets.map((widget) => {
      const appearance = this.mode() !== 'edit' ? this.effects()[widget.id] : undefined;
      if (!appearance) return widget;
      try {
        const rendered = runtimeWidget(widget, appearance, screen);
        appearances[widget.id] = appearance;
        return rendered;
      } catch {
        // A document swap may invalidate the previous result before scheduling resets it.
        // Fall back atomically, without allowing a computed renderer to mutate state.
        return widget;
      }
    });
    return { widgets, appearances };
  });
  readonly runtimeWidgets = computed(() => this.runtimePresentation().widgets);
  constructor() {
    effect(() => {
      if (!this.context.ready()) return;
      const transition = this.context.transition().sequence;
      const mode = this.mode(),
        screen = this.displayScreen();
      const scope = `${transition}:${mode}:${this.context.runtimeProject()?.id ?? ''}:${screen.id}:${this.api.user()?.id.id ?? ''}`;
      const values = this.realtime.values(),
        connected = this.realtime.state() === 'connected';
      this.tick();
      const now = Date.now(),
        userId = this.api.user()?.id.id;
      const jobs: BehaviorJob[] =
        mode === 'edit'
          ? []
          : screen.widgets
              .filter((widget) => widget.behavior.trim())
              .map((widget) => {
                const context = {
                  value: this.value(widget),
                  quality: this.quality(widget),
                  name: widget.name,
                  inputs: scriptInputs(widget.behaviorConfig, values, connected, now),
                };
                const definition = JSON.stringify([
                  widget.behavior,
                  widget.behaviorConfig,
                  widget.kind,
                  widget.propertyBindings,
                ]);
                return {
                  id: widget.id,
                  definition,
                  source: widget.behavior,
                  context,
                  signature: JSON.stringify([
                    definition,
                    context,
                    widget.behaviorConfig?.resultMode === 'appearance'
                      ? null
                      : Math.floor(now / 2000),
                  ]),
                  outputs:
                    widget.behaviorConfig?.resultMode === 'appearance'
                      ? widget.behaviorConfig.outputs
                      : undefined,
                  configurationError: behaviorConfigurationError(widget),
                  isCurrent: () =>
                    this.context.transition().sequence === transition &&
                    this.mode() === mode &&
                    this.displayScreen() === screen &&
                    this.api.user()?.id.id === userId &&
                    JSON.stringify({
                      value: this.value(widget),
                      quality: this.quality(widget),
                      name: widget.name,
                      inputs: scriptInputs(
                        widget.behaviorConfig,
                        this.realtime.values(),
                        this.realtime.state() === 'connected',
                        Date.now(),
                      ),
                    }) === JSON.stringify(context),
                };
              });
      untracked(() => {
        if (this.behaviorScope !== scope || this.behaviorScreen !== screen) {
          this.behaviorScreen = screen;
          this.behaviorScope = scope;
          this.behaviorScheduler.reset();
          this.effects.set({});
          this.behaviorDiagnostics.set({});
        }
        this.behaviorScheduler.sync(jobs);
      });
    });
    const behaviorTimer = setInterval(() => void this.behaviorScheduler.pump(), 100);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(behaviorTimer);
      this.behaviorScheduler.reset();
    });
  }
  retryBehavior(id: string) {
    if (this.mode() !== 'edit') this.behaviorScheduler.retry(id);
  }
}

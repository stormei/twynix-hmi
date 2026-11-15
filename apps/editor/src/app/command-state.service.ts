import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import type { ControlValue } from '@twynix/model';
import type {
  CommandContext,
  CommandRecord,
  CommandRuntimeService,
  SimulationResult,
} from './command-runtime.service';

/** Keep command execution optional: editing a diagram does not load the RPC engine. */
@Injectable({ providedIn: 'root' })
export class CommandStateService {
  private readonly injector = inject(Injector);
  private readonly engine = signal<CommandRuntimeService | null>(null);
  private readonly loading = signal(false);
  private readonly failure = signal<CommandRecord | null>(null);
  private generation = 0;
  readonly current = computed(() => this.failure() ?? this.engine()?.current() ?? null);
  readonly pending = computed(() => this.engine()?.pending() ?? null);
  busy() {
    return this.loading() || !!this.engine()?.busy();
  }
  async prepare(context: CommandContext, value?: ControlValue) {
    if (this.busy()) return false;
    const generation = this.generation;
    this.loading.set(true);
    this.failure.set(null);
    try {
      let engine = this.engine();
      if (!engine) {
        const module = await import('./command-runtime.service');
        engine = this.injector.get(module.CommandRuntimeService);
        if (generation !== this.generation) return false;
        this.engine.set(engine);
      }
      if (generation !== this.generation) return false;
      return engine.prepare(context, value);
    } catch {
      if (generation === this.generation)
        this.failure.set({
          id: crypto.randomUUID(),
          widgetId: context.widget.id,
          name: context.widget.name,
          phase: 'failed',
          message: 'The command tools could not load. Nothing was sent. Reload to try again.',
          simulated: context.mode === 'preview',
          method: '',
          params: {},
          requested: value,
          reported: null,
          quality: 'unknown',
          sentAt: 0,
        });
      return false;
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  confirm() {
    return this.engine()?.confirm();
  }
  cancel() {
    this.engine()?.cancel();
  }
  reset(clearHistory = false) {
    this.generation++;
    this.loading.set(false);
    this.failure.set(null);
    this.engine()?.reset();
    if (clearHistory) this.engine()?.history.set([]);
  }
  observe(value: unknown, quality: string, timestamp: number) {
    this.engine()?.observe(value, quality, timestamp);
  }
  get simulationResult(): SimulationResult {
    return this.engine()?.simulationResult ?? 'confirmed';
  }
  set simulationResult(value: SimulationResult) {
    const engine = this.engine();
    if (engine) engine.simulationResult = value;
  }
}

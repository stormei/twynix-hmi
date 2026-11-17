import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  commandExpectedValue,
  commandPolicy,
  commandReadbackMatches,
  resolveCommandParams,
  type CommandAction,
  type ControlValue,
  type Release,
  type Widget,
} from '@twynix/model';
import { ApiError, ApiService } from './api.service';
import { RealtimeService } from './realtime.service';
export type CommandPhase =
  | 'confirming'
  | 'sending'
  | 'accepted'
  | 'confirmed'
  | 'invalid'
  | 'denied'
  | 'failed'
  | 'timeout'
  | 'cancelled';
export interface CommandContext {
  widget: Widget;
  screenId: string;
  event: 'activate' | 'doubleClick';
  mode: 'preview' | 'runtime';
  release?: Release;
  authority?: string;
  canActivate?: () => boolean;
}
export interface CommandRecord {
  id: string;
  widgetId: string;
  name: string;
  phase: CommandPhase;
  message: string;
  simulated: boolean;
  method: string;
  params: Record<string, unknown>;
  requested: unknown;
  reported: unknown;
  quality: string;
  sentAt: number;
}
export type SimulationResult = 'accepted' | 'confirmed' | 'failed' | 'timeout';
export interface CommandHistoryEntry extends CommandRecord {
  sample?: boolean;
  recordedAt: number;
  simulationResult: SimulationResult | null;
}
interface Pending {
  context: CommandContext;
  action: CommandAction;
  value: unknown;
  params: ReturnType<typeof resolveCommandParams>;
  id: string;
}
@Injectable({ providedIn: 'root' })
export class CommandRuntimeService {
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  readonly current = signal<CommandRecord | null>(null);
  readonly pending = signal<Pending | null>(null);
  readonly history = signal<CommandHistoryEntry[]>([]);
  readonly clearedEntries = signal<CommandHistoryEntry[]>([]);
  simulationResult: SimulationResult = 'confirmed';
  private active?: Pending;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private sentAfterTimestamp = 0;
  private lastReported?: { value: unknown; quality: string; timestamp: number };
  private clearedHistoryId?: string;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.reset());
  }
  busy() {
    const current = this.current();
    return (
      !!current &&
      (['confirming', 'sending'].includes(current.phase) ||
        (current.phase === 'accepted' && !!this.active?.action.policy?.feedback))
    );
  }
  prepare(context: CommandContext, value?: ControlValue): boolean {
    if (this.busy()) return false;
    const action =
      context.event === 'doubleClick' ? context.widget.doubleClickAction : context.widget.action;
    if (action.type !== 'command') return false;
    this.clearTimer();
    this.generation++;
    this.lastReported = undefined;
    const id = crypto.randomUUID();
    this.current.set({
      id,
      widgetId: context.widget.id,
      name: context.widget.name,
      phase: 'confirming',
      message: action.confirmation,
      simulated: context.mode === 'preview',
      method: action.method,
      params: {},
      requested: value,
      reported: null,
      quality: 'unknown',
      sentAt: 0,
    });
    try {
      if (
        context.mode === 'runtime' &&
        (!context.release ||
          !this.api.user() ||
          !this.api.commandsEnabled() ||
          this.realtime.state() !== 'connected')
      )
        throw new ApiError('Commands require a live session and an enabled gateway.', 403);
      const authority =
        context.mode === 'preview'
          ? (context.authority ?? 'TENANT_ADMIN')
          : this.api.user()!.authority;
      const policy = commandPolicy(action);
      if (context.mode === 'runtime' && policy.previewOnly)
        throw new ApiError('This example is Preview-only. No equipment command is permitted.', 403);
      if (policy.authorities.length && !policy.authorities.some((role) => role === authority))
        throw new ApiError('Your ThingsBoard authority is not permitted to run this command.', 403);
      const params = resolveCommandParams(action, context.widget, value, authority);
      const pending = { context, action, value, params, id };
      this.active = pending;
      this.pending.set(pending);
      this.patch({ params });
      return true;
    } catch (error) {
      this.active = undefined;
      this.pending.set(null);
      this.patch({
        phase: error instanceof ApiError && error.status === 403 ? 'denied' : 'invalid',
        message: this.message(error),
      });
      return false;
    }
  }
  cancel() {
    if (this.current()?.phase !== 'confirming') return;
    this.pending.set(null);
    this.active = undefined;
    this.patch({ phase: 'cancelled', message: 'Command cancelled. Nothing was sent.' });
  }
  async confirm() {
    const pending = this.pending();
    if (!pending || this.current()?.phase !== 'confirming') return;
    const generation = this.generation;
    this.sentAfterTimestamp = this.lastReported?.timestamp ?? 0;
    this.pending.set(null);
    this.patch({
      phase: 'sending',
      message: pending.context.mode === 'preview' ? 'Simulating command…' : 'Sending command…',
      sentAt: Date.now(),
    });
    if (pending.context.mode === 'preview') {
      const outcome = this.simulationResult;
      this.timer = setTimeout(() => {
        if (generation !== this.generation) return;
        if (outcome === 'failed' || outcome === 'timeout') {
          this.patch({
            phase: outcome,
            message:
              outcome === 'timeout'
                ? 'Simulated timeout. Outcome is unknown; no command was sent.'
                : 'Simulated device failure. No command was sent.',
          });
          return;
        }
        this.accepted();
        if (outcome === 'confirmed' && commandPolicy(pending.action).feedback) {
          const expected = commandExpectedValue(pending.action, pending.value);
          this.observe(expected, 'simulation', Date.now() + 1, true);
        }
      }, 250);
      return;
    }
    try {
      // Recheck session availability at confirmation; the gateway repeats all authoritative checks.
      if (
        !this.api.user() ||
        !this.api.commandsEnabled() ||
        this.realtime.state() !== 'connected' ||
        (pending.context.canActivate && !pending.context.canActivate())
      )
        throw new ApiError('The live session is no longer available.', 403);
      const release = pending.context.release!,
        policy = commandPolicy(pending.action);
      if (
        policy.authorities.length &&
        !policy.authorities.some((role) => role === this.api.user()!.authority)
      )
        throw new ApiError(
          'Your ThingsBoard authority is no longer permitted to run this command.',
          403,
        );
      const response = await this.api.request<{ state: 'accepted' | 'rejected' }>(
        `/projects/${release.project.id}/releases/${release.id}/commands`,
        'POST',
        {
          screenId: pending.context.screenId,
          widgetId: pending.context.widget.id,
          event: pending.context.event,
          requestId: pending.id,
          ...(policy.mapping ? { value: pending.value } : {}),
        },
        AbortSignal.timeout(policy.timeoutMs + 7000),
      );
      if (generation === this.generation) {
        if (response.state === 'accepted') this.accepted();
        else
          this.patch({
            phase: 'failed',
            message:
              'The device reply did not satisfy the configured success condition. Verify equipment state.',
          });
      }
    } catch (error) {
      if (generation !== this.generation) return;
      const timeout =
        (error instanceof ApiError && error.status === 504) ||
        (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name));
      const denied = error instanceof ApiError && [401, 403].includes(error.status);
      this.patch({
        phase: timeout ? 'timeout' : denied ? 'denied' : 'failed',
        message: `${this.message(error)} Nothing was retried. Verify reported equipment state before trying again.`,
      });
    }
  }
  private accepted() {
    const active = this.active;
    if (!active) return;
    const policy = commandPolicy(active.action);
    this.patch({
      phase: 'accepted',
      message: policy.feedback
        ? 'Device reply received. Waiting for a fresh matching reported value.'
        : 'Device reply received. This does not confirm physical operation.',
    });
    if (policy.feedback) {
      this.timer = setTimeout(() => {
        if (this.current()?.phase === 'accepted')
          this.patch({
            phase: 'timeout',
            message:
              'Reported value did not match in time. Verify equipment state; the command was not retried.',
          });
      }, policy.feedback.timeoutMs);
      if (this.lastReported)
        this.observe(
          this.lastReported.value,
          this.lastReported.quality,
          this.lastReported.timestamp,
        );
    }
  }
  observe(value: unknown, quality: string, timestamp: number, simulation = false) {
    if (
      !this.active ||
      (this.active.context.mode === 'preview' && !simulation) ||
      (simulation && this.active.context.mode !== 'preview')
    )
      return;
    const current = this.current();
    if (!current) return;
    this.lastReported = { value, quality, timestamp };
    if (current.reported !== value || current.quality !== quality)
      this.patch({ reported: value, quality });
    const policy = commandPolicy(this.active.action);
    if (
      current.phase === 'accepted' &&
      policy.feedback &&
      timestamp > Math.max(current.sentAt, this.sentAfterTimestamp) &&
      ['good', ...(simulation ? ['simulation'] : [])].includes(quality) &&
      commandReadbackMatches(
        commandExpectedValue(this.active.action, this.active.value),
        value,
        policy.feedback.tolerance,
      )
    ) {
      this.clearTimer();
      this.patch({
        phase: 'confirmed',
        message: simulation
          ? 'Simulated reported value matches the request. No command was sent.'
          : 'Fresh reported value matches the request. Verify the process as required.',
      });
    }
  }
  reset(clearHistory = false) {
    this.generation++;
    this.clearTimer();
    this.pending.set(null);
    this.active = undefined;
    this.lastReported = undefined;
    this.current.set(null);
    if (clearHistory) {
      this.history.set([]);
      this.clearedEntries.set([]);
    }
  }
  clearHistory(widgetIds: readonly string[]) {
    const ids = new Set(widgetIds);
    const removed = this.history().filter((entry) => ids.has(entry.widgetId));
    if (!removed.length) return;
    this.clearedEntries.set(removed);
    const current = this.current();
    // Keep active feedback running, but do not resurrect an explicitly cleared attempt.
    if (current && ids.has(current.widgetId)) this.clearedHistoryId = current.id;
    this.history.update((entries) => entries.filter((entry) => !ids.has(entry.widgetId)));
  }
  undoClearHistory(widgetIds: readonly string[]) {
    const ids = new Set(widgetIds);
    const removed = this.clearedEntries().filter((entry) => ids.has(entry.widgetId));
    if (!removed.length) return;
    const current = this.current();
    const restored = removed.map((entry) =>
      current?.id === entry.id ? { ...entry, ...current } : entry,
    );
    this.history.update((entries) => {
      const existing = new Set(entries.map((entry) => entry.id));
      return [...entries, ...restored.filter((entry) => !existing.has(entry.id))]
        .sort((a, b) => b.recordedAt - a.recordedAt)
        .slice(0, 100);
    });
    if (removed.some((entry) => entry.id === this.clearedHistoryId))
      this.clearedHistoryId = undefined;
    this.clearedEntries.update((entries) => entries.filter((entry) => !ids.has(entry.widgetId)));
  }
  private clearTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private patch(patch: Partial<CommandRecord>) {
    this.current.update((current) => (current ? { ...current, ...patch } : null));
    const record = this.current();
    if (!record?.simulated || record.id === this.clearedHistoryId) return;
    this.history.update((entries) => {
      const previous = entries.find((entry) => entry.id === record.id);
      const entry: CommandHistoryEntry = {
        ...record,
        recordedAt: previous?.recordedAt ?? Date.now(),
        simulationResult:
          record.phase === 'sending' ? this.simulationResult : (previous?.simulationResult ?? null),
      };
      return [entry, ...entries.filter((item) => item.id !== record.id)].slice(0, 100);
    });
  }
  private message(error: unknown) {
    return error instanceof Error ? error.message : 'Command could not be completed.';
  }
}

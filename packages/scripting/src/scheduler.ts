import type { Appearance } from '../../model/src';
import type { ScriptContext } from './evaluate';

export interface BehaviorJob {
  id: string;
  /** Changes only when source/configuration changes, allowing quarantined scripts to recover. */
  definition: string;
  signature: string;
  source: string;
  context: ScriptContext;
  outputs?: readonly string[];
  configurationError?: string;
  isCurrent?: () => boolean;
}
export interface BehaviorDiagnostic {
  state: 'pending' | 'ok' | 'error' | 'quarantined';
  message: string;
  durationMs: number;
}
interface Entry {
  job: BehaviorJob;
  pending: boolean;
  failures: number;
}
/** One active job and one latest pending snapshot per widget; at most 10 starts/second. */
export class BehaviorScheduler {
  private entries = new Map<string, Entry>();
  private busy = false;
  private lastStart = -Infinity;
  private epoch = 0;
  constructor(
    private readonly evaluate: (job: BehaviorJob) => Promise<Appearance>,
    private readonly publish: (
      id: string,
      appearance: Appearance,
      diagnostic: BehaviorDiagnostic,
    ) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}
  reset() {
    this.epoch++;
    this.entries.clear();
  }
  sync(jobs: BehaviorJob[]) {
    if (jobs.length > 500) throw new Error('Behavior screen exceeds 500 widgets.');
    const ids = new Set(jobs.map((job) => job.id));
    for (const id of this.entries.keys())
      if (!ids.has(id)) {
        this.entries.delete(id);
        this.publish(
          id,
          {},
          { state: 'ok', message: 'Behavior removed; baseline restored.', durationMs: 0 },
        );
      }
    for (const job of jobs) {
      const entry = this.entries.get(job.id);
      if (!entry || entry.job.definition !== job.definition) {
        this.entries.set(job.id, { job, pending: true, failures: 0 });
        this.pending(job);
      } else if (entry.job.signature !== job.signature) {
        entry.job = job;
        entry.pending = entry.failures < 3;
        if (entry.pending) this.pending(job);
      }
    }
  }
  retry(id: string) {
    const current = this.entries.get(id);
    if (!current) return;
    this.entries.set(id, { job: current.job, pending: true, failures: 0 });
    this.pending(current.job);
  }
  private pending(job: BehaviorJob) {
    if (job.outputs)
      this.publish(
        job.id,
        {},
        {
          state: 'pending',
          message: 'Waiting for the latest input snapshot; baseline restored.',
          durationMs: 0,
        },
      );
  }
  async pump(): Promise<void> {
    if (this.busy || this.now() - this.lastStart < 100) return;
    const next = [...this.entries].find(([, entry]) => entry.pending);
    if (!next) return;
    const [id, entry] = next;
    // Move serviced entry to the end for round-robin fairness, including hot inputs.
    this.entries.delete(id);
    this.entries.set(id, entry);
    entry.pending = false;
    this.busy = true;
    const job = entry.job,
      epoch = this.epoch,
      started = this.now();
    this.lastStart = started;
    let appearance: Appearance = {},
      error: string | undefined;
    try {
      if (job.configurationError) throw new Error(job.configurationError);
      appearance = await this.evaluate(job);
    } catch (failure) {
      error = failure instanceof Error && failure.message ? failure.message : 'Behavior failed.';
    } finally {
      this.busy = false;
    }
    if (epoch !== this.epoch || this.entries.get(id) !== entry) return;
    // Count failures for the definition even if newer telemetry superseded this invocation.
    // Otherwise a fast input stream can prevent a broken script from ever quarantining.
    if (error) {
      entry.failures++;
      entry.pending = entry.failures < 3;
    } else entry.failures = 0;
    if (!error && job.isCurrent?.() === false) return;
    if (!error && entry.job !== job) return;
    this.publish(id, error ? {} : appearance, {
      state: error ? (entry.failures >= 3 ? 'quarantined' : 'error') : 'ok',
      message: error
        ? `${error} Baseline restored.${entry.failures >= 3 ? ' Edit the behavior configuration to retry.' : ''}`
        : 'Behavior applied.',
      durationMs: this.now() - started,
    });
  }
}

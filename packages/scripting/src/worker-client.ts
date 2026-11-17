import type { ScriptContext } from './evaluate';
export type ScriptMode = 'script' | 'expression' | 'behavior';
type WorkerPort = Pick<
  Worker,
  'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'
>;
interface Request {
  id: number;
  source: string;
  context: ScriptContext;
  mode: ScriptMode;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}
/** Serialize interpreter work; cap snapshots queued across behaviors, bindings and editor tests. */
export class ScriptWorkerClient {
  private worker?: WorkerPort;
  private sequence = 0;
  private queue: Request[] = [];
  private active?: Request;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(private readonly createWorker: () => WorkerPort) {}
  execute(source: string, context: ScriptContext, mode: ScriptMode): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.disposed) {
        reject(new Error('Script service is closed.'));
        return;
      }
      if (this.queue.length + (this.active ? 1 : 0) >= 64) {
        reject(new Error('Script work queue is full.'));
        return;
      }
      if (source.length > (mode === 'expression' ? 4000 : 20000)) {
        reject(new Error('Script source exceeds size limit.'));
        return;
      }
      try {
        const snapshot = structuredClone(context);
        if (JSON.stringify(snapshot).length > 160000)
          throw new Error('Script inputs exceed size limit.');
        this.queue.push({ id: ++this.sequence, source, context: snapshot, mode, resolve, reject });
        this.pump();
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Invalid script context.'));
      }
    });
  }
  dispose() {
    this.disposed = true;
    this.reset('Script service is closed.');
  }
  private pump() {
    while (!this.active && this.queue.length && !this.disposed) {
      const request = this.queue.shift()!;
      try {
        if (!this.worker) {
          const worker = this.createWorker();
          this.worker = worker;
          worker.onmessage = ({ data }: MessageEvent<unknown>) => {
            if (this.worker !== worker) return;
            if (
              !data ||
              typeof data !== 'object' ||
              !('id' in data) ||
              !this.active ||
              data.id !== this.active?.id ||
              (!('result' in data) && !('error' in data)) ||
              ('error' in data && typeof data.error !== 'string')
            ) {
              this.reset('Invalid script worker response.');
              return;
            }
            const active = this.active!;
            clearTimeout(this.timer);
            this.active = undefined;
            if ('error' in data) active.reject(new Error((data.error as string).slice(0, 4000)));
            else if ('result' in data) active.resolve(data.result);
            this.pump();
          };
          worker.onerror = () => {
            if (this.worker === worker) this.reset('Script worker failed.');
          };
          worker.onmessageerror = () => {
            if (this.worker === worker) this.reset('Invalid script worker response.');
          };
        }
        this.active = request;
        // Queue wait does not consume an execution watchdog; only one message is in flight.
        this.timer = setTimeout(() => this.reset('Script execution timed out.'), 5000);
        this.worker.postMessage({
          id: request.id,
          source: request.source,
          context: request.context,
          mode: request.mode,
        });
      } catch (error) {
        clearTimeout(this.timer);
        this.active = undefined;
        request.reject(error instanceof Error ? error : new Error('Script dispatch failed.'));
      }
    }
  }
  private reset(message: string) {
    this.worker?.terminate();
    this.worker = undefined;
    clearTimeout(this.timer);
    const requests = [...(this.active ? [this.active] : []), ...this.queue];
    this.active = undefined;
    this.queue = [];
    for (const request of requests) request.reject(new Error(message));
  }
}

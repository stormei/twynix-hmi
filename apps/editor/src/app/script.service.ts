import { Injectable } from '@angular/core';
import type { PropertyValue, ScriptEffect } from '@twynix/model';
import type { ScriptContext } from '../../../../packages/scripting/src/evaluate';
@Injectable({ providedIn: 'root' })
export class ScriptService {
  private worker?: Worker;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  run(source: string, context: ScriptContext): Promise<ScriptEffect[]> {
    return this.execute(source, context, 'script') as Promise<ScriptEffect[]>;
  }
  expression(source: string, context: ScriptContext): Promise<PropertyValue> {
    return this.execute(source, context, 'expression') as Promise<PropertyValue>;
  }
  private execute(
    source: string,
    context: ScriptContext,
    mode: 'script' | 'expression',
  ): Promise<unknown> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./script.worker', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        const pending = this.pending.get(data.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(data.id);
        if (data.error) pending.reject(new Error(data.error));
        else pending.resolve(data.result);
      };
      this.worker.onerror = () => this.reset('Script worker failed.');
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.reset('Script execution timed out.'), 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ id, source, context, mode });
    });
  }
  private reset(message: string) {
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }
}

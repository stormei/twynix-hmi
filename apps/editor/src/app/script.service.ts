import { DestroyRef, inject, Injectable } from '@angular/core';
import type { Appearance, PropertyValue, ScriptEffect } from '@twynix/model';
import type { ScriptContext } from '../../../../packages/scripting/src/evaluate';
import { ScriptWorkerClient } from '../../../../packages/scripting/src/worker-client';
@Injectable({ providedIn: 'root' })
export class ScriptService {
  private readonly client = new ScriptWorkerClient(
    () => new Worker(new URL('./script.worker', import.meta.url), { type: 'module' }),
  );
  constructor() {
    inject(DestroyRef).onDestroy(() => this.client.dispose());
  }
  run(source: string, context: ScriptContext): Promise<ScriptEffect[]> {
    return this.client.execute(source, context, 'script') as Promise<ScriptEffect[]>;
  }
  behavior(source: string, context: ScriptContext): Promise<Appearance> {
    return this.client.execute(source, context, 'behavior') as Promise<Appearance>;
  }
  expression(source: string, context: ScriptContext): Promise<PropertyValue> {
    return this.client.execute(source, context, 'expression') as Promise<PropertyValue>;
  }
}

import type { QuickJSWASMModule } from 'quickjs-emscripten';
import { z } from 'zod';
import type { PropertyValue, ScriptEffect } from '../../model/src';
const effectsSchema = z
  .array(
    z.object({ type: z.enum(['text', 'color', 'notify', 'action']), value: z.string().max(500) }),
  )
  .max(50);
export interface ScriptContext {
  value: unknown;
  quality: string;
  name: string;
}
export function evaluateScript(
  engine: QuickJSWASMModule,
  source: string,
  context: ScriptContext,
): ScriptEffect[] {
  if (source.length > 20000) throw new Error('Script exceeds 20,000 characters.');
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(8 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  const deadline = Date.now() + 50;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  try {
    const wrapped = `(() => {
      'use strict';
      const context = Object.freeze(${JSON.stringify(context)});
      const effects = [];
      const add = (type, value) => {
        if (effects.length >= 50) throw new Error('Too many script effects.');
        effects.push({type, value: String(value).slice(0,500)});
      };
      const hmi = Object.freeze({
        setText: value => add('text', value),
        setColor: value => add('color', value),
        notify: value => add('notify', value),
        runAction: () => add('action', '')
      });
      (() => {\n${source}\n})();
      return effects;
    })()`;
    const result = vm.evalCode(wrapped, 'widget-script.js');
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(error?.message ?? 'Script execution failed.');
    }
    const effects = vm.dump(result.value);
    result.value.dispose();
    return effectsSchema.parse(effects);
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

/** Expressions share the script interpreter's limits, with no side-effect API exposed. */
export function evaluateExpression(
  engine: QuickJSWASMModule,
  source: string,
  context: ScriptContext,
): PropertyValue {
  if (!source.trim() || source.length > 4000)
    throw new Error('Expression must contain 1–4,000 characters.');
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(8 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  const deadline = Date.now() + 50;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  try {
    const result = vm.evalCode(
      `(() => { "use strict"; const context = Object.freeze(${JSON.stringify(context)}); return (\n${source}\n); })()`,
      'binding-expression.js',
    );
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(error?.message ?? 'Expression failed.');
    }
    const value = vm.dump(result.value);
    result.value.dispose();
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    )
      return value;
    throw new Error('Expressions must return text, a finite number, a boolean, or null.');
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

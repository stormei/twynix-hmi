import type { QuickJSWASMModule, QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';
import { z } from 'zod';
import type { PropertyValue, ScriptEffect } from '../../model/src';
const effectsSchema = z
  .array(
    z.object({ type: z.enum(['text', 'color', 'notify', 'action']), value: z.string().max(500) }),
  )
  .max(50);
export interface ScriptInput {
  value: PropertyValue;
  quality: 'good' | 'stale' | 'missing' | 'disconnected' | 'invalid';
  timestamp: number | null;
  unit: string;
}
export interface ScriptContext {
  value: unknown;
  quality: string;
  name: string;
  inputs?: Record<string, ScriptInput>;
}
/** Captured intrinsics keep error inspection in the VM, including hostile getters/toString. */
function sandbox(engine: QuickJSWASMModule) {
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(8 * 1024 * 1024);
  runtime.setMaxStackSize(256 * 1024);
  const vm = runtime.newContext();
  const compiled = vm.evalCode(`(() => {
    const stringify = JSON.stringify, string = String, apply = Reflect.apply;
    const slice = String.prototype.slice, create = Object.create;
    const trim = value => apply(slice, string(value), [0, 2000]);
    return error => {
      const result = create(null);
      try { result.message = trim(error && error.message !== undefined ? error.message : error); }
      catch { result.message = 'Script error could not be inspected.'; }
      try { result.stack = trim(error && error.stack || ''); } catch { result.stack = ''; }
      return stringify(result);
    };
  })()`);
  if (compiled.error) {
    compiled.error.dispose();
    vm.dispose();
    runtime.dispose();
    throw new Error('Script interpreter initialization failed.');
  }
  const formatter = compiled.value;
  // The unchanged 50 ms deadline measures evaluation, not trusted VM initialization.
  const deadline = performance.now() + 50;
  runtime.setInterruptHandler(() => performance.now() > deadline);
  return { runtime, vm, formatter };
}
function sandboxError(vm: QuickJSContext, formatter: QuickJSHandle, error: QuickJSHandle): unknown {
  try {
    const result = vm.callFunction(formatter, vm.undefined, error);
    if (result.error) {
      result.error.dispose();
      return { message: 'Script execution interrupted or resource limit exceeded.' };
    }
    try {
      return JSON.parse(vm.getString(result.value));
    } finally {
      result.value.dispose();
    }
  } finally {
    error.dispose();
  }
}

function readResult(vm: QuickJSContext, handle: QuickJSHandle, limit: number): unknown {
  if (vm.typeof(handle) !== 'string') throw new Error('Invalid script result.');
  const json = vm.getString(handle);
  if (json.length > limit) throw new Error('Script output exceeds size limit.');
  return JSON.parse(json);
}

/** QuickJS Function adds two constructor lines; trusted bodies add two script lines (one for expressions). */
function scriptFailure(error: unknown, source: string, fallback: string) {
  const details =
    error && typeof error === 'object' ? (error as { message?: unknown; stack?: unknown }) : {};
  const message = typeof details.message === 'string' ? details.message : fallback;
  const native = typeof details.stack === 'string' ? details.stack.match(/<input>:(\d+)/) : null;
  const line = native ? Number(native[1]) - (fallback === 'Expression failed.' ? 3 : 4) : 0;
  return line > 0 && line <= source.split('\n').length ? `Line ${line}: ${message}` : message;
}

export function evaluateScript(
  engine: QuickJSWASMModule,
  source: string,
  context: ScriptContext,
): ScriptEffect[] {
  if (source.length > 20000) throw new Error('Script exceeds 20,000 characters.');
  const { runtime, vm, formatter } = sandbox(engine);
  try {
    const wrapped = `(() => {
      'use strict';
      const context = Object.freeze(JSON.parse(${JSON.stringify(JSON.stringify(context))}));
      const inputs = Object.freeze(context.inputs || {});
      Object.values(inputs).forEach(sample => Object.freeze(sample));
      const stringify = JSON.stringify;
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
      const run = Function('context', 'inputs', 'hmi', ${JSON.stringify('"use strict";\nreturn (() => {\n' + source + '\n})();')});
      run.call(globalThis, context, inputs, hmi);
      if (effects.length > 50) throw new Error('Too many script effects.');
      const json = stringify(effects);
      if (typeof json !== 'string' || json.length > 160000) throw new Error('Script output exceeds size limit.');
      return json;
    })()`;
    const result = vm.evalCode(wrapped, 'widget-script.js');
    if (result.error) {
      const error = sandboxError(vm, formatter, result.error);
      throw new Error(scriptFailure(error, source, 'Script execution failed.'));
    }
    try {
      return effectsSchema.parse(readResult(vm, result.value, 160000));
    } finally {
      result.value.dispose();
    }
  } finally {
    formatter.dispose();
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
  const { runtime, vm, formatter } = sandbox(engine);
  try {
    const result = vm.evalCode(
      `(() => { "use strict"; const context = Object.freeze(JSON.parse(${JSON.stringify(JSON.stringify(context))}));
        const stringify = JSON.stringify, finite = Number.isFinite;
        const run = Function('context', ${JSON.stringify('"use strict";return (\n' + source + '\n);')});
        const value = run.call(globalThis, context);
        if (!(value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && finite(value))))
          throw new Error('Expressions must return text, a finite number, a boolean, or null.');
        const json = stringify(value);
        if (typeof json !== 'string' || json.length > 160000) throw new Error('Expression output exceeds size limit.');
        return json;
      })()`,
      'binding-expression.js',
    );
    if (result.error) {
      const error = sandboxError(vm, formatter, result.error);
      throw new Error(scriptFailure(error, source, 'Expression failed.'));
    }
    try {
      const value = readResult(vm, result.value, 160000);
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      )
        return value;
      throw new Error('Expressions must return text, a finite number, a boolean, or null.');
    } finally {
      result.value.dispose();
    }
  } finally {
    formatter.dispose();
    vm.dispose();
    runtime.dispose();
  }
}

const appearanceSchema = z
  .object({
    position: z
      .object({
        offsetX: z.number().finite().min(-4000).max(4000),
        offsetY: z.number().finite().min(-4000).max(4000),
      })
      .strict()
      .optional(),
    rotation: z
      .object({ offsetDegrees: z.number().finite().min(-360).max(360) })
      .strict()
      .optional(),
    text: z.string().max(300).optional(),
    color: z
      .string()
      .regex(/^#[a-f\d]{6}$/i)
      .optional(),
  })
  .strict();
export function validateAppearance(raw: unknown, outputs: readonly string[]) {
  const appearance = appearanceSchema.parse(raw);
  if (Object.keys(appearance).some((key) => !outputs.includes(key)))
    throw new Error('Behavior returned an output it does not own.');
  return appearance;
}

const inputValueSchema = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const behaviorContextSchema = z
  .object({
    value: inputValueSchema,
    quality: z.string().max(32),
    name: z.string().max(100),
    inputs: z
      .record(
        z.string().max(48),
        z
          .object({
            value: inputValueSchema,
            quality: z.enum(['good', 'stale', 'missing', 'disconnected', 'invalid']),
            timestamp: z.number().finite().nullable(),
            unit: z.string().max(24),
          })
          .strict(),
      )
      .refine((inputs) => Object.keys(inputs).length <= 32)
      .optional(),
  })
  .strict();

/** Versioned presentation API: no host effects; serialize within VM limits before dumping. */
export function evaluateBehavior(
  engine: QuickJSWASMModule,
  source: string,
  context: ScriptContext,
) {
  if (source.length > 20000) throw new Error('Script exceeds 20,000 characters.');
  const serialized = JSON.stringify(behaviorContextSchema.parse(context));
  if (serialized.length > 160000) throw new Error('Behavior inputs exceed size limit.');
  const { runtime, vm, formatter } = sandbox(engine);
  try {
    const wrapped = `(() => {
      'use strict';
      Object.defineProperty(globalThis, 'Date', { value: undefined, writable: false, configurable: false });
      Object.defineProperty(Math, 'random', { value: undefined, writable: false, configurable: false });
      Object.freeze(Math);
      const context = Object.freeze(JSON.parse(${JSON.stringify(serialized)}));
      const inputs = Object.freeze(context.inputs || {});
      Object.values(inputs).forEach(sample => Object.freeze(sample));
      const helpers = Object.freeze({ clamp: (value, min, max) => Math.max(min, Math.min(max, value)) });
      const stringify = JSON.stringify;
      const keys = Reflect.ownKeys, descriptor = Object.getOwnPropertyDescriptor;
      const prototype = Object.getPrototypeOf, plainPrototype = Object.prototype;
      const create = Object.create, finite = Number.isFinite;
      const plain = value => value && typeof value === 'object' && (prototype(value) === plainPrototype || prototype(value) === null);
      const numericObject = (value, fields) => {
        if (!plain(value) || keys(value).length !== fields.length) throw new Error('Invalid behavior geometry.');
        const copy = create(null);
        for (const key of keys(value)) {
          const property = descriptor(value, key);
          if (!fields.includes(key) || !property || !('value' in property) || !finite(property.value)) throw new Error('Invalid behavior geometry.');
          copy[key] = property.value;
        }
        return copy;
      };
      const run = Function('context', 'inputs', 'helpers', ${JSON.stringify('"use strict";\nreturn (() => {\n' + source + '\n})();')});
      const output = run.call(globalThis, context, inputs, helpers);
      if (!output || typeof output !== 'object' || (prototype(output) !== plainPrototype && prototype(output) !== null))
        throw new Error('Behavior must return a synchronous plain appearance object.');
      const clean = create(null);
      for (const key of keys(output)) {
        const property = descriptor(output, key);
        if (!property || !('value' in property)) throw new Error('Behavior returned an invalid appearance property.');
        if (key === 'position' || key === 'rotation') {
          clean[key] = numericObject(property.value, key === 'position' ? ['offsetX', 'offsetY'] : ['offsetDegrees']);
          continue;
        }
        if ((key !== 'text' && key !== 'color') || typeof property.value !== 'string' || property.value.length > (key === 'text' ? 300 : 7))
          throw new Error('Behavior returned an invalid appearance property.');
        clean[key] = property.value;
      }
      const json = stringify(clean);
      if (typeof json !== 'string' || json.length > 8192) throw new Error('Behavior output exceeds size limit.');
      return json;
    })()`;
    const result = vm.evalCode(wrapped, 'widget-behavior-v1.js');
    if (result.error) {
      const error = sandboxError(vm, formatter, result.error);
      throw new Error(scriptFailure(error, source, 'Behavior failed.'));
    }
    try {
      return appearanceSchema.parse(readResult(vm, result.value, 8192));
    } finally {
      result.value.dispose();
    }
  } finally {
    formatter.dispose();
    vm.dispose();
    runtime.dispose();
  }
}

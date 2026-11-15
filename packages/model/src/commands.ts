import { z } from 'zod';
import type { Widget } from './index';
import type { ControlValue } from './dashboard';
const valueSchema = z.union([z.string().max(100), z.number().finite(), z.boolean()]);
export const commandPolicySchema = z
  .object({
    previewOnly: z.boolean().optional(),
    mapping: z
      .object({
        parameter: z
          .string()
          .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
          .refine(
            (value) => !['__proto__', 'prototype', 'constructor'].includes(value),
            'Choose a normal parameter name.',
          ),
        valueType: z.enum(['number', 'boolean', 'string']),
        minimum: z.number().finite().nullable().default(null),
        maximum: z.number().finite().nullable().default(null),
        step: z.number().positive().nullable().default(null),
        allowedValues: z.array(valueSchema).max(50).default([]),
      })
      .refine(
        (mapping) =>
          mapping.minimum === null ||
          mapping.maximum === null ||
          mapping.minimum <= mapping.maximum,
        'Minimum must not exceed maximum.',
      )
      .refine(
        (mapping) => mapping.allowedValues.every((value) => typeof value === mapping.valueType),
        'Allowed values must match the command value type.',
      )
      .nullable()
      .default(null),
    replyCheck: z
      .object({
        field: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
        expectedValue: valueSchema,
      })
      .nullable()
      .default(null),
    timeoutMs: z.number().int().min(5000).max(60000).default(10000),
    authorities: z
      .array(z.enum(['TENANT_ADMIN', 'CUSTOMER_USER']))
      .max(2)
      .default([]),
    feedback: z
      .object({
        timeoutMs: z.number().int().min(1000).max(120000).default(15000),
        tolerance: z.number().finite().min(0).default(0),
        expectedValue: valueSchema.optional(),
      })
      .nullable()
      .default(null),
  })
  .refine(
    (policy) => !policy.feedback || !!policy.mapping || policy.feedback.expectedValue !== undefined,
    'Set an expected reported value for a static command.',
  );
export type CommandPolicy = z.infer<typeof commandPolicySchema>;
export type CommandAction = Extract<Widget['action'], { type: 'command' }>;
export function commandPolicy(action: CommandAction): CommandPolicy {
  return commandPolicySchema.parse(action.policy ?? {});
}
export function resolveCommandParams(
  action: CommandAction,
  widget: Widget,
  value: unknown,
  authority?: string,
) {
  const policy = commandPolicy(action);
  if (
    authority !== undefined &&
    policy.authorities.length &&
    !policy.authorities.some((role) => role === authority)
  )
    throw new Error('Your ThingsBoard authority is not permitted to run this command.');
  if (!widget.enabled || !widget.visible) throw new Error('This control is disabled or hidden.');
  for (const property of ['enabled', 'visible'] as const) {
    const binding = widget.propertyBindings[property];
    if (binding?.enabled && binding.type === 'constant' && binding.value === false)
      throw new Error('This control is disabled or hidden.');
  }
  const mapping = policy.mapping;
  if (!mapping) return structuredClone(action.params);
  if (typeof value !== mapping.valueType || (typeof value === 'number' && !Number.isFinite(value)))
    throw new Error(`Enter a valid ${mapping.valueType} command value.`);
  const candidate = value as ControlValue;
  const inStep = (number: number, step: number, base: number) =>
    Math.abs((number - base) / step - Math.round((number - base) / step)) < 1e-7;
  if (typeof candidate === 'number') {
    if (mapping.minimum !== null && candidate < mapping.minimum)
      throw new Error(`Value must be at least ${mapping.minimum}.`);
    if (mapping.maximum !== null && candidate > mapping.maximum)
      throw new Error(`Value must be at most ${mapping.maximum}.`);
    if (mapping.step !== null && !inStep(candidate, mapping.step, mapping.minimum ?? 0))
      throw new Error(`Value must follow ${mapping.step} increments.`);
  }
  if (mapping.allowedValues.length && !mapping.allowedValues.some((option) => option === candidate))
    throw new Error('Choose an allowed command value.');
  const config = widget.dashboard;
  if (
    config?.type === 'slider' &&
    (typeof candidate !== 'number' ||
      candidate < config.minimum ||
      candidate > config.maximum ||
      !inStep(candidate, config.step, config.minimum))
  )
    throw new Error('Value is outside the published slider range or step.');
  if (
    config &&
    ['dropdown', 'radio', 'segmented'].includes(config.type) &&
    'options' in config &&
    !config.options.some((option) => option.value === candidate)
  )
    throw new Error('Value is not a published control option.');
  if (widget.kind === 'toggle' && typeof candidate !== 'boolean')
    throw new Error('Toggle commands require a boolean value.');
  return { ...structuredClone(action.params), [mapping.parameter]: candidate };
}
export function commandExpectedValue(action: CommandAction, value: unknown): unknown {
  const policy = commandPolicy(action);
  return policy.mapping ? value : policy.feedback?.expectedValue;
}
export function commandReadbackMatches(
  expected: unknown,
  reported: unknown,
  tolerance: number,
): boolean {
  if (typeof expected === 'number')
    return (
      (typeof reported === 'number' || (typeof reported === 'string' && reported.trim() !== '')) &&
      Number.isFinite(Number(reported)) &&
      Math.abs(Number(reported) - expected) <= tolerance
    );
  if (typeof expected === 'boolean')
    return expected
      ? [true, 1, 'true', '1'].includes(reported as string | number | boolean)
      : [false, 0, 'false', '0'].includes(reported as string | number | boolean);
  return (
    typeof expected === 'string' &&
    ['string', 'number', 'boolean'].includes(typeof reported) &&
    String(reported) === expected
  );
}

export function commandReplyAccepted(action: CommandAction, reply: unknown): boolean {
  const check = commandPolicy(action).replyCheck;
  return (
    !check ||
    (!!reply &&
      typeof reply === 'object' &&
      Object.hasOwn(reply, check.field) &&
      (reply as Record<string, unknown>)[check.field] === check.expectedValue)
  );
}

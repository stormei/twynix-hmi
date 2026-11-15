import { z } from 'zod';

export const dashboardKinds = [
  'chart',
  'gauge',
  'markdown',
  'iframe',
  'html',
  'dropdown',
  'slider',
  'radio',
  'toggle',
  'segmented',
  'sparkline',
  'linear-gauge',
] as const;
export type DashboardKind = (typeof dashboardKinds)[number];
export const isDashboardKind = (kind: string): kind is DashboardKind =>
  (dashboardKinds as readonly string[]).includes(kind);

export function validEmbedUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
export type ControlValue = string | number | boolean;
export const controlKinds = ['dropdown', 'slider', 'radio', 'toggle', 'segmented'] as const;
export const isControlKind = (kind: string): kind is (typeof controlKinds)[number] =>
  (controlKinds as readonly string[]).includes(kind);
const optionSchema = z.object({
  label: z.string().min(1).max(100),
  value: z.union([z.string().max(100), z.number(), z.boolean()]),
});
const controlOptions = z
  .array(optionSchema)
  .min(1)
  .max(50)
  .refine(
    (options) => new Set(options.map((option) => String(option.value))).size === options.length,
    'Option values must be unique.',
  );
const defaultOptions = [
  { label: 'Manual', value: 0 },
  { label: 'Automatic', value: 1 },
  { label: 'Off', value: 2 },
];
export function parseControlOptions(text: string) {
  return controlOptions.parse(
    text
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator < 1) throw new Error('Use one value = Label per line.');
        const raw = line.slice(0, separator).trim();
        const value =
          raw === 'true'
            ? true
            : raw === 'false'
              ? false
              : Number.isFinite(Number(raw))
                ? Number(raw)
                : raw;
        return { value, label: line.slice(separator + 1).trim() };
      }),
  );
}
export const dashboardConfigSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('chart'),
      style: z.enum(['line', 'area', 'bar']).default('area'),
      minimum: z.number().default(0),
      maximum: z.number().default(100),
      autoScale: z.boolean().default(true),
      showGrid: z.boolean().default(true),
    }),
    z.object({
      type: z.literal('gauge'),
      minimum: z.number().default(0),
      maximum: z.number().default(100),
      warning: z.number().default(75),
      critical: z.number().default(90),
      unit: z.string().max(24).default('%'),
    }),
    z.object({ type: z.literal('dropdown'), options: controlOptions.default(defaultOptions) }),
    z.object({
      type: z.literal('radio'),
      options: controlOptions.default(defaultOptions),
      layout: z.enum(['horizontal', 'vertical']).default('horizontal'),
    }),
    z.object({ type: z.literal('segmented'), options: controlOptions.default(defaultOptions) }),
    z.object({
      type: z.literal('toggle'),
      onLabel: z.string().min(1).max(100).default('On'),
      offLabel: z.string().min(1).max(100).default('Off'),
    }),
    z.object({
      type: z.literal('slider'),
      minimum: z.number().default(0),
      maximum: z.number().default(100),
      step: z.number().positive().default(1),
      unit: z.string().max(24).default('%'),
    }),
    z.object({
      type: z.literal('sparkline'),
      showValue: z.boolean().default(true),
      fill: z.boolean().default(true),
    }),
    z.object({
      type: z.literal('linear-gauge'),
      minimum: z.number().default(0),
      maximum: z.number().default(100),
      warning: z.number().default(75),
      critical: z.number().default(90),
      unit: z.string().max(24).default('%'),
    }),
    z.object({
      type: z.literal('markdown'),
      content: z
        .string()
        .max(50000)
        .default(
          '## Operations overview\n\nAdd notes, instructions and links for your operators.\n\n- Monitor production\n- Review active alarms',
        ),
    }),
    z.object({
      type: z.literal('iframe'),
      url: z
        .string()
        .max(4000)
        .refine(validEmbedUrl, 'Use an HTTP or HTTPS URL without credentials.')
        .default(''),
    }),
    z.object({
      type: z.literal('html'),
      content: z
        .string()
        .max(100000)
        .default(
          '<main style="font:16px system-ui;padding:24px;color:#17364d"><h2>Custom panel</h2><p>Your HTML content appears here.</p></main>',
        ),
    }),
  ])
  .superRefine((config, ctx) => {
    if (
      ['chart', 'gauge', 'slider', 'linear-gauge'].includes(config.type) &&
      'minimum' in config &&
      config.minimum >= config.maximum
    )
      ctx.addIssue({ code: 'custom', message: 'Maximum must be greater than minimum.' });
    if (
      (config.type === 'gauge' || config.type === 'linear-gauge') &&
      (config.warning < config.minimum ||
        config.critical < config.warning ||
        config.critical > config.maximum)
    )
      ctx.addIssue({ code: 'custom', message: 'Use minimum ≤ warning ≤ critical ≤ maximum.' });
  });
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
export const defaultDashboardConfig = (kind: DashboardKind): DashboardConfig =>
  dashboardConfigSchema.parse({ type: kind });

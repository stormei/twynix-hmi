import { z } from 'zod';
export const entityPageSchema = z.object({
  data: z
    .array(
      z.object({
        entityId: z.object({ id: z.uuid(), entityType: z.enum(['DEVICE', 'ASSET']).optional() }),
        latest: z.object({
          ENTITY_FIELD: z.object({ name: z.object({ value: z.string().max(1000) }) }),
        }),
      }),
    )
    .max(50),
  hasNext: z.boolean().optional().default(false),
});
export const sourceKeySchema = z.object({
  key: z.string().min(1).max(128),
  value: z.unknown().optional(),
  timestamp: z.number().finite().nonnegative().nullable(),
});
export const sourceCatalogSchema = z.object({
  telemetry: z.array(sourceKeySchema).max(2000),
  attributes: z.array(sourceKeySchema).max(2000),
});
export type SourceCatalog = z.infer<typeof sourceCatalogSchema>;
export type SourceKey = z.infer<typeof sourceKeySchema>;

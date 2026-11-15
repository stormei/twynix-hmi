import { BadGatewayException, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { entityPageSchema, sourceCatalogSchema } from '../../../../packages/model/src';
import { SessionService } from '../auth/session.service';
@Controller('api')
export class EntitiesController {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}
  @Get('entities') async entities(@Req() req: Request) {
    const session = this.sessions.fromRequest(req);
    const text = z
      .string()
      .max(100)
      .parse(req.query['search'] ?? '');
    const entityType = z.enum(['DEVICE', 'ASSET']).parse(req.query['type'] ?? 'DEVICE');
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(req.query['page'] ?? 0);
    const result = await this.sessions.request(session, '/api/entitiesQuery/find', 'POST', {
      entityFilter: { type: 'entityType', entityType },
      entityFields: [
        { type: 'ENTITY_FIELD', key: 'name' },
        { type: 'ENTITY_FIELD', key: 'label' },
      ],
      pageLink: {
        pageSize: 50,
        page,
        textSearch: text,
        sortOrder: { key: { type: 'ENTITY_FIELD', key: 'name' }, direction: 'ASC' },
      },
    });
    const parsed = entityPageSchema.safeParse(result);
    if (!parsed.success) throw new BadGatewayException('ThingsBoard returned invalid entity data.');
    return parsed.data;
  }
  @Get('entities/:type/:id/keys') keys(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const entityType = z.enum(['DEVICE', 'ASSET']).parse(type);
    return this.sessions.request(
      this.sessions.fromRequest(req),
      `/api/plugins/telemetry/${entityType}/${z.uuid().parse(id)}/keys/timeseries`,
    );
  }
  @Get('entities/:type/:id/catalog') async catalog(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const entityType = z.enum(['DEVICE', 'ASSET']).parse(type),
      entityId = z.uuid().parse(id);
    const session = this.sessions.fromRequest(req);
    const root = `/api/plugins/telemetry/${entityType}/${entityId}`;
    const results = await Promise.all([
      this.sessions.request(session, `${root}/keys/timeseries`),
      this.sessions.request(session, `${root}/values/timeseries`),
      this.sessions.request(session, `${root}/values/attributes`),
    ]);
    const keys = z.array(z.string().min(1).max(128)).max(2000).safeParse(results[0]);
    const telemetry = z
      .record(
        z.string(),
        z.array(z.object({ ts: z.number().finite().nonnegative(), value: z.unknown() })),
      )
      .safeParse(results[1]);
    const attributes = z
      .array(
        z.object({
          key: z.string().min(1).max(128),
          value: z.unknown(),
          lastUpdateTs: z.number().finite().nonnegative(),
        }),
      )
      .max(2000)
      .safeParse(results[2]);
    if (!keys.success || !telemetry.success || !attributes.success)
      throw new BadGatewayException('ThingsBoard returned invalid source data.');
    return sourceCatalogSchema.parse({
      telemetry: keys.data.map((key) => ({
        key,
        value: telemetry.data[key]?.[0]?.value,
        timestamp: telemetry.data[key]?.[0]?.ts ?? null,
      })),
      attributes: attributes.data.map((attribute) => ({
        key: attribute.key,
        value: attribute.value,
        timestamp: attribute.lastUpdateTs,
      })),
    });
  }
  @Post('alarms/:id/ack') acknowledge(@Param('id') id: string, @Req() req: Request) {
    return this.sessions.request(
      this.sessions.fromRequest(req),
      `/api/alarm/${z.uuid().parse(id)}/ack`,
      'POST',
      {},
    );
  }
}

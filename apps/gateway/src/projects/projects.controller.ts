import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  projectSchema,
  commandPolicy,
  resolveCommandParams,
  commandReplyAccepted,
} from '../../../../packages/model/src';
import { SessionService, Session } from '../auth/session.service';
import { ProjectRepository } from './project.repository';
import { config } from '../config';
const owner = (session: Session) => `${session.user.tenantId.id}:${session.user.id.id}`;
@Controller('api/projects')
export class ProjectsController {
  private readonly commandRequests = new Map<
    string,
    { expires: number; fingerprint: string; result: Promise<unknown> }
  >();
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ProjectRepository) private readonly projects: ProjectRepository,
  ) {}
  @Get() list(@Req() req: Request) {
    return this.projects.list(owner(this.sessions.fromRequest(req)));
  }
  @Get(':id') get(@Param('id') id: string, @Req() req: Request) {
    return this.projects.get(z.uuid().parse(id), owner(this.sessions.fromRequest(req)));
  }
  @Put(':id') async save(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const session = this.sessions.fromRequest(req);
    const draft = projectSchema.parse(body);
    if (draft.id !== z.uuid().parse(id)) throw new ForbiddenException('Project ID does not match.');
    const result = await this.projects.mutate(id, owner(session), draft.revision, (existing) => ({
      owner: owner(session),
      draft: { ...draft, revision: draft.revision + 1 },
      releases: existing?.releases ?? [],
      audit: [
        ...(existing?.audit ?? []),
        { at: new Date().toISOString(), action: 'save', userId: session.user.id.id },
      ],
    }));
    return result.draft;
  }
  @Post(':id/releases') async publish(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const session = this.sessions.fromRequest(req);
    const { revision } = z.object({ revision: z.number().int().min(1) }).parse(body);
    const result = await this.projects.mutate(
      z.uuid().parse(id),
      owner(session),
      revision,
      (existing) => {
        if (!existing) throw new NotFoundException();
        return {
          ...existing,
          releases: [
            ...existing.releases,
            {
              id: randomUUID(),
              publishedAt: new Date().toISOString(),
              project: structuredClone(existing.draft),
            },
          ],
          audit: [
            ...existing.audit,
            { at: new Date().toISOString(), action: 'publish', userId: session.user.id.id },
          ],
        };
      },
    );
    return result.releases.at(-1);
  }
  @Post(':id/releases/:releaseId/commands') async command(
    @Param('id') id: string,
    @Param('releaseId') releaseId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const session = this.sessions.fromRequest(req);
    if (!config.commandsEnabled)
      throw new ForbiddenException('Device commands are disabled on this gateway.');
    const input = z
      .object({
        widgetId: z.string().max(80),
        event: z.enum(['activate', 'doubleClick']).default('activate'),
        screenId: z.string().max(80),
        requestId: z.uuid(),
        value: z.union([z.string().max(100), z.number().finite(), z.boolean()]).optional(),
      })
      .parse(body);
    const stored = await this.projects.get(z.uuid().parse(id), owner(session));
    const release = stored.releases.find((r) => r.id === z.uuid().parse(releaseId));
    const widget = release?.project.screens
      .find((s) => s.id === input.screenId)
      ?.widgets.find((w) => w.id === input.widgetId);
    const selectedAction =
      input.event === 'doubleClick' ? widget?.doubleClickAction : widget?.action;
    if (!widget || selectedAction?.type !== 'command')
      throw new ForbiddenException('No published command is configured here.');
    const policy = commandPolicy(selectedAction);
    if (policy.previewOnly)
      throw new ForbiddenException(
        'This example is Preview-only. No equipment command is permitted.',
      );
    if (
      policy.authorities.length &&
      !policy.authorities.some((authority) => authority === session.user.authority)
    )
      throw new ForbiddenException(
        'Your ThingsBoard authority is not permitted to run this command.',
      );
    let params: ReturnType<typeof resolveCommandParams>;
    try {
      params = resolveCommandParams(selectedAction, widget, input.value, session.user.authority);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid command value.',
      );
    }
    const fingerprint = JSON.stringify(params);
    const key = `${owner(session)}:${id}:${releaseId}:${input.screenId}:${input.widgetId}:${input.event}:${input.requestId}`;
    for (const [requestKey, record] of this.commandRequests)
      if (record.expires < Date.now()) this.commandRequests.delete(requestKey);
    const existing = this.commandRequests.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new ConflictException(
          'This request ID was already used for a different command value.',
        );
      return existing.result;
    }
    const action = selectedAction;
    const result = (async () => {
      await this.projects.mutate(id, owner(session), stored.draft.revision, (current) => {
        if (!current) throw new NotFoundException();
        return {
          ...current,
          audit: [
            ...current.audit,
            {
              at: new Date().toISOString(),
              action: `command-request:${releaseId}:${widget.id}:${input.requestId}`,
              userId: session.user.id.id,
            },
          ],
        };
      });
      // Only the server's immutable published configuration supplies device, method, and parameters.
      const reply = await this.sessions.request(
        session,
        `/api/rpc/twoway/${action.deviceId}`,
        'POST',
        { method: action.method, params, timeout: policy.timeoutMs },
        policy.timeoutMs + 5000,
      );
      return {
        state: commandReplyAccepted(action, reply) ? 'accepted' : 'rejected',
        reply,
        message: commandReplyAccepted(action, reply)
          ? 'Device replied. Verify operation using equipment telemetry.'
          : 'Device reply did not satisfy the published success condition.',
      };
    })();
    this.commandRequests.set(key, { expires: Date.now() + 24 * 3600000, fingerprint, result });
    return result;
  }
}

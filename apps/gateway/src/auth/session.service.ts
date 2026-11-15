import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { Subject } from 'rxjs';
import type { User } from '../../../../packages/model/src';
import { ThingsBoardClient, Tokens } from '../thingsboard/thingsboard.client';

export interface Session {
  id: string;
  csrf: string;
  user: User;
  tokens: Tokens;
  expiresAt: number;
  refresh?: Promise<void>;
}
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;
export function cookieSessionId(header: string | undefined): string | undefined {
  return header
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('twynix_session='))
    ?.slice('twynix_session='.length);
}
@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, Session>();
  readonly revoked = new Subject<string>();
  constructor(@Inject(ThingsBoardClient) private readonly tb: ThingsBoardClient) {}
  async login(username: string, password: string): Promise<Session> {
    const tokens = await this.tb.login(username, password);
    const user = await this.tb.request<User>('/api/auth/user', tokens.token);
    if (!user.id?.id || !user.tenantId?.id)
      throw new UnauthorizedException('Invalid ThingsBoard user.');
    this.prune();
    const session: Session = {
      id: randomBytes(32).toString('hex'),
      csrf: randomBytes(32).toString('hex'),
      user,
      tokens,
      expiresAt: Date.now() + SESSION_LIFETIME,
    };
    this.sessions.set(session.id, session);
    return session;
  }
  fromRequest(req: Request): Session {
    return this.get(cookieSessionId(req.headers.cookie));
  }
  get(id?: string): Session {
    const session = id ? this.sessions.get(id) : undefined;
    if (!session || session.expiresAt <= Date.now()) {
      if (session) this.logout(session.id);
      throw new UnauthorizedException('Sign in with your ThingsBoard account.');
    }
    return session;
  }
  logout(id: string) {
    this.sessions.delete(id);
    this.revoked.next(id);
  }
  private prune() {
    for (const session of this.sessions.values())
      if (session.expiresAt <= Date.now()) this.logout(session.id);
  }
  async accessToken(session: Session): Promise<string> {
    this.get(session.id);
    const payload = JSON.parse(
      Buffer.from(session.tokens.token.split('.')[1] ?? '', 'base64url').toString(),
    ) as { exp: number };
    if (payload.exp * 1000 - Date.now() < 60000) {
      session.refresh ??= this.tb
        .refresh(session.tokens.refreshToken)
        .then((tokens) => {
          session.tokens = tokens;
        })
        .catch((error) => {
          this.logout(session.id);
          throw error;
        })
        .finally(() => {
          session.refresh = undefined;
        });
      await session.refresh;
    }
    return session.tokens.token;
  }
  async request<T>(
    session: Session,
    path: string,
    method = 'GET',
    body?: unknown,
    timeoutMs?: number,
  ): Promise<T> {
    return this.tb.request<T>(path, await this.accessToken(session), method, body, timeoutMs);
  }
}

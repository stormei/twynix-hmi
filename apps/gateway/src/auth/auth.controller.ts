import { Body, Controller, Get, Inject, Post, Req, Res, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { SessionService } from './session.service';
import { config } from '../config';
const credentials = z.object({
  username: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});
@Controller('api/auth')
export class AuthController {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}
  @Post('login')
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    for (const [ip, attempt] of this.attempts) if (attempt.until < now) this.attempts.delete(ip);
    const attempt = this.attempts.get(key) ?? { count: 0, until: now + 60000 };
    if (++attempt.count > 10)
      throw new HttpException('Too many login attempts. Try again in one minute.', 429);
    this.attempts.set(key, attempt);
    const input = credentials.parse(body);
    const session = await this.sessions.login(input.username, input.password);
    try {
      this.sessions.logout(this.sessions.fromRequest(req).id);
    } catch {
      /* No existing session. */
    }
    res.cookie('twynix_session', session.id, {
      httpOnly: true,
      secure: config.secureCookie,
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 3600000,
    });
    return { user: session.user, csrf: session.csrf, commandsEnabled: config.commandsEnabled };
  }
  @Get('session') session(@Req() req: Request) {
    const session = this.sessions.fromRequest(req);
    return { user: session.user, csrf: session.csrf, commandsEnabled: config.commandsEnabled };
  }
  @Post('logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.sessions.logout(this.sessions.fromRequest(req).id);
    res.clearCookie('twynix_session', { path: '/' });
    return { ok: true };
  }
}

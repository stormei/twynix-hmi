import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { config } from '../config';

export interface Tokens {
  token: string;
  refreshToken: string;
}
@Injectable()
export class ThingsBoardClient {
  async request<T>(
    path: string,
    token?: string,
    method = 'GET',
    body?: unknown,
    timeoutMs = 15000,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${config.thingsboardUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Authorization': `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError')
        throw new GatewayTimeoutException(
          'ThingsBoard did not reply in time. The command outcome is unknown.',
        );
      throw new BadGatewayException(
        'ThingsBoard is unreachable. Check the server address and network connection.',
      );
    }
    if (response.status === 401)
      throw new UnauthorizedException('ThingsBoard session expired or credentials were rejected.');
    if (response.status === 504)
      throw new GatewayTimeoutException(
        'ThingsBoard did not reply in time. The command outcome is unknown.',
      );
    if (!response.ok)
      throw new HttpException(
        response.status === 403
          ? 'ThingsBoard denied this operation.'
          : 'ThingsBoard could not complete the request.',
        response.status === 403 ? 403 : 502,
      );
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  login(username: string, password: string) {
    return this.request<Tokens>('/api/auth/login', undefined, 'POST', { username, password });
  }
  refresh(refreshToken: string) {
    return this.request<Tokens>('/api/auth/token', undefined, 'POST', { refreshToken });
  }
}

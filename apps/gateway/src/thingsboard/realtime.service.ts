import { Inject, Injectable } from '@nestjs/common';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { SessionService, cookieSessionId } from '../auth/session.service';
import { config } from '../config';
import {
  normalizeAlarms,
  normalizeTelemetry,
  subscriptionCommands,
  subscriptionSchema,
} from './realtime.protocol';
@Injectable()
export class RealtimeService {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}
  attach(server: Server) {
    const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 65536 });
    server.on('upgrade', (request, socket, head) => {
      if (request.url !== '/api/realtime' || request.headers.origin !== config.origin) {
        socket.destroy();
        return;
      }
      try {
        const session = this.sessions.get(cookieSessionId(request.headers.cookie));
        websocketServer.handleUpgrade(request, socket, head, (browser) =>
          this.connect(browser, session.id),
        );
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
      }
    });
    server.on('close', () => {
      for (const client of websocketServer.clients) client.terminate();
      websocketServer.close();
    });
  }
  private connect(browser: WebSocket, sessionId: string) {
    let upstream: WebSocket | undefined;
    let retry: NodeJS.Timeout | undefined;
    let stopped = false;
    let generation = 0;
    let retries = 0;
    let subscription = subscriptionSchema.parse({ type: 'subscribe', bindings: [], alarms: true });
    let lastMessageAt = 0;
    const send = (message: unknown) => {
      if (browser.readyState === WebSocket.OPEN) {
        if (browser.bufferedAmount > 1024 * 1024) {
          browser.close(1013, 'Client cannot keep up');
          return;
        }
        browser.send(JSON.stringify(message));
      }
    };
    const open = async () => {
      const current = ++generation;
      clearTimeout(retry);
      upstream?.removeAllListeners();
      upstream?.terminate();
      send({ type: 'connection', state: 'connecting' });
      try {
        const session = this.sessions.get(sessionId);
        const token = await this.sessions.accessToken(session);
        if (stopped || current !== generation) return;
        const url = new URL('/api/ws', config.thingsboardUrl);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        upstream = new WebSocket(url, { handshakeTimeout: 10000, maxPayload: 4 * 1024 * 1024 });
        const ws = upstream;
        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              authCmd: { cmdId: 0, token },
              cmds: subscriptionCommands(subscription.bindings, subscription.alarms),
            }),
          );
        });
        ws.on('message', (raw) => {
          try {
            const message = JSON.parse(raw.toString());
            if (message.errorCode) {
              send({
                type: 'error',
                message:
                  'ThingsBoard rejected a subscription. Check entity permissions and bindings.',
              });
              ws.close();
              return;
            }
            retries = 0;
            send({ type: 'connection', state: 'connected' });
            if (message.cmdId === 1000) send({ type: 'alarms', ...normalizeAlarms(message) });
            else send({ type: 'telemetry', values: normalizeTelemetry(message) });
          } catch {
            send({ type: 'error', message: 'Unexpected ThingsBoard realtime response.' });
          }
        });
        ws.on('error', () => {
          send({ type: 'connection', state: 'disconnected' });
          ws.close();
        });
        ws.on('close', () => {
          if (stopped || current !== generation) return;
          send({ type: 'connection', state: 'disconnected' });
          retry = setTimeout(
            () => void open(),
            Math.min(30000, 1000 * 2 ** retries++) + Math.random() * 500,
          );
        });
      } catch {
        if (stopped) return;
        send({ type: 'session-expired' });
        browser.close(4401, 'Session expired');
      }
    };
    browser.on('message', (raw) => {
      try {
        if (Date.now() - lastMessageAt < 200) return;
        lastMessageAt = Date.now();
        subscription = subscriptionSchema.parse(JSON.parse(raw.toString()));
        void open();
      } catch {
        send({ type: 'error', message: 'Invalid subscription request.' });
      }
    });
    const revoked = this.sessions.revoked.subscribe((id) => {
      if (id === sessionId) browser.close(4401, 'Signed out');
    });
    const heartbeat = setInterval(async () => {
      try {
        const session = this.sessions.get(sessionId);
        const token = await this.sessions.accessToken(session);
        if (upstream?.readyState === WebSocket.OPEN) {
          upstream.ping();
          upstream.send(JSON.stringify({ authCmd: { cmdId: 0, token } }));
        }
        browser.ping();
      } catch {
        browser.close(4401, 'Session expired');
      }
    }, 25000);
    browser.on('close', () => {
      stopped = true;
      generation++;
      clearTimeout(retry);
      clearInterval(heartbeat);
      revoked.unsubscribe();
      upstream?.terminate();
    });
  }
}

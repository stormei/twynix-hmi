import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Alarm, Binding, bindingKey, TagValue } from '@twynix/model';
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  readonly state = signal<'simulation' | 'connecting' | 'connected' | 'disconnected'>('simulation');
  readonly values = signal<Record<string, TagValue>>({});
  readonly alarms = signal<Alarm[]>([]);
  readonly error = signal('');
  readonly expired = signal(false);
  private socket?: WebSocket;
  private bindings: Binding[] = [];
  private retry?: ReturnType<typeof setTimeout>;
  private enabled = false;
  private retries = 0;
  private includeAlarms = true;
  constructor() {
    const freshnessTimer = setInterval(() => {
      if (!this.enabled) return;
      this.values.update((values) => {
        const next = { ...values };
        for (const binding of this.bindings) {
          const key = bindingKey(binding),
            value = next[key];
          if (
            value &&
            (this.state() !== 'connected' || Date.now() - value.timestamp > binding.staleAfterMs)
          )
            next[key] = { ...value, quality: 'stale' };
        }
        return next;
      });
    }, 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(freshnessTimer);
      this.disconnect();
    });
  }
  connect(bindings: Binding[], alarms = true) {
    this.disconnect();
    this.bindings = [...new Map(bindings.map((b) => [bindingKey(b), b])).values()];
    this.includeAlarms = alarms;
    this.enabled = true;
    this.expired.set(false);
    this.retries = 0;
    this.open();
  }
  private open() {
    if (!this.enabled) return;
    this.state.set('connecting');
    this.error.set('');
    const socket = (this.socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/realtime`,
    ));
    socket.onopen = () => {
      if (socket === this.socket && this.enabled)
        socket.send(
          JSON.stringify({
            type: 'subscribe',
            bindings: this.bindings,
            alarms: this.includeAlarms,
          }),
        );
    };
    socket.onmessage = ({ data }) => {
      if (socket !== this.socket || !this.enabled) return;
      try {
        const message = JSON.parse(data);
        if (message.type === 'connection') {
          this.state.set(message.state);
          if (message.state === 'connected') this.retries = 0;
        }
        if (message.type === 'telemetry')
          this.values.update((values) => {
            const next = { ...values };
            for (const [key, incoming] of Object.entries(
              message.values as Record<string, TagValue>,
            )) {
              if (!next[key] || incoming.timestamp >= next[key].timestamp) next[key] = incoming;
            }
            return next;
          });
        if (message.type === 'alarms')
          this.alarms.update((alarms) => {
            const map = new Map<string, Alarm>(
              (message.snapshot ? [] : alarms).map((a: Alarm) => [a.id, a]),
            );
            for (const alarm of message.alarms)
              map.set(alarm.id, { ...map.get(alarm.id), ...alarm });
            for (const id of message.removed) map.delete(id);
            return [...map.values()].sort((a, b) => b.createdTime - a.createdTime);
          });
        if (message.type === 'error') this.error.set(message.message);
        if (message.type === 'session-expired') this.expired.set(true);
      } catch {
        this.error.set('Invalid realtime response.');
      }
    };
    socket.onclose = (event) => {
      if (socket !== this.socket || !this.enabled) return;
      this.state.set('disconnected');
      this.values.update((values) =>
        Object.fromEntries(
          Object.entries(values).map(([key, value]) => [key, { ...value, quality: 'stale' }]),
        ),
      );
      if (event.code === 4401) {
        this.expired.set(true);
        this.enabled = false;
        return;
      }
      this.retry = setTimeout(
        () => this.open(),
        Math.min(30000, 1000 * 2 ** this.retries++) + Math.random() * 500,
      );
    };
    socket.onerror = () => {
      if (socket === this.socket && this.enabled)
        this.error.set('Realtime connection interrupted.');
    };
  }
  disconnect(clear = true) {
    this.enabled = false;
    clearTimeout(this.retry);
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.state.set(clear ? 'simulation' : 'disconnected');
    if (clear) {
      this.values.set({});
      this.alarms.set([]);
    } else
      this.values.update((values) =>
        Object.fromEntries(
          Object.entries(values).map(([key, value]) => [key, { ...value, quality: 'stale' }]),
        ),
      );
    this.error.set('');
  }
}

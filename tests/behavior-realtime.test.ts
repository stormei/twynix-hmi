import '@angular/compiler';
import { Injector } from '@angular/core';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeService } from '../apps/editor/src/app/realtime.service';
import { bindingKey } from '../packages/model/src';

class FixtureSocket {
  static instances: FixtureSocket[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  sent: string[] = [];
  closed = false;
  constructor() {
    FixtureSocket.instances.push(this);
  }
  send(value: string) {
    this.sent.push(value);
  }
  close() {
    this.closed = true;
    this.onclose?.({ code: 1000 });
  }
  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

test('temporary realtime subscriptions ignore replaced sockets and close on provider destruction', () => {
  const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'WebSocket', {
    value: FixtureSocket,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'location', {
    value: { protocol: 'http:', host: '127.0.0.1:0' },
    configurable: true,
    writable: true,
  });
  const injector = Injector.create({ providers: [RealtimeService] });
  let destroyed = false;
  try {
    const service = injector.get(RealtimeService);
    const pressure = {
      entityId: '10000000-0000-4000-8000-000000000001',
      entityType: 'DEVICE' as const,
      key: 'pressure',
      unit: 'bar',
      staleAfterMs: 30000,
    };
    const temperature = { ...pressure, key: 'temperature', unit: '°C' };
    service.connect([pressure]);
    const old = FixtureSocket.instances.at(-1)!;
    old.onopen?.();
    assert.equal(JSON.parse(old.sent[0]).alarms, true);
    service.connect([temperature], false);
    const current = FixtureSocket.instances.at(-1)!;
    assert.equal(old.closed, true);
    old.emit({
      type: 'telemetry',
      values: { [bindingKey(pressure)]: { value: 999, timestamp: Date.now(), quality: 'good' } },
    });
    old.onopen?.();
    old.onerror?.();
    assert.deepEqual(service.values(), {});
    assert.equal(old.sent.length, 1);
    assert.equal(service.error(), '');
    current.onopen?.();
    assert.equal(JSON.parse(current.sent[0]).alarms, false);
    current.emit({ type: 'connection', state: 'connected' });
    current.emit({
      type: 'telemetry',
      values: { [bindingKey(temperature)]: { value: 20, timestamp: Date.now(), quality: 'good' } },
    });
    assert.equal(service.values()[bindingKey(temperature)].value, 20);
    injector.destroy();
    destroyed = true;
    assert.equal(current.closed, true);
    current.emit({
      type: 'telemetry',
      values: {
        [bindingKey(temperature)]: { value: 888, timestamp: Date.now() + 1, quality: 'good' },
      },
    });
    assert.deepEqual(service.values(), {});
  } finally {
    if (!destroyed) injector.destroy();
    if (socketDescriptor) Object.defineProperty(globalThis, 'WebSocket', socketDescriptor);
    else Reflect.deleteProperty(globalThis, 'WebSocket');
    if (locationDescriptor) Object.defineProperty(globalThis, 'location', locationDescriptor);
    else Reflect.deleteProperty(globalThis, 'location');
  }
});

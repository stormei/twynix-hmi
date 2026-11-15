import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import {
  newWidget,
  createStarterProject,
  actionSchema,
  commandPolicy,
  resolveCommandParams,
  commandReadbackMatches,
  commandReplyAccepted,
  type CommandAction,
} from '../packages/model/src';
import { CommandRuntimeService } from '../apps/editor/src/app/command-runtime.service';
import { ApiService, ApiError } from '../apps/editor/src/app/api.service';
import { RealtimeService } from '../apps/editor/src/app/realtime.service';
function setup() {
  const widget = { ...newWidget('slider', 0), id: 'command-slider' };
  const action = actionSchema.parse({
    type: 'command',
    deviceId: crypto.randomUUID(),
    method: 'setSpeed',
    params: { channel: 2 },
    confirmation: 'Apply speed?',
    policy: {
      mapping: { parameter: 'speed', valueType: 'number', minimum: 10, maximum: 80, step: 5 },
      feedback: { timeoutMs: 1000, tolerance: 0.1 },
      authorities: ['TENANT_ADMIN'],
    },
  }) as CommandAction;
  widget.action = action;
  return { widget, action };
}
function runtime() {
  const calls: unknown[][] = [];
  let failure: Error | undefined;
  const api = {
    user: signal({
      id: { id: crypto.randomUUID() },
      tenantId: { id: crypto.randomUUID() },
      authority: 'TENANT_ADMIN',
      email: 'fixture@test',
    }),
    commandsEnabled: signal(true),
    request: async (...args: unknown[]) => {
      calls.push(args);
      if (failure) throw failure;
      return { state: 'accepted' };
    },
  };
  const injector = Injector.create({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: RealtimeService, useValue: { state: signal('connected') } },
    ],
  });
  const commands = runInInjectionContext(injector, () => new CommandRuntimeService());
  return {
    commands,
    calls,
    api,
    fail(error: Error) {
      failure = error;
    },
    destroy() {
      commands.reset();
      injector.destroy();
    },
  };
}
const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Command state did not settle.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
test('command mapping keeps published static parameters and validates typed limits, steps and permissions', () => {
  const { widget, action } = setup();
  assert.deepEqual(resolveCommandParams(action, widget, 35, 'TENANT_ADMIN'), {
    channel: 2,
    speed: 35,
  });
  for (const value of [undefined, '35', true, NaN, 5, 85, 32])
    assert.throws(() => resolveCommandParams(action, widget, value, 'TENANT_ADMIN'));
  assert.throws(() => resolveCommandParams(action, widget, 35, 'CUSTOMER_USER'));
  assert.throws(() =>
    resolveCommandParams(action, { ...widget, enabled: false }, 35, 'TENANT_ADMIN'),
  );
  assert.equal(
    actionSchema.safeParse({
      ...action,
      policy: { mapping: { parameter: 'constructor', valueType: 'number' } },
    }).success,
    false,
  );
  const options = newWidget('dropdown', 0);
  assert.throws(() =>
    resolveCommandParams(
      {
        ...action,
        policy: {
          ...commandPolicy(action),
          mapping: { ...commandPolicy(action).mapping!, minimum: null, maximum: null, step: null },
        },
      },
      options,
      99,
      'TENANT_ADMIN',
    ),
  );
});
test('boolean and text-choice mappings retain their declared types and readback matching is conservative', () => {
  const toggle = newWidget('toggle', 0);
  const { action } = setup();
  const booleanAction = {
    ...action,
    policy: {
      ...commandPolicy(action),
      mapping: {
        parameter: 'enabled',
        valueType: 'boolean' as const,
        minimum: null,
        maximum: null,
        step: null,
        allowedValues: [],
      },
    },
  };
  assert.equal(resolveCommandParams(booleanAction, toggle, true, 'TENANT_ADMIN').enabled, true);
  assert.throws(() => resolveCommandParams(booleanAction, toggle, 1, 'TENANT_ADMIN'));
  assert.equal(commandReadbackMatches(true, 'true', 0), true);
  assert.equal(commandReadbackMatches(false, 'unknown', 0), false);
  assert.equal(commandReadbackMatches(40, '40.05', 0.1), true);
  assert.equal(commandReadbackMatches(0, '', 0), false);
  assert.equal(
    commandReplyAccepted(
      {
        ...action,
        policy: { ...commandPolicy(action), replyCheck: { field: 'success', expectedValue: true } },
      },
      { success: false },
    ),
    false,
  );
});
test('runtime separates reply acceptance from fresh good-quality reported confirmation', async () => {
  const { commands, calls, destroy } = runtime();
  try {
    const { widget } = setup();
    const context = {
      widget,
      event: 'activate' as const,
      screenId: 'screen',
      mode: 'runtime' as const,
      release: {
        id: crypto.randomUUID(),
        publishedAt: new Date().toISOString(),
        project: createStarterProject(),
      },
    };
    assert.equal(commands.prepare(context, 35), true);
    assert.equal(commands.current()!.phase, 'confirming');
    assert.equal(calls.length, 0);
    const baseline = Date.now() + 10000;
    commands.observe(35, 'good', baseline);
    await commands.confirm();
    assert.equal(commands.current()!.phase, 'accepted');
    assert.equal(calls.length, 1);
    const sent = commands.current()!.sentAt;
    commands.observe(35, 'good', sent - 1);
    assert.equal(commands.current()!.phase, 'accepted');
    commands.observe(35, 'stale', baseline + 1);
    assert.equal(commands.current()!.phase, 'accepted');
    commands.observe(34, 'good', baseline + 2);
    assert.equal(commands.current()!.phase, 'accepted');
    commands.observe(35, 'good', baseline + 3);
    assert.equal(commands.current()!.phase, 'confirmed');
    const body = calls[0][2] as Record<string, unknown>;
    assert.equal(body.value, 35);
    assert.equal('params' in body, false);
    assert.equal('deviceId' in body, false);
  } finally {
    destroy();
  }
});
test('Preview validates, confirms, simulates failures and never calls the gateway', async () => {
  const { commands, calls, destroy } = runtime();
  try {
    const { widget } = setup();
    const context = {
      widget,
      event: 'activate' as const,
      screenId: 'screen',
      mode: 'preview' as const,
    };
    assert.equal(commands.prepare(context, 95), false);
    assert.equal(commands.current()!.phase, 'invalid');
    assert.equal(commands.prepare({ ...context, authority: 'CUSTOMER_USER' }, 35), false);
    assert.equal(commands.current()!.phase, 'denied');
    commands.prepare(context, 35);
    commands.cancel();
    assert.equal(commands.current()!.phase, 'cancelled');
    for (const result of ['confirmed', 'failed', 'timeout'] as const) {
      commands.simulationResult = result;
      commands.prepare(context, 35);
      await commands.confirm();
      await waitFor(() => commands.current()?.phase === result);
    }
    assert.equal(calls.length, 0);
  } finally {
    destroy();
  }
});
test('runtime timeouts are explicit, not retried, and late context results are discarded', async () => {
  const { commands, calls, fail, destroy } = runtime();
  try {
    const { widget } = setup();
    fail(new ApiError('No reply', 504));
    commands.prepare(
      {
        widget,
        event: 'activate',
        screenId: 'screen',
        mode: 'runtime',
        release: {
          id: crypto.randomUUID(),
          publishedAt: new Date().toISOString(),
          project: createStarterProject(),
        },
      },
      35,
    );
    await commands.confirm();
    assert.equal(commands.current()!.phase, 'timeout');
    assert.equal(calls.length, 1);
    assert.match(commands.current()!.message, /not.*retried|Nothing was retried/);
    commands.reset();
    assert.equal(commands.current(), null);
  } finally {
    destroy();
  }
});

test('confirmation repeats authority checks before dispatch', async () => {
  const { commands, api, calls, destroy } = runtime();
  try {
    const { widget } = setup();
    commands.prepare(
      {
        widget,
        event: 'activate',
        screenId: 'screen',
        mode: 'runtime',
        release: { id: crypto.randomUUID(), publishedAt: '', project: createStarterProject() },
      },
      35,
    );
    api.user.update((user) => ({ ...user, authority: 'CUSTOMER_USER' }));
    await commands.confirm();
    assert.equal(commands.current()!.phase, 'denied');
    assert.equal(calls.length, 0);
  } finally {
    destroy();
  }
});
test('a late reply cannot restore command state after its context has been reset', async () => {
  const { widget } = setup();
  let complete!: (value: { state: string }) => void;
  const response = new Promise<{ state: string }>((resolve) => {
    complete = resolve;
  });
  const injector = Injector.create({
    providers: [
      {
        provide: ApiService,
        useValue: {
          user: () => ({ authority: 'TENANT_ADMIN' }),
          commandsEnabled: () => true,
          request: () => response,
        },
      },
      { provide: RealtimeService, useValue: { state: () => 'connected' } },
    ],
  });
  const commands = runInInjectionContext(injector, () => new CommandRuntimeService());
  try {
    commands.prepare(
      {
        widget,
        event: 'activate',
        screenId: 'screen',
        mode: 'runtime',
        release: { id: crypto.randomUUID(), publishedAt: '', project: createStarterProject() },
      },
      35,
    );
    const waiting = commands.confirm();
    assert.equal(commands.current()!.phase, 'sending');
    commands.reset();
    complete({ state: 'accepted' });
    await waiting;
    assert.equal(commands.current(), null);
  } finally {
    commands.reset();
    injector.destroy();
  }
});

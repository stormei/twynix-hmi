import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScriptWorkerClient } from '../packages/scripting/src/worker-client';
class FixtureWorker {
  onmessage: Worker['onmessage'] = null;
  onerror: Worker['onerror'] = null;
  onmessageerror: Worker['onmessageerror'] = null;
  terminated = false;
  messages: { id: number; source: string; context: { value: unknown }; mode: string }[] = [];
  postMessage(message: (typeof this.messages)[number]) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  respond(data: unknown) {
    this.onmessage?.call(this as unknown as Worker, new MessageEvent('message', { data }));
  }
  fail() {
    this.onerror?.call(this as unknown as AbstractWorker, {} as ErrorEvent);
  }
}
const context = { value: 1, quality: 'good', name: 'Fixture' };
test('worker client bounds the queue, serializes dispatch and captures immutable request snapshots', async () => {
  const worker = new FixtureWorker(),
    client = new ScriptWorkerClient(() => worker);
  try {
    const changing = { ...context };
    const calls = Array.from({ length: 64 }, () =>
      client.execute('return {};', changing, 'behavior'),
    );
    changing.value = 99;
    await assert.rejects(client.execute('return {};', context, 'behavior'), /queue is full/);
    assert.equal(worker.messages.length, 1);
    for (let index = 0; index < 64; index++) {
      assert.equal(worker.messages[index].context.value, 1);
      worker.respond({ id: worker.messages[index].id, result: {} });
    }
    await Promise.all(calls);
    assert.equal(worker.messages.length, 64);
  } finally {
    client.dispose();
  }
});
test('crashes and malformed messages reject queued work; late worker messages cannot poison recovery', async () => {
  const workers: FixtureWorker[] = [];
  const client = new ScriptWorkerClient(() => {
    const worker = new FixtureWorker();
    workers.push(worker);
    return worker;
  });
  try {
    const first = client.execute('return {};', context, 'behavior'),
      queued = client.execute('1', context, 'expression');
    const old = workers[0];
    old.fail();
    await assert.rejects(first, /worker failed/);
    await assert.rejects(queued, /worker failed/);
    assert.equal(old.terminated, true);
    const recovered = client.execute('1', context, 'expression');
    old.respond({ id: workers[1].messages[0].id, result: 'obsolete' });
    workers[1].respond({ id: workers[1].messages[0].id, result: 1 });
    assert.equal(await recovered, 1);
    const malformed = client.execute('1', context, 'expression');
    workers[1].respond({ result: 1 });
    await assert.rejects(malformed, /Invalid script/);
    const next = client.execute('1', context, 'expression');
    workers[2].respond({ id: workers[2].messages[0].id, result: 1 });
    assert.equal(await next, 1);
  } finally {
    client.dispose();
  }
});
test('watchdog and disposal settle pending requests and prevent further dispatch', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const worker = new FixtureWorker(),
    client = new ScriptWorkerClient(() => worker);
  const active = client.execute('1', context, 'expression'),
    queued = client.execute('1', context, 'expression');
  t.mock.timers.tick(5000);
  await assert.rejects(active, /timed out/);
  await assert.rejects(queued, /timed out/);
  assert.equal(worker.terminated, true);
  const last = client.execute('1', context, 'expression');
  client.dispose();
  await assert.rejects(last, /closed/);
  await assert.rejects(client.execute('1', context, 'expression'), /closed/);
});

test('queue wait does not consume the dispatch watchdog and oversized/uncloneable snapshots never dispatch', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const worker = new FixtureWorker(),
    client = new ScriptWorkerClient(() => worker);
  try {
    await assert.rejects(
      client.execute('1', { ...context, value: 'x'.repeat(160001) }, 'expression'),
      /size limit/,
    );
    await assert.rejects(client.execute('1', { ...context, value: () => 1 }, 'expression'));
    assert.equal(worker.messages.length, 0);
    const first = client.execute('1', context, 'expression'),
      second = client.execute('2', context, 'expression');
    t.mock.timers.tick(4999);
    worker.respond({ id: worker.messages[0].id, result: 1 });
    await first;
    t.mock.timers.tick(2);
    worker.respond({ id: worker.messages[1].id, result: 2 });
    assert.equal(await second, 2);
  } finally {
    client.dispose();
  }
});

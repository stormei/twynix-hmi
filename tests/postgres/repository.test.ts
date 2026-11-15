import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createStarterProject } from '../../packages/model/src';
import type { ProjectRepository } from '../../apps/gateway/src/projects/project.repository';

let admin: Pool;
let first: ProjectRepository;
let second: ProjectRepository;
const schema = `twynix_test_${crypto.randomUUID().replaceAll('-', '')}`;
before(async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.NODE_ENV !== 'test' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/twynix_test_[a-z0-9_]+$/.test(url.pathname) ||
    url.search
  )
    throw new Error(
      'PostgreSQL tests require the guarded test:postgres runner and a disposable database.',
    );
  admin = new Pool({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.href;
  const { ProjectRepository: Repository } =
    await import('../../apps/gateway/src/projects/project.repository');
  first = new Repository();
  second = new Repository();
  // Initialize once before concurrent operations; lazy CREATE TABLE is not a migration system.
  await first.list('tenant:user');
});
after(async () => {
  await first?.onModuleDestroy();
  await second?.onModuleDestroy();
  if (admin) {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});

test('PostgreSQL revisions serialize competing saves across repository instances', async () => {
  const project = createStarterProject();
  const owner = 'tenant:user';
  await first.mutate(project.id, owner, 0, () => ({
    owner,
    draft: { ...project, revision: 1 },
    releases: [],
    audit: [],
  }));
  const results = await Promise.allSettled(
    [first, second].map((repository) =>
      repository.mutate(project.id, owner, 1, (current) => ({
        ...current!,
        draft: { ...current!.draft, revision: 2 },
      })),
    ),
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected && rejected.reason.getStatus() === 409);
  assert.equal((await first.get(project.id, owner)).draft.revision, 2);
});
test('PostgreSQL rollback, owner isolation and reopen preserve stored releases', async () => {
  const project = createStarterProject();
  const owner = 'tenant:owner';
  await first.mutate(project.id, owner, 0, () => ({
    owner,
    draft: { ...project, revision: 1 },
    releases: [
      {
        id: crypto.randomUUID(),
        publishedAt: new Date().toISOString(),
        project: structuredClone(project),
      },
    ],
    audit: [],
  }));
  await assert.rejects(
    () =>
      first.mutate(project.id, owner, 1, () => {
        throw new Error('test rollback');
      }),
    /test rollback/,
  );
  await assert.rejects(() => second.get(project.id, 'tenant:other'), { status: 404 });
  const restored = await second.get(project.id, owner);
  assert.equal(restored.draft.revision, 1);
  assert.equal(restored.releases[0].project.name, project.name);
});

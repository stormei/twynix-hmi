import { ConflictException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import type { Project, Release } from '../../../../packages/model/src';
import { config } from '../config';

export interface StoredProject {
  owner: string;
  draft: Project;
  releases: Release[];
  audit: { at: string; action: string; userId: string }[];
}
@Injectable()
export class ProjectRepository implements OnModuleDestroy {
  private readonly pool = config.databaseUrl
    ? new Pool({ connectionString: config.databaseUrl })
    : undefined;
  private initialized?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file = join(config.dataDir, 'projects.json');
  private init() {
    return (this.initialized ??= this.pool
      ? this.pool
          .query(
            'CREATE TABLE IF NOT EXISTS twynix_projects (id UUID PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, document JSONB NOT NULL)',
          )
          .then(() => undefined)
      : mkdir(config.dataDir, { recursive: true }).then(() => undefined));
  }
  private async local(): Promise<Record<string, StoredProject>> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }
  async list(owner: string): Promise<Project[]> {
    await this.init();
    if (this.pool)
      return (
        await this.pool.query('SELECT document FROM twynix_projects WHERE owner=$1', [owner])
      ).rows.map((row) => (row.document as StoredProject).draft);
    return Object.values(await this.local())
      .filter((p) => p.owner === owner)
      .map((p) => p.draft);
  }
  async get(id: string, owner: string): Promise<StoredProject> {
    await this.init();
    const value = this.pool
      ? (
          await this.pool.query('SELECT document FROM twynix_projects WHERE id=$1 AND owner=$2', [
            id,
            owner,
          ])
        ).rows[0]?.document
      : (await this.local())[id];
    if (!value || value.owner !== owner) throw new NotFoundException('Project not found.');
    return value;
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  async mutate(
    id: string,
    owner: string,
    revision: number,
    change: (existing?: StoredProject) => StoredProject,
  ): Promise<StoredProject> {
    await this.init();
    // A single transaction covers draft changes, release snapshots, and their audit records.
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [id]);
        const row = (
          await client.query('SELECT document FROM twynix_projects WHERE id=$1 FOR UPDATE', [id])
        ).rows[0];
        const existing = row?.document as StoredProject | undefined;
        this.check(existing, owner, revision);
        const result = change(existing);
        await client.query(
          'INSERT INTO twynix_projects (id, owner, revision, document) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET revision=$3, document=$4',
          [id, owner, result.draft.revision, JSON.stringify(result)],
        );
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    return this.serial(async () => {
      const all = await this.local();
      this.check(all[id], owner, revision);
      const result = change(all[id]);
      all[id] = result;
      const temp = `${this.file}.tmp`;
      await writeFile(temp, JSON.stringify(all, null, 2), { mode: 0o600 });
      await rename(temp, this.file);
      return result;
    });
  }
  private check(existing: StoredProject | undefined, owner: string, revision: number) {
    if (existing && existing.owner !== owner) throw new NotFoundException('Project not found.');
    if ((existing?.draft.revision ?? 0) !== revision)
      throw new ConflictException('This project changed elsewhere. Reload it before saving.');
  }
  async onModuleDestroy() {
    await this.pool?.end();
  }
}

import { Injectable, signal } from '@angular/core';
import {
  entityPageSchema,
  sourceCatalogSchema,
  type User,
  type Project,
  type Release,
} from '@twynix/model';
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export interface Entity {
  id: string;
  name: string;
}
interface SessionInfo {
  user: User;
  csrf: string;
  commandsEnabled: boolean;
}
@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly user = signal<User | null>(null);
  readonly commandsEnabled = signal(false);
  private csrf = '';
  async request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response
      .json()
      .catch(() => ({ message: 'The gateway returned an invalid response.' }));
    if (!response.ok) {
      if (response.status === 401) this.clearSession();
      throw new ApiError(data.message ?? `Request failed (${response.status}).`, response.status);
    }
    return data;
  }
  async restore() {
    try {
      this.accept(await this.request<SessionInfo>('/auth/session'));
    } catch {
      this.clearSession();
    }
  }
  async login(username: string, password: string) {
    this.accept(await this.request<SessionInfo>('/auth/login', 'POST', { username, password }));
  }
  async logout() {
    try {
      await this.request('/auth/logout', 'POST', {});
    } finally {
      this.clearSession();
    }
  }
  clearSession() {
    this.user.set(null);
    this.csrf = '';
    this.commandsEnabled.set(false);
  }
  private accept(info: SessionInfo) {
    this.user.set(info.user);
    this.csrf = info.csrf;
    this.commandsEnabled.set(info.commandsEnabled);
  }
  save(project: Project) {
    return this.request<Project>(`/projects/${project.id}`, 'PUT', project);
  }
  listProjects() {
    return this.request<Project[]>('/projects');
  }
  loadProject(id: string) {
    return this.request<{ draft: Project; releases: Release[] }>(`/projects/${id}`);
  }
  publish(project: Project) {
    return this.request<Release>(`/projects/${project.id}/releases`, 'POST', {
      revision: project.revision,
    });
  }
  async entityPage(type: 'DEVICE' | 'ASSET', search = '', page = 0) {
    const result = entityPageSchema.parse(
      await this.request<unknown>(
        `/entities?type=${type}&search=${encodeURIComponent(search)}&page=${page}`,
      ),
    );
    return {
      entities: result.data.map((row) => ({
        id: row.entityId.id,
        name: row.latest.ENTITY_FIELD.name.value,
      })),
      hasNext: result.hasNext,
    };
  }
  async entities(search = ''): Promise<Entity[]> {
    return (await this.entityPage('DEVICE', search)).entities;
  }
  async sourceCatalog(type: 'DEVICE' | 'ASSET', id: string) {
    return sourceCatalogSchema.parse(
      await this.request<unknown>(`/entities/${type}/${id}/catalog`),
    );
  }
  keys(type: string, id: string) {
    return this.request<string[]>(`/entities/${type}/${id}/keys`);
  }
  acknowledge(id: string) {
    return this.request(`/alarms/${id}/ack`, 'POST', {});
  }
}

import { effect, inject, Injectable, signal } from '@angular/core';
import { createStarterProject, Project, projectSchema, Release } from '@twynix/model';
import { ApiService } from './api.service';
import { CommandStateService } from './command-state.service';
import { EditorStore } from './editor.store';
import { HmiActionsService } from './hmi-actions.service';
import { HmiFeedbackService } from './hmi-feedback.service';
import { HmiRuntimeContext } from './hmi-runtime-context.service';
import { RealtimeService } from './realtime.service';

@Injectable()
export class EditorWorkspaceService {
  private readonly context = inject(HmiRuntimeContext);
  private readonly store = inject(EditorStore);
  private readonly api = inject(ApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly commands = inject(CommandStateService);
  private readonly actions = inject(HmiActionsService);
  private readonly feedback = inject(HmiFeedbackService);
  readonly mode = this.context.mode;
  readonly dataSource = this.context.dataSource;
  readonly activeRelease = this.context.activeRelease;
  private readonly notify = this.feedback.notify.bind(this.feedback);
  private readonly log = this.feedback.log.bind(this.feedback);
  private readonly ask = this.feedback.ask.bind(this.feedback);
  private readonly message = (error: unknown) =>
    error instanceof Error ? error.message : 'Operation failed.';

  readonly loginOpen = signal(false);
  readonly projectsOpen = signal(false);
  readonly busy = signal(false);
  readonly loginBusy = signal(false);
  readonly loginError = signal('');
  username = '';
  password = '';
  readonly savedProjects = signal<Project[]>([]);
  readonly releases = signal<Release[]>([]);
  readonly alarmBusy = signal<string | null>(null);
  async login() {
    this.loginBusy.set(true);
    this.loginError.set('');
    try {
      await this.api.login(this.username, this.password);
      this.password = '';
      this.loginOpen.set(false);
      this.context.historyReset.update((value) => value + 1);
      this.notify('Connected to ThingsBoard. Values now use live bindings.');
    } catch (error) {
      this.loginError.set(this.message(error));
    } finally {
      this.loginBusy.set(false);
    }
  }
  async logout() {
    try {
      await this.api.logout();
    } catch (error) {
      this.log(this.message(error), true);
    }
    const wasSending =
      this.commands.current()?.phase === 'sending' && !this.commands.current()?.simulated;
    this.commands.reset();
    this.dataSource.set('simulation');
    this.realtime.disconnect();
    this.context.historyReset.update((value) => value + 1);
    this.setMode('edit');
    if (wasSending)
      this.log(
        'Session ended with a command in flight. Verify equipment state before issuing another command.',
        true,
      );
    this.notify('Signed out. Simulation workspace is active.');
  }
  continueOffline() {
    this.dataSource.set('simulation');
    this.realtime.disconnect();
    this.context.historyReset.update((value) => value + 1);
    this.loginOpen.set(false);
  }
  async save() {
    if (this.mode() === 'runtime' || this.busy()) return;
    if (!this.api.user()) {
      if (this.dataSource() === 'live') {
        this.loginOpen.set(true);
        return;
      }
      this.store.export();
      this.notify('Project exported. Sign in to save to the gateway.');
      return;
    }
    this.busy.set(true);
    try {
      const snapshot = projectSchema.parse(this.store.project());
      const saved = await this.api.save(snapshot);
      this.store.saved(saved);
      this.notify(`Draft saved · revision ${saved.revision}`);
    } catch (error) {
      this.notify(this.message(error), true);
    } finally {
      this.busy.set(false);
    }
  }
  async publish() {
    if (!this.api.user()) {
      this.loginOpen.set(true);
      return;
    }
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const snapshot = projectSchema.parse(this.store.project());
      const saved = await this.api.save(snapshot);
      this.store.saved(saved);
      const release = await this.api.publish(saved);
      this.releases.update((all) => [...all, release]);
      this.activeRelease.set(release);
      this.notify(`Published revision ${release.project.revision}. Open Runtime to use it.`);
    } catch (error) {
      this.notify(this.message(error), true);
    } finally {
      this.busy.set(false);
    }
  }
  async openProjects() {
    if (this.commands.busy()) {
      this.notify('Complete the current command before opening another project.');
      return;
    }
    if (!this.api.user()) {
      this.loginOpen.set(true);
      return;
    }
    try {
      this.savedProjects.set(await this.api.listProjects());
      this.projectsOpen.set(true);
    } catch (error) {
      this.notify(this.message(error), true);
    }
  }
  async loadProject(id: string) {
    if (
      this.store.dirty() &&
      !(await this.ask(
        'Replace unsaved draft?',
        'Export the current draft first if you want to keep a copy.',
        'Replace draft',
      ))
    )
      return;
    try {
      const stored = await this.api.loadProject(id);
      this.store.load(stored.draft);
      this.releases.set(stored.releases);
      this.activeRelease.set(stored.releases.at(-1) ?? null);
      this.projectsOpen.set(false);
      this.setMode('edit');
      this.notify('Project opened.');
    } catch (error) {
      this.notify(this.message(error), true);
    }
  }
  async restoreRelease(release: Release) {
    if (
      !(await this.ask(
        'Restore release to draft?',
        'Unsaved draft changes will be replaced. The published release remains unchanged.',
        'Restore draft',
      ))
    )
      return;
    this.store.load(
      {
        ...structuredClone(release.project),
        revision: this.store.project().revision,
      },
      true,
    );
    this.projectsOpen.set(false);
    this.setMode('edit');
    this.notify('Release copied to draft. Save and publish to deploy this revision.');
  }
  async importFile(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Project files must be smaller than 2 MB.');
      const project = projectSchema.parse(JSON.parse(await file.text()));
      if (
        this.store.dirty() &&
        !(await this.ask(
          'Replace unsaved draft?',
          'Importing replaces the current draft. Export it first to keep a copy.',
          'Import project',
        ))
      )
        return;
      this.store.load({ ...project, id: crypto.randomUUID(), revision: 0 }, true);
      this.activeRelease.set(null);
      this.releases.set([]);
      this.setMode('edit');
      this.notify('Imported as a new project.');
    } catch (error) {
      this.notify(this.message(error), true);
    } finally {
      input.value = '';
    }
  }
  async newProject() {
    if (
      this.store.dirty() &&
      !(await this.ask(
        'Create a new project?',
        'Export the current draft first if you want to keep a copy.',
        'Create project',
      ))
    )
      return;
    const project = createStarterProject();
    project.name = 'Untitled project';
    this.store.load(project, true);
    this.activeRelease.set(null);
    this.releases.set([]);
    this.setMode('edit');
  }
  async acknowledge(id: string) {
    if (this.alarmBusy()) return;
    this.alarmBusy.set(id);
    try {
      await this.api.acknowledge(id);
      this.notify('Acknowledgement requested. Waiting for ThingsBoard update.');
    } catch (error) {
      this.notify(this.message(error), true);
    } finally {
      this.alarmBusy.set(null);
    }
  }
  constructor() {
    void this.api.restore();
    effect(() => {
      if (this.realtime.expired()) {
        this.api.clearSession();
        this.notify('Your session expired. Live values are stale. Sign in again.', true);
        this.loginOpen.set(true);
      }
    });
  }
  setMode(mode: 'edit' | 'preview' | 'runtime') {
    if (this.commands.busy()) {
      this.notify('Complete the current command before switching mode.');
      return;
    }
    this.commands.reset();
    this.actions.previewInputs.set({});
    if (mode === 'runtime') {
      const release = this.activeRelease();
      if (!release) {
        this.notify('Publish a project or open a saved release first.');
        return;
      }
      this.context.openPublished(release, false);
    } else this.context.showDraft(mode);
  }
}

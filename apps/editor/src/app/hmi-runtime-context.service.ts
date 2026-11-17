import { computed, Injectable, Signal, signal } from '@angular/core';
import { projectSchema, type Project, type Release, type Screen } from '@twynix/model';
export type HmiMode = 'edit' | 'preview' | 'runtime';
/** Shared screen context. No editor store, selection, history or authoring components. */
@Injectable()
export class HmiRuntimeContext {
  readonly mode = signal<HmiMode>('edit');
  readonly dataSource = signal<'simulation' | 'live'>('simulation');
  readonly activeRelease = signal<Release | null>(null);
  readonly runtimeProject = signal<Project | null>(null);
  readonly runtimeScreenId = signal('');
  readonly operatorOnly = signal(false);
  readonly historyReset = signal(0);
  readonly transition = signal<{ kind: 'mode' | 'screen'; sequence: number }>({
    kind: 'mode',
    sequence: 0,
  });
  private readonly draft = signal<{
    screen: Signal<Screen>;
    navigate: (id: string) => void;
  } | null>(null);
  readonly ready = computed(() =>
    this.mode() === 'runtime' ? !!this.runtimeProject() : !!this.draft(),
  );
  readonly screen = computed<Screen>(() => {
    if (this.mode() === 'runtime') {
      const project = this.runtimeProject();
      if (!project) throw new Error('No published HMI is loaded.');
      return (
        project.screens.find((screen) => screen.id === this.runtimeScreenId()) ?? project.screens[0]
      );
    }
    const draft = this.draft();
    if (!draft) throw new Error('No editor draft is attached.');
    return draft.screen();
  });
  attachEditor(screen: Signal<Screen>, navigate: (id: string) => void) {
    this.draft.set({ screen, navigate });
  }
  openPublished(release: Release, operatorOnly = true) {
    const project = projectSchema.parse(release.project);
    this.activeRelease.set(release);
    this.runtimeProject.set(project);
    this.runtimeScreenId.set(project.screens[0].id);
    this.operatorOnly.set(operatorOnly);
    if (operatorOnly) this.dataSource.set('live');
    this.mode.set('runtime');
    this.changed('mode');
  }
  showDraft(mode: 'edit' | 'preview') {
    if (!this.draft()) throw new Error('An operator viewer cannot enter authoring modes.');
    this.operatorOnly.set(false);
    this.mode.set(mode);
    this.changed('mode');
  }
  navigate(id: string) {
    if (this.mode() === 'runtime') this.runtimeScreenId.set(id);
    else this.draft()?.navigate(id);
    this.changed('screen');
  }
  private changed(kind: 'mode' | 'screen') {
    this.historyReset.update((value) => value + 1);
    this.transition.update((value) => ({ kind, sequence: value.sequence + 1 }));
  }
}

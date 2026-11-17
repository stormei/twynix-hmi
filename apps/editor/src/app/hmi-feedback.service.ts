import { DestroyRef, inject, Injectable, signal } from '@angular/core';

@Injectable()
export class HmiFeedbackService {
  readonly toast = signal('');
  readonly logs = signal<{ time: number; message: string; error: boolean }[]>([]);
  readonly confirmation = signal<{
    title: string;
    message: string;
    label: string;
    danger: boolean;
    resolve: (accepted: boolean) => void;
  } | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;
  notify(message: string, error = false) {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 6500);
    this.log(message, error);
  }
  log(message: string, error = false) {
    this.logs.update((logs) => [{ time: Date.now(), message, error }, ...logs].slice(0, 100));
  }
  safe(action: () => void) {
    try {
      action();
    } catch (error) {
      this.notify(this.message(error), true);
    }
  }
  ask(title: string, message: string, label = 'Continue', danger = false): Promise<boolean> {
    return new Promise((resolve) =>
      this.confirmation.set({ title, message, label, danger, resolve }),
    );
  }
  answer(accepted: boolean) {
    const confirmation = this.confirmation();
    this.confirmation.set(null);
    confirmation?.resolve(accepted);
  }
  private message(error: unknown) {
    return error instanceof Error ? error.message : 'Operation failed.';
  }
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.toastTimer);
      this.answer(false);
    });
  }
}

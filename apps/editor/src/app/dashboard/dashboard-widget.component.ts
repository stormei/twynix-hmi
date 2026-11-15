import {
  Component,
  computed,
  effect,
  signal,
  inject,
  DestroyRef,
  type Type,
  output,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { isDashboardKind, type ControlValue } from '@twynix/model';
import { DashboardWidgetInputs } from './shared/widget-inputs';
import { dashboardRegistry } from './widget-registry';
@Component({
  selector: 'tx-dashboard-widget',
  standalone: true,
  imports: [NgComponentOutlet],
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
      }
    `,
  ],
  template: `@if (component(); as type) {
      <ng-container *ngComponentOutlet="type; inputs: resolvedInputs()" />
    } @else if (failed()) {
      <p role="alert">Unable to load this widget. Reload to try again.</p>
    }`,
})
export class DashboardWidgetComponent extends DashboardWidgetInputs {
  readonly changed = output<ControlValue>();
  private readonly forwardInput = (value: ControlValue) => this.changed.emit(value);
  readonly component = signal<Type<DashboardWidgetInputs> | null>(null);
  readonly failed = signal(false);
  private generation = 0;
  private readonly kind = computed(() => this.widget().kind);
  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => this.generation++);
    effect(() => {
      const kind = this.kind();
      const generation = ++this.generation;
      this.component.set(null);
      this.failed.set(false);
      if (!isDashboardKind(kind)) return;
      void dashboardRegistry[kind]
        .loadComponent()
        .then((component) => {
          if (generation === this.generation) this.component.set(component);
        })
        .catch(() => {
          if (generation === this.generation) this.failed.set(true);
        });
    });
  }
  readonly resolvedInputs = computed(() => ({
    widget: this.widget(),
    value: this.value(),
    quality: this.quality(),
    color: this.color(),
    text: this.text(),
    unit: this.unit(),
    samples: this.samples(),
    interactive: this.interactive(),
    enabled: this.enabled(),
    onInput: this.forwardInput,
  }));
}

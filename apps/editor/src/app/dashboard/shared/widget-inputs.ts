import { Directive, input } from '@angular/core';
import type { Widget, ControlValue } from '@twynix/model';

/** The editor resolves ThingsBoard bindings; widgets only present those resolved inputs. */
@Directive()
export abstract class DashboardWidgetInputs {
  readonly widget = input.required<Widget>();
  readonly value = input<unknown>(null);
  readonly quality = input('disconnected');
  readonly color = input('#329c8c');
  readonly text = input<string | null>('');
  readonly unit = input('');
  readonly samples = input<number[]>([]);
  readonly interactive = input(false);
  readonly enabled = input(true);
  readonly onInput = input<(value: ControlValue) => void>(() => {});
  commit(value: ControlValue) {
    if (this.interactive() && this.enabled() && ['good', 'simulation'].includes(this.quality()))
      this.onInput()(value);
  }
  usable(): boolean {
    return (
      ['good', 'simulation'].includes(this.quality()) &&
      this.value() !== null &&
      Number.isFinite(Number(this.value()))
    );
  }
}

import { Directive } from '@angular/core';
import { DashboardWidgetInputs } from './widget-inputs';

@Directive({
  host: { '(click)': '$event.stopPropagation()', '(keydown)': '$event.stopPropagation()' },
})
export abstract class ControlWidgetInputs extends DashboardWidgetInputs {
  unavailable() {
    return (
      !this.enabled() || !['good', 'simulation'].includes(this.quality()) || this.value() === null
    );
  }
  selected(value: unknown) {
    return this.value() !== null && String(this.value()) === String(value);
  }
}

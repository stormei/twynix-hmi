import { Component, effect, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { operatingRangeSchema, type Widget } from '@twynix/model';

@Component({
  selector: 'tx-operating-range',
  standalone: true,
  imports: [FormsModule],
  template: `<details class="operating-range-editor">
    <summary>Operating range</summary>
    <p class="field-hint">
      Shows measurement context in High-performance HMI. These are normal operating limits, not
      ThingsBoard alarm rules.
    </p>
    <div class="field-grid">
      <label
        >Scale minimum<input
          type="number"
          aria-label="Range scale minimum"
          [(ngModel)]="draft.min"
          [disabled]="disabled()"
      /></label>
      <label
        >Scale maximum<input
          type="number"
          aria-label="Range scale maximum"
          [(ngModel)]="draft.max"
          [disabled]="disabled()"
      /></label>
      <label
        >Normal low<input
          type="number"
          aria-label="Normal operating low"
          [(ngModel)]="draft.normalLow"
          [disabled]="disabled()"
      /></label>
      <label
        >Normal high<input
          type="number"
          aria-label="Normal operating high"
          [(ngModel)]="draft.normalHigh"
          [disabled]="disabled()"
      /></label>
    </div>
    @if (error) {
      <p role="alert" class="field-error">{{ error }}</p>
    }
    <div class="range-actions">
      <button (click)="apply()" [disabled]="disabled()">Apply range</button
      ><button (click)="changed.emit(null)" [disabled]="disabled() || !widget().operatingRange">
        Remove range
      </button>
    </div>
  </details>`,
})
export class OperatingRangeComponent {
  readonly widget = input.required<Widget>();
  readonly disabled = input(false);
  readonly changed = output<Widget['operatingRange']>();
  draft = { min: 0, max: 100, normalLow: 25, normalHigh: 75 };
  error = '';
  constructor() {
    effect(() => {
      this.draft = {
        ...(this.widget().operatingRange ?? { min: 0, max: 100, normalLow: 25, normalHigh: 75 }),
      };
      this.error = '';
    });
  }
  apply() {
    const result = operatingRangeSchema.safeParse(this.draft);
    if (!result.success) {
      this.error =
        'Use a scale minimum below its maximum, with the normal range inside that scale.';
      return;
    }
    this.error = '';
    this.changed.emit(result.data);
  }
}

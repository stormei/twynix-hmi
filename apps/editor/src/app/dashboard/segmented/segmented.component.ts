import { Component, computed } from '@angular/core';
import { ControlWidgetInputs } from '../shared/control-inputs';
@Component({
  selector: 'tx-segmented-widget',
  standalone: true,
  styleUrl: '../shared/control.css',
  styles: [
    `
      .segments {
        display: flex;
        border: 1px solid #aebfcc;
        border-radius: 5px;
        overflow: hidden;
      }
      .segments button {
        flex: 1;
        padding: 8px 6px;
        border: 0;
        border-right: 1px solid #d4dfe7;
        background: #f5f8fa;
        color: #526b7d;
      }
      .segments button:last-child {
        border-right: 0;
      }
      .segments button.active {
        background: #267c91;
        color: white;
      }
    `,
  ],
  template: `<header>
      <strong>{{ text() ?? (widget().text || widget().name) }}</strong><small>{{
        quality()
      }}</small>
    </header>
    <div class="segments" role="radiogroup" [attr.aria-label]="widget().name">
      @for (option of options(); track $index) {
        <button
          role="radio"
          [attr.aria-checked]="selected(option.value)"
          [class.active]="selected(option.value)"
          [disabled]="unavailable()"
          [attr.tabindex]="interactive() ? 0 : -1"
          (click)="commit(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>`,
})
export class SegmentedWidgetComponent extends ControlWidgetInputs {
  readonly options = computed(() => {
    const c = this.widget().dashboard;
    return c?.type === 'segmented' ? c.options : [];
  });
}

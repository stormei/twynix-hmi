import { Component, computed } from '@angular/core';
import { ControlWidgetInputs } from '../shared/control-inputs';
@Component({
  selector: 'tx-radio-widget',
  standalone: true,
  styleUrl: '../shared/control.css',
  styles: [
    `
      .options {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .vertical {
        flex-direction: column;
        gap: 6px;
      }
      label {
        display: flex;
        gap: 5px;
        align-items: center;
      }
    `,
  ],
  template: `<header>
      <strong>{{ text() ?? (widget().text || widget().name) }}</strong><small>{{
        quality()
      }}</small>
    </header>
    <div
      class="options"
      [class.vertical]="vertical()"
      role="radiogroup"
      [attr.aria-label]="widget().name"
    >
      @for (option of options(); track $index) {
        <label
          ><input
            type="radio"
            [name]="widget().id"
            [checked]="selected(option.value)"
            [disabled]="unavailable()"
            [attr.tabindex]="interactive() ? 0 : -1"
            (change)="commit(option.value)"
          />{{ option.label }}</label
        >
      }
    </div>`,
})
export class RadioWidgetComponent extends ControlWidgetInputs {
  readonly options = computed(() => {
    const c = this.widget().dashboard;
    return c?.type === 'radio' ? c.options : [];
  });
  readonly vertical = computed(() => {
    const c = this.widget().dashboard;
    return c?.type === 'radio' && c.layout === 'vertical';
  });
}

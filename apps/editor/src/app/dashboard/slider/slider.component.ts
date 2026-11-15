import { Component, computed } from '@angular/core';
import { defaultDashboardConfig, type DashboardConfig } from '@twynix/model';
import { ControlWidgetInputs } from '../shared/control-inputs';
@Component({
  selector: 'tx-slider-widget',
  standalone: true,
  styleUrls: ['../shared/control.css'],
  styles: [
    `
      input {
        width: 100%;
        margin: 0;
      }
      footer {
        display: flex;
        justify-content: space-between;
        color: #718291;
        font-size: 10px;
      }
      output {
        color: #19374c;
        font-weight: 600;
      }
    `,
  ],
  template: `<header>
      <strong>{{ text() ?? (widget().text || widget().name) }}</strong><output
        >{{ unavailable() ? '—' : value() }} {{ unit() || config().unit }}</output
      >
    </header>
    <input
      type="range"
      [attr.aria-label]="widget().name"
      [min]="config().minimum"
      [max]="config().maximum"
      [step]="config().step"
      [value]="value()"
      [disabled]="unavailable()"
      [attr.tabindex]="interactive() ? 0 : -1"
      (change)="commit($any($event.target).valueAsNumber)"
    />
    <footer>
      <span>{{ config().minimum }}</span><span>{{ quality() }}</span
      ><span>{{ config().maximum }}</span>
    </footer>`,
})
export class SliderWidgetComponent extends ControlWidgetInputs {
  readonly config = computed(() => {
    const c = this.widget().dashboard;
    return c?.type === 'slider'
      ? c
      : (defaultDashboardConfig('slider') as Extract<DashboardConfig, { type: 'slider' }>);
  });
}

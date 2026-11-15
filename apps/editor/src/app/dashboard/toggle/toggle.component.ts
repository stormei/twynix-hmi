import { Component, computed } from '@angular/core';
import { ControlWidgetInputs } from '../shared/control-inputs';
@Component({
  selector: 'tx-toggle-widget',
  standalone: true,
  styleUrl: '../shared/control.css',
  styles: [
    `
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .switch {
        width: 46px;
        height: 25px;
        border: 1px solid #91a5b5;
        border-radius: 16px;
        background: #b1bdc6;
        padding: 2px;
        transition: background 0.1s;
      }
      .switch.active {
        background: #267c91;
        border-color: #267c91;
      }
      .thumb {
        display: block;
        width: 19px;
        height: 19px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 1px 3px #17364d40;
      }
      .active .thumb {
        transform: translateX(20px);
      }
    `,
  ],
  template: `<header>
      <strong>{{ text() ?? (widget().text || widget().name) }}</strong><small>{{
        quality()
      }}</small>
    </header>
    <div class="row">
      <button
        class="switch"
        [class.active]="on()"
        role="switch"
        [attr.aria-label]="widget().name"
        [attr.aria-checked]="on()"
        [disabled]="unavailable()"
        [attr.tabindex]="interactive() ? 0 : -1"
        (click)="commit(!on())"
      >
        <span class="thumb"></span></button
      ><span>{{ label() }}</span>
    </div>`,
})
export class ToggleWidgetComponent extends ControlWidgetInputs {
  readonly on = computed(() =>
    [true, 1, 'true', '1'].includes(this.value() as string | number | boolean),
  );
  readonly label = computed(() => {
    const c = this.widget().dashboard;
    return c?.type === 'toggle' ? (this.on() ? c.onLabel : c.offLabel) : this.on() ? 'On' : 'Off';
  });
}

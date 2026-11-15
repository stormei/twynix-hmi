import { Component, computed } from '@angular/core';
import { ControlWidgetInputs } from '../shared/control-inputs';
@Component({
  selector: 'tx-dropdown-widget',
  standalone: true,
  styleUrl: '../shared/control.css',
  template: `<header>
      <strong>{{ text() ?? (widget().text || widget().name) }}</strong><small>{{
        quality()
      }}</small>
    </header>
    <select
      [attr.aria-label]="widget().name"
      [disabled]="unavailable()"
      [attr.tabindex]="interactive() ? 0 : -1"
      (change)="choose($any($event.target).value)"
    >
      @if (!matched()) {
        <option value="" disabled selected>Select…</option>
      }
      @for (option of options(); track $index) {
        <option [value]="$index" [selected]="selected(option.value)">{{ option.label }}</option>
      }
    </select>`,
})
export class DropdownWidgetComponent extends ControlWidgetInputs {
  readonly options = computed(() => {
    const c = this.widget().dashboard;
    return c?.type === 'dropdown' ? c.options : [];
  });
  readonly matched = computed(() => this.options().some((option) => this.selected(option.value)));
  choose(index: string) {
    const option = this.options()[Number(index)];
    if (option) this.commit(option.value);
  }
}

import { Component, computed, input, output } from '@angular/core';
import { BindableProperty, propertyBinding, Widget } from '@twynix/model';
import { IconComponent } from './icon.component';

@Component({
  selector: 'tx-property-row',
  standalone: true,
  imports: [IconComponent],
  template: `<div class="property-row" [class.property-bound]="definition()?.enabled">
    <div class="property-row-heading">
      <label [for]="'property-' + property()">{{ label() }}</label>
      <button
        type="button"
        class="binding-control"
        [class.configured]="definition()?.enabled"
        [attr.aria-label]="'Configure ' + label().toLowerCase() + ' binding'"
        [title]="definition() ? status() + ' binding — click to edit' : 'Configure binding'"
        [disabled]="disabled()"
        (click)="configure.emit()"
      >
        @if (definition()) {
          <span>{{ status() }}</span>
        }
        <tx-icon name="binding" />
      </button>
    </div>
    <ng-content />
  </div>`,
})
export class PropertyRowComponent {
  readonly widget = input.required<Widget>();
  readonly property = input.required<BindableProperty>();
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly configure = output<void>();
  readonly definition = computed(() => propertyBinding(this.widget(), this.property()));
  readonly status = computed(() => {
    const definition = this.definition();
    if (!definition) return '';
    return !definition.enabled
      ? 'Disabled'
      : definition.type === 'telemetry'
        ? definition.source.dataType === 'ATTRIBUTE'
          ? 'Attribute'
          : 'Telemetry'
        : definition.type === 'expression'
          ? 'Expression'
          : 'Constant';
  });
}

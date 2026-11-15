import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  dashboardConfigSchema,
  parseControlOptions,
  defaultDashboardConfig,
  isDashboardKind,
  type Widget,
  type DashboardConfig,
} from '@twynix/model';
import { dashboardRegistry, type WidgetField } from './widget-registry';
@Component({
  selector: 'tx-dashboard-properties',
  standalone: true,
  imports: [FormsModule],
  styles: [
    `
      :host {
        display: block;
        border-top: 1px solid #dce4eb;
        margin-top: 12px;
        padding-top: 12px;
      }
      textarea {
        min-height: 180px;
        resize: vertical;
        font: 12px/1.5 monospace;
      }
      .help {
        font-size: 11px;
        color: #6c7e8c;
        line-height: 1.5;
      }
      .error {
        font-size: 12px;
        color: #ae3030;
      }
    `,
  ],
  template: `@if (definition(); as def) {
    <div class="section-heading">
      <span>{{ def.label }} settings</span>
    </div>
    <p class="help">{{ def.description }}</p>
    @for (field of def.fields; track field.key) {
      <label
        >{{ field.label }}
        @switch (field.type) {
          @case ('select') {
            <select
              [attr.aria-label]="field.label"
              [ngModel]="fieldValue(field.key)"
              (ngModelChange)="patch(field, $event)"
            >
              @for (option of field.options; track option) {
                <option [value]="option">{{ option }}</option>
              }
            </select>
          }
          @case ('checkbox') {
            <input
              type="checkbox"
              [attr.aria-label]="field.label"
              [ngModel]="fieldValue(field.key)"
              (ngModelChange)="patch(field, $event)"
            />
          }
          @case ('options') {
            <textarea
              [attr.aria-label]="field.label"
              [ngModel]="fieldValue(field.key)"
              (ngModelChange)="patch(field, $event)"
              spellcheck="false"
            ></textarea>
            <p class="help">
              One value = Label per line. Numbers and true/false retain their types.
            </p>
          }
          @case ('textarea') {
            <textarea
              [attr.aria-label]="field.label"
              [ngModel]="fieldValue(field.key)"
              (ngModelChange)="patch(field, $event)"
              spellcheck="false"
            ></textarea>
          }
          @default {
            <input
              [type]="field.type"
              [attr.aria-label]="field.label"
              [ngModel]="fieldValue(field.key)"
              (ngModelChange)="patch(field, $event)"
            />
          }
        }
      </label>
    }
    @if (error) {
      <p class="error" role="alert">{{ error }}</p>
    }
    @if (widget().kind === 'chart') {
      <p class="help">
        Charts use the recent live samples collected while this screen is open. Set the telemetry
        source in Data.
      </p>
    }
    @if (widget().kind === 'markdown') {
      <p class="help">
        Supports headings, paragraphs, bullet lists, fenced code and standalone HTTP/HTTPS links.
        Raw HTML is displayed as text.
      </p>
    }
    @if (widget().kind === 'iframe') {
      <p class="help">
        The remote site must allow embedding. Scripts run in an isolated frame; credentials and
        top-level navigation are not shared.
      </p>
    }
    @if (widget().kind === 'html') {
      <p class="help">
        HTML and CSS render in an isolated frame. Scripts, forms and embedded frames are disabled.
      </p>
    }
  }`,
})
export class DashboardPropertiesComponent {
  readonly widget = input.required<Widget>();
  readonly changed = output<DashboardConfig>();
  error = '';
  readonly definition = computed(() => {
    const kind = this.widget().kind;
    return isDashboardKind(kind) ? dashboardRegistry[kind] : null;
  });
  readonly config = computed(() => {
    const w = this.widget();
    return w.dashboard ?? (isDashboardKind(w.kind) ? defaultDashboardConfig(w.kind) : null);
  });
  fieldValue(key: string): unknown {
    const value = (this.config() as unknown as Record<string, unknown>)?.[key] ?? '';
    return key === 'options' && Array.isArray(value)
      ? value.map((option) => `${option.value} = ${option.label}`).join('\n')
      : value;
  }
  patch(field: WidgetField, value: unknown) {
    let parsedValue = value;
    try {
      if (field.type === 'options') parsedValue = parseControlOptions(String(value));
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Invalid options.';
      return;
    }
    const result = dashboardConfigSchema.safeParse({
      ...this.config(),
      [field.key]: field.type === 'number' ? Number(value) : parsedValue,
    });
    if (!result.success) {
      this.error = result.error.issues[0].message;
      return;
    }
    this.error = '';
    this.changed.emit(result.data);
  }
}

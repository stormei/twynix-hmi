import { DataBrowserComponent, type BrowserSource } from './data-browser.component';
import {
  afterNextRender,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BindableProperty,
  Binding,
  PropertyBinding,
  propertyBinding,
  propertyBindingSchema,
  PropertyValue,
  validatePropertyValue,
  Widget,
} from '@twynix/model';
import {
  BindingEnvironment,
  PropertyResult,
  resolveProperty,
  defaultProperties,
} from '../../../../packages/bindings/src/resolve';
import { ApiService } from './api.service';
import { ScriptService } from './script.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'tx-binding-editor',
  standalone: true,
  imports: [FormsModule, IconComponent, DataBrowserComponent],
  templateUrl: './binding-editor.component.html',
})
export class BindingEditorComponent {
  readonly widget = input.required<Widget>();
  readonly property = input.required<BindableProperty>();
  readonly suggestedKey = input('');
  readonly environment = input.required<BindingEnvironment>();
  readonly currentValue = input.required<PropertyResult>();
  readonly applied = output<PropertyBinding | null>();
  readonly closed = output<void>();
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly api = inject(ApiService);
  private readonly scripts = inject(ScriptService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  readonly keys = signal<string[]>([]);
  readonly testing = signal(false);
  readonly error = signal('');
  readonly preview = signal<PropertyResult | null>(null);
  readonly sourceTypes = ['constant', 'telemetry', 'expression'] as const;
  type: PropertyBinding['type'] = 'telemetry';
  enabled = true;
  constant = '';
  booleanConstant = true;
  expression = 'context.value';
  useSource = false;
  entityId = '';
  entityType: Binding['entityType'] = 'DEVICE';
  dataType: NonNullable<Binding['dataType']> = 'TIME_SERIES';
  telemetryKey = '';
  unit = '';
  staleAfterSeconds = 30;
  sampleValue = '82';
  sampleQuality = 'simulation';
  useSample = true;
  private keysGeneration = 0;
  private draftGeneration = 0;

  constructor() {
    afterNextRender(() => {
      const existing = propertyBinding(this.widget(), this.property());
      this.enabled = existing?.enabled ?? true;
      this.type = existing?.type ?? (this.property() === 'value' ? 'telemetry' : 'expression');
      const defaults = defaultProperties(this.widget(), this.environment());
      const value =
        existing?.type === 'constant' ? existing.value : defaults[this.property()].value;
      this.constant = value === null ? '' : String(value);
      this.booleanConstant = value === true;
      if (existing?.type === 'expression') this.expression = existing.expression;
      else
        this.expression =
          this.property() === 'color'
            ? 'Number(context.value) > 75 ? "#da8054" : "#329c8c"'
            : this.property() === 'visible' || this.property() === 'enabled'
              ? 'Number(context.value) > 0'
              : this.property() === 'text'
                ? '"Level: " + context.value + "%"'
                : 'Number(context.value)';
      const source = existing && existing.type !== 'constant' ? existing.source : null;
      this.useSource = !!source;
      if (source) {
        this.entityId = source.entityId;
        this.entityType = source.entityType;
        this.dataType = source.dataType ?? 'TIME_SERIES';
        this.telemetryKey = source.key;
        this.unit = source.unit;
        this.staleAfterSeconds = source.staleAfterMs / 1000;
      }
      if (!this.telemetryKey) this.telemetryKey = this.suggestedKey();
      this.changeDetector.detectChanges();
      this.dialog().nativeElement.showModal();
    });
  }
  isBoolean() {
    return (
      this.property() === 'visible' ||
      this.property() === 'enabled' ||
      (this.property() === 'value' && this.widget().kind === 'toggle')
    );
  }
  changed() {
    this.draftGeneration++;
    this.preview.set(null);
    this.error.set('');
  }
  setType(type: PropertyBinding['type']) {
    this.type = type;
    this.changed();
  }
  source(): Binding {
    return {
      entityType: this.entityType,
      dataType: this.dataType,
      entityId: this.entityId.trim(),
      key: this.telemetryKey.trim(),
      unit: this.unit.trim(),
      staleAfterMs: this.staleAfterSeconds * 1000,
    };
  }
  definition(): PropertyBinding {
    const candidate =
      this.type === 'constant'
        ? {
            type: this.type,
            enabled: this.enabled,
            value: validatePropertyValue(
              this.property(),
              this.isBoolean() ? this.booleanConstant : this.constant,
              this.widget(),
            ),
          }
        : this.type === 'telemetry'
          ? { type: this.type, enabled: this.enabled, source: this.source() }
          : {
              type: this.type,
              enabled: this.enabled,
              expression: this.expression,
              source: this.useSource ? this.source() : null,
            };
    return propertyBindingSchema.parse(candidate);
  }
  chooseSource(source: BrowserSource) {
    this.entityId = source.entityId;
    this.entityType = source.entityType;
    this.telemetryKey = source.key;
    this.dataType = source.dataType;
    this.changed();
  }
  async loadKeys() {
    const generation = ++this.keysGeneration;
    this.keys.set([]);
    this.changed();
    if (!this.api.user() || !this.entityId.trim()) return;
    try {
      const keys =
        this.dataType === 'ATTRIBUTE'
          ? (await this.api.sourceCatalog(this.entityType, this.entityId.trim())).attributes.map(
              (source) => source.key,
            )
          : await this.api.keys(this.entityType, this.entityId.trim());
      if (generation === this.keysGeneration) this.keys.set(keys);
    } catch (error) {
      if (generation === this.keysGeneration) this.error.set(this.message(error));
    }
  }
  async test() {
    const generation = this.draftGeneration;
    this.testing.set(true);
    this.preview.set(null);
    this.error.set('');
    try {
      const definition = this.definition();
      const fallback = defaultProperties(this.widget(), this.environment())[this.property()];
      let input = this.currentValue();
      if (this.type === 'expression' && !this.useSource && this.useSample) {
        let value: PropertyValue;
        try {
          value = JSON.parse(this.sampleValue);
        } catch {
          value = this.sampleValue;
        }
        input = { value, quality: this.sampleQuality as PropertyResult['quality'] };
      }
      const result = await resolveProperty(
        this.property(),
        definition,
        this.widget(),
        this.environment(),
        fallback,
        input,
        (source, context) => this.scripts.expression(source, context),
      );
      if (generation !== this.draftGeneration) return;
      this.preview.set(result);
      if (result.error) this.error.set(result.error);
    } catch (error) {
      if (generation === this.draftGeneration) this.error.set(this.message(error));
    } finally {
      this.testing.set(false);
    }
  }
  apply() {
    try {
      this.applied.emit(this.definition());
    } catch (error) {
      this.error.set(this.message(error));
    }
  }
  close() {
    this.dialog().nativeElement.close();
  }
  hasDefinition() {
    return !!propertyBinding(this.widget(), this.property());
  }
  label() {
    return {
      value: 'Value',
      text: 'Display text',
      color: 'Accent colour',
      visible: 'Visibility',
      enabled: 'Enabled state',
    }[this.property()];
  }
  display(value: unknown) {
    return value === null
      ? 'null'
      : typeof value === 'string'
        ? JSON.stringify(value)
        : String(value);
  }
  private message(error: unknown) {
    if (error && typeof error === 'object' && 'issues' in error)
      return 'Check the entity UUID, telemetry key, expression, and freshness timeout (1–86,400 seconds).';
    return error instanceof Error ? error.message : 'Binding operation failed.';
  }
}

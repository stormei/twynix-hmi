import {
  afterNextRender,
  ChangeDetectorRef,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { captureFaceplate, faceplateTemplateSchema, FaceplateType, Widget } from '@twynix/model';
import type { FaceplateDraft } from '../../../../packages/editor/src/faceplates';
import { ModalDirective } from './modal.directive';
@Component({
  selector: 'tx-faceplate-editor',
  standalone: true,
  imports: [FormsModule, ModalDirective],
  template: `<dialog
    txModal
    class="modal faceplate-editor-dialog"
    (close)="closed.emit()"
    aria-labelledby="faceplate-editor-title"
  >
    <span class="eyebrow">REUSABLE EQUIPMENT TYPE</span>
    <h2 id="faceplate-editor-title">
      {{ type() ? 'Publish a new version' : 'Create faceplate type' }}
    </h2>
    <p>
      {{
        type()
          ? 'Existing instances keep their current version. Upgrade each instance explicitly when ready.'
          : 'Create a reusable pump, valve or tank from the selected component. Equipment bindings and device command targets stay instance-specific.'
      }}
    </p>
    <form (ngSubmit)="save()">
      <label
        >Type name<input name="name" [(ngModel)]="name" required maxlength="100" autofocus /></label
      ><label
        >Description<textarea
          name="description"
          [(ngModel)]="description"
          rows="2"
          maxlength="500"
        ></textarea>
      </label>
      <div class="field-grid">
        <label
          >Default telemetry key<input
            name="key"
            [(ngModel)]="telemetryKey"
            required
            maxlength="128" /></label
        ><label>Accent colour<input name="color" type="color" [(ngModel)]="color" /></label>
      </div>
      <label>Default display text<input name="text" [(ngModel)]="text" maxlength="300" /></label>
      <div class="field-grid">
        <label
          >Default width<input
            name="width"
            type="number"
            [(ngModel)]="width"
            min="40"
            max="2000" /></label
        ><label
          >Default height<input
            name="height"
            type="number"
            [(ngModel)]="height"
            min="30"
            max="2000"
        /></label>
      </div>
      <div class="info-note">
        Appearance, non-value property bindings and scripts are captured from the source. Position,
        groups, locks, telemetry source and device command targets are not shared.
      </div>
      @if (error()) {
        <div class="inline-error" role="alert">{{ error() }}</div>
      }
      <div class="modal-actions">
        <button class="button secondary" type="button" (click)="closed.emit()">Cancel</button
        ><button class="button primary" type="submit">
          Publish v{{ (type()?.versions?.at(-1)?.version ?? 0) + 1 }}
        </button>
      </div>
    </form>
  </dialog>`,
})
export class FaceplateEditorComponent {
  readonly source = input.required<Widget>();
  readonly type = input<FaceplateType | null>(null);
  readonly saved = output<FaceplateDraft>();
  readonly closed = output<void>();
  readonly error = signal('');
  name = '';
  description = '';
  telemetryKey = '';
  color = '#329c8c';
  text = '';
  width = 130;
  height = 100;
  private readonly cdr = inject(ChangeDetectorRef);
  constructor() {
    afterNextRender(() => {
      const source = this.source();
      this.name = this.type()?.name ?? `${source.name} type`;
      this.description = this.type()?.description ?? '';
      this.telemetryKey =
        this.type()?.telemetryKey ??
        (source.kind === 'pump' ? 'running' : source.kind === 'tank' ? 'level' : 'position');
      this.color = source.color;
      this.text = source.text;
      this.width = source.width;
      this.height = source.height;
      this.cdr.detectChanges();
    });
  }
  save() {
    try {
      if (!this.name.trim() || !this.telemetryKey.trim())
        throw new Error('Enter a type name and default telemetry key.');
      const template = faceplateTemplateSchema.parse({
        ...captureFaceplate(this.source()),
        color: this.color,
        text: this.text,
        width: this.width,
        height: this.height,
      });
      this.saved.emit({
        name: this.name.trim(),
        description: this.description,
        telemetryKey: this.telemetryKey.trim(),
        template,
      });
    } catch {
      this.error.set('Check the name, telemetry key, colour and component dimensions.');
    }
  }
}

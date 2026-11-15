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
import type { Screen } from '@twynix/model';
import { ModalDirective } from './modal.directive';
@Component({
  selector: 'tx-screen-editor',
  standalone: true,
  imports: [FormsModule, ModalDirective],
  template: `<dialog
    txModal
    class="modal screen-dialog"
    (close)="closed.emit()"
    aria-labelledby="screen-dialog-title"
  >
    <span class="eyebrow">SCREEN SETTINGS</span>
    <h2 id="screen-dialog-title">{{ screen() ? 'Edit screen' : 'New screen' }}</h2>
    <form (ngSubmit)="save()">
      <label
        >Screen name<input name="name" [(ngModel)]="name" maxlength="100" required autofocus
      /></label>
      <label
        >Target display<select
          name="preset"
          aria-label="Target display"
          [(ngModel)]="preset"
          (ngModelChange)="choosePreset($event)"
        >
          <option value="custom">Custom screen size</option>
          @for (size of presets; track size.id) {
            <option [value]="size.id">
              {{ size.label }} · {{ size.width }} × {{ size.height }}
            </option>
          }
        </select></label
      >
      <div class="field-grid">
        <label
          >Width (px)<input
            name="width"
            type="number"
            [(ngModel)]="width"
            (ngModelChange)="preset = 'custom'"
            min="400"
            max="4000"
            required /></label
        ><label
          >Height (px)<input
            name="height"
            type="number"
            [(ngModel)]="height"
            (ngModelChange)="preset = 'custom'"
            min="300"
            max="4000"
            required
        /></label>
      </div>
      <div class="target-display-preview">
        <div
          class="target-display-outline"
          [style.width.px]="previewWidth()"
          [style.height.px]="previewHeight()"
        ></div>
        <span>{{ width }} × {{ height }} px</span>
      </div>
      <p class="field-hint">
        This is the complete work area. Rulers, grid and component positions use the target
        display's pixels. Existing components must fit inside it.
      </p>
      @if (error()) {
        <div class="inline-error" role="alert">{{ error() }}</div>
      }
      <div class="modal-actions">
        <button type="button" class="button secondary" (click)="closed.emit()">Cancel</button
        ><button type="submit" class="button primary">
          {{ screen() ? 'Apply changes' : 'Create screen' }}
        </button>
      </div>
    </form>
  </dialog>`,
})
export class ScreenEditorComponent {
  readonly screen = input<Screen | null>(null);
  readonly existingCount = input(0);
  readonly saved = output<{ name: string; width: number; height: number }>();
  readonly closed = output<void>();
  readonly error = signal('');
  name = '';
  width = 1920;
  height = 1080;
  preset = 'full-hd';
  readonly presets = [
    { id: 'panel-small', label: 'HMI panel', width: 800, height: 480 },
    { id: 'panel-xga', label: 'XGA panel', width: 1024, height: 768 },
    { id: 'panel-wide', label: 'Wide panel', width: 1280, height: 800 },
    { id: 'hd', label: 'HD', width: 1280, height: 720 },
    { id: 'laptop', label: 'Wide display', width: 1366, height: 768 },
    { id: 'full-hd', label: 'Full HD', width: 1920, height: 1080 },
    { id: 'wuxga', label: 'WUXGA', width: 1920, height: 1200 },
    { id: 'qhd', label: 'QHD', width: 2560, height: 1440 },
    { id: 'uhd', label: '4K UHD', width: 3840, height: 2160 },
  ];
  choosePreset(id: string) {
    const size = this.presets.find((size) => size.id === id);
    if (size) {
      this.width = size.width;
      this.height = size.height;
    }
  }
  previewWidth() {
    return Math.min(160, (90 * Math.max(1, this.width)) / Math.max(1, this.height));
  }
  previewHeight() {
    return Math.min(90, (160 * Math.max(1, this.height)) / Math.max(1, this.width));
  }
  private readonly cdr = inject(ChangeDetectorRef);
  constructor() {
    afterNextRender(() => {
      this.name = this.screen()?.name ?? `Screen ${this.existingCount() + 1}`;
      this.width = this.screen()?.width ?? 1920;
      this.height = this.screen()?.height ?? 1080;
      this.preset =
        this.presets.find((size) => size.width === this.width && size.height === this.height)?.id ??
        'custom';
      this.cdr.detectChanges();
    });
  }
  save() {
    if (
      !this.name.trim() ||
      !Number.isFinite(this.width) ||
      !Number.isFinite(this.height) ||
      !Number.isInteger(this.width) ||
      !Number.isInteger(this.height) ||
      this.width < 400 ||
      this.width > 4000 ||
      this.height < 300 ||
      this.height > 4000
    ) {
      this.error.set('Enter a name and dimensions between 400 × 300 and 4000 × 4000.');
      return;
    }
    if (
      this.screen()?.widgets.some(
        (widget) => widget.x + widget.width > this.width || widget.y + widget.height > this.height,
      )
    ) {
      this.error.set('These dimensions would clip existing components. Move or resize them first.');
      return;
    }
    this.saved.emit({ name: this.name.trim(), width: this.width, height: this.height });
  }
}

import { Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorStore } from './editor.store';
import { SelectionToolsComponent } from './selection-tools.component';
import { IconComponent } from './icon.component';
@Component({
  selector: 'tx-multi-inspector',
  standalone: true,
  imports: [FormsModule, SelectionToolsComponent, IconComponent],
  template: `<div class="multi-inspector">
    <div class="selected-summary">
      <span class="selected-glyph"><tx-icon name="group" /></span>
      <div>
        <b>{{ store.selectedWidgets().length }} components</b
        ><small>{{ groupName() ? 'Group · ' + groupName() : 'Multiple selection' }}</small>
      </div>
    </div>
    <div class="multi-inspector-body">
      @if (!store.canTransform()) {
        <div class="info-note">
          This selection includes locked components. Unlock the selection to transform it.
        </div>
        <button class="button secondary full" (click)="unlock()">Unlock selection</button>
      }
      @if (groupName()) {
        <label
          >Group name<input
            maxlength="100"
            [ngModel]="groupName()"
            (change)="rename($any($event.target).value)"
            [disabled]="!editable() || !store.canTransform()"
        /></label>
      }
      @if (store.selectionBounds(); as box) {
        <div class="section-heading"><span>SELECTION BOUNDS</span><span>px</span></div>
        <div class="field-grid">
          @for (field of fields; track field.key) {
            <label
              >{{ field.label
              }}<input
                type="number"
                [ngModel]="precision(box[field.key])"
                [disabled]="!editable() || !store.canTransform()"
                (change)="geometry.emit({ key: field.key, value: $any($event.target).value })"
                (keydown.enter)="
                  $event.preventDefault();
                  geometry.emit({ key: field.key, value: $any($event.target).value });
                  $any($event.target).blur()
                "
            /></label>
          }
        </div>
      }
      <div class="section-heading divided"><span>ARRANGE</span></div>
      <tx-selection-tools [editable]="editable()" />
      <div class="section-heading divided"><span>SHARED APPEARANCE</span></div>
      <label
        >Accent colour
        <div class="multi-color">
          <input
            type="color"
            [ngModel]="commonColor() ?? '#329c8c'"
            [disabled]="!editable() || !store.canTransform()"
            (ngModelChange)="store.updateSelection({ color: $event })"
          /><span>{{ commonColor() ?? 'Mixed colours' }}</span>
        </div></label
      >
      <p class="field-hint">
        Changes apply to every unlocked component. Bound colours retain their binding.
      </p>
      <div class="selection-actions">
        <button class="button secondary" [disabled]="!editable()" (click)="store.duplicate()">
          <tx-icon name="copy" />Duplicate</button
        ><button
          class="delete-button"
          aria-label="Delete selection"
          [disabled]="!editable() || !store.canTransform()"
          (click)="store.delete()"
        >
          <tx-icon name="delete" />
        </button>
      </div>
      <div class="info-note">
        Select one component to edit telemetry bindings, events, scripts or faceplate parameters.
        Option/Alt-click a grouped component to select it directly.
      </div>
    </div>
  </div>`,
})
export class MultiInspectorComponent {
  readonly store = inject(EditorStore);
  readonly editable = input(true);
  readonly geometry = output<{ key: 'x' | 'y' | 'width' | 'height'; value: string }>();
  readonly fields = [
    { key: 'x', label: 'X position' },
    { key: 'y', label: 'Y position' },
    { key: 'width', label: 'Width' },
    { key: 'height', label: 'Height' },
  ] as const;
  readonly groupName = computed(() => {
    const widgets = this.store.selectedWidgets(),
      id = widgets[0]?.groupId;
    return id && widgets.every((widget) => widget.groupId === id)
      ? this.store.screen().groups[id]
      : null;
  });
  readonly commonColor = computed(() => {
    const widgets = this.store.selectedWidgets();
    return widgets.every((widget) => widget.color === widgets[0]?.color) ? widgets[0]?.color : null;
  });
  precision(value: number) {
    return Math.round(value * 100) / 100;
  }
  rename(name: string) {
    const id = this.store.selectedWidgets()[0]?.groupId;
    if (id) this.store.renameGroup(id, name);
  }
  unlock() {
    this.store.replaceWidgets(
      this.store.selectedWidgets().map((widget) => ({ ...widget, locked: false })),
      true,
      'Unlock selection',
    );
  }
}

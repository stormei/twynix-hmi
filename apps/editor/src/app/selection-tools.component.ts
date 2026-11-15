import { Component, computed, inject, input } from '@angular/core';
import { selectionUnits } from '../../../../packages/editor/src/geometry';
import { EditorStore } from './editor.store';
import { IconComponent } from './icon.component';
@Component({
  selector: 'tx-selection-tools',
  standalone: true,
  imports: [IconComponent],
  template: `<div class="selection-tools" aria-label="Selection arrangement">
    <button
      class="tool-button"
      aria-label="Distribute horizontally"
      title="Distribute horizontal spacing"
      [disabled]="!editable() || !store.canTransform() || unitCount() < 3"
      (click)="store.distribute('horizontal')"
    >
      <tx-icon name="distribute-horizontal" />
    </button>
    <button
      class="tool-button"
      aria-label="Distribute vertically"
      title="Distribute vertical spacing"
      [disabled]="!editable() || !store.canTransform() || unitCount() < 3"
      (click)="store.distribute('vertical')"
    >
      <tx-icon name="distribute-vertical" />
    </button>
    <span class="tool-divider"></span>
    <button
      class="tool-button"
      aria-label="Group selection"
      title="Group selection (⌘G)"
      [disabled]="!editable() || !store.canTransform() || unitCount() < 2"
      (click)="store.group()"
    >
      <tx-icon name="group" />
    </button>
    <button
      class="tool-button"
      aria-label="Ungroup selection"
      title="Ungroup (⇧⌘G)"
      [disabled]="!editable() || !store.canTransform() || !hasGroup()"
      (click)="store.ungroup()"
    >
      <tx-icon name="ungroup" />
    </button>
  </div>`,
})
export class SelectionToolsComponent {
  readonly store = inject(EditorStore);
  readonly editable = input(true);
  readonly unitCount = computed(() => selectionUnits(this.store.selectedWidgets()).length);
  readonly hasGroup = computed(() => this.store.selectedWidgets().some((widget) => widget.groupId));
}

import { Component, input, output } from '@angular/core';
import type { Widget } from '@twynix/model';
import { IconComponent } from './icon.component';
@Component({
  selector: 'tx-layer-row',
  standalone: true,
  imports: [IconComponent],
  template: `<div
    class="layer-row"
    role="treeitem"
    [attr.aria-selected]="selected()"
    tabindex="0"
    [class.selected]="selected()"
    [class.layer-locked]="widget().locked"
    [class.layer-hidden]="!widget().visible"
    (click)="chosen.emit($event)"
    (keydown.enter)="chosen.emit($any($event))"
    (contextmenu)="menu.emit($event)"
  >
    <tx-icon [name]="widget().faceplate ? 'faceplate' : widget().kind" />
    <span class="layer-name" [title]="widget().name">{{ widget().name }}</span>
    <button
      class="layer-action"
      [attr.aria-label]="(widget().visible ? 'Hide ' : 'Show ') + widget().name"
      [title]="widget().visible ? 'Hide in Preview and Runtime' : 'Show in Preview and Runtime'"
      (click)="$event.stopPropagation(); visibility.emit()"
    >
      <tx-icon [name]="widget().visible ? 'eye' : 'eye-off'" />
    </button>
    <button
      class="layer-action"
      [attr.aria-label]="(widget().locked ? 'Unlock ' : 'Lock ') + widget().name"
      [title]="widget().locked ? 'Unlock component' : 'Lock component'"
      (click)="$event.stopPropagation(); lock.emit()"
    >
      <tx-icon [name]="widget().locked ? 'lock' : 'unlock'" />
    </button>
  </div>`,
})
export class LayerRowComponent {
  readonly widget = input.required<Widget>();
  readonly selected = input(false);
  readonly chosen = output<MouseEvent | KeyboardEvent>();
  readonly visibility = output<void>();
  readonly lock = output<void>();
  readonly menu = output<MouseEvent>();
}

import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';
export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
}
@Component({
  selector: 'tx-context-menu',
  standalone: true,
  template: `<div
    #menu
    class="editor-context-menu"
    role="menu"
    [style.left.px]="x()"
    [style.top.px]="y()"
    (keydown)="key($event)"
  >
    @for (item of items(); track item.id) {
      <button
        role="menuitem"
        [disabled]="item.disabled"
        [class.menu-danger]="item.danger"
        (click)="chosen.emit(item.id)"
      >
        <span>{{ item.label }}</span><kbd>{{ item.shortcut }}</kbd>
      </button>
    }
  </div>`,
})
export class ContextMenuComponent {
  readonly x = input(0);
  readonly y = input(0);
  readonly items = input.required<MenuItem[]>();
  readonly chosen = output<string>();
  readonly closed = output<void>();
  readonly menu = viewChild.required<ElementRef<HTMLElement>>('menu');
  constructor() {
    afterNextRender(() =>
      this.menu().nativeElement.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(),
    );
  }
  key(event: KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      this.closed.emit();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [
      ...this.menu().nativeElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
}

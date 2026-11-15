import { Component, ElementRef, HostListener, input, signal, viewChild } from '@angular/core';
import { IconComponent } from './icon.component';

/** Native disclosure menu with outside-click dismissal and keyboard navigation. */
@Component({
  selector: 'tx-dropdown',
  standalone: true,
  imports: [IconComponent],
  template: `<details
    #menu
    class="studio-dropdown"
    [class.menu-align-end]="alignEnd()"
    (toggle)="open.set(menu.open)"
    (keydown)="key($event)"
    (click)="activate($event)"
  >
    <summary
      role="button"
      [attr.aria-label]="label()"
      [attr.title]="hint() || label()"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [class.icon-only]="iconOnly()"
    >
      @if (icon()) {
        <tx-icon [name]="icon()" />
      }
      @if (!iconOnly()) {
        <span>{{ label() }}</span><tx-icon name="chevron" />
      }
    </summary>
    <div class="studio-menu" role="menu" [attr.aria-label]="label()"><ng-content /></div>
  </details>`,
})
export class DropdownComponent {
  readonly label = input.required<string>();
  readonly hint = input('');
  readonly icon = input('');
  readonly iconOnly = input(false);
  readonly alignEnd = input(false);
  readonly open = signal(false);
  readonly menu = viewChild.required<ElementRef<HTMLDetailsElement>>('menu');
  @HostListener('document:pointerdown', ['$event']) outside(event: PointerEvent) {
    if (!this.menu().nativeElement.contains(event.target as Node))
      this.menu().nativeElement.open = false;
  }
  activate(event: MouseEvent) {
    const button = (event.target as Element).closest('button');
    if (button && !button.disabled && !button.hasAttribute('data-keep-open'))
      this.menu().nativeElement.open = false;
  }
  key(event: KeyboardEvent) {
    const menu = this.menu().nativeElement;
    const summary = menu.querySelector<HTMLElement>('summary')!;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      summary.focus();
      return;
    }
    if (event.key === 'Tab') {
      menu.open = false;
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const wasOpen = menu.open;
    menu.open = true;
    requestAnimationFrame(() => {
      const buttons = [
        ...menu.querySelectorAll<HTMLButtonElement>('.studio-menu button:not(:disabled)'),
      ];
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const index =
        event.key === 'Home'
          ? 0
          : event.key === 'End' || (!wasOpen && event.key === 'ArrowUp')
            ? buttons.length - 1
            : current < 0
              ? 0
              : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index].focus();
    });
  }
}

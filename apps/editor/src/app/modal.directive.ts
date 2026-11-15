import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';
/** Native modal semantics provide focus containment, Escape dismissal and focus restoration. */
@Directive({ selector: 'dialog[txModal]', standalone: true })
export class ModalDirective {
  private readonly element = inject(ElementRef<HTMLDialogElement>);
  constructor() {
    afterNextRender(() => {
      if (!this.element.nativeElement.open) this.element.nativeElement.showModal();
    });
  }
}

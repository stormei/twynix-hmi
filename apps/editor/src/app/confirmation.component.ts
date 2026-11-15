import { Component, input, output } from '@angular/core';
import { ModalDirective } from './modal.directive';
@Component({
  selector: 'tx-confirmation',
  standalone: true,
  imports: [ModalDirective],
  template: `<dialog
    txModal
    class="modal confirmation-modal"
    (close)="decision.emit(false)"
    aria-labelledby="confirmation-title"
  >
    <h2 id="confirmation-title">{{ title() }}</h2>
    <p>{{ message() }}</p>
    <div class="modal-actions">
      <button class="button secondary" autofocus (click)="decision.emit(false)">Cancel</button
      ><button
        class="button"
        [class.primary]="!danger()"
        [class.danger-button]="danger()"
        (click)="decision.emit(true)"
      >
        {{ confirmLabel() }}
      </button>
    </div>
  </dialog>`,
})
export class ConfirmationComponent {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Continue');
  readonly danger = input(false);
  readonly decision = output<boolean>();
}

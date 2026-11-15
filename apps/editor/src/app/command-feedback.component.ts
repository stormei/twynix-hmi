import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommandStateService } from './command-state.service';
import { ModalDirective } from './modal.directive';
import type { Widget } from '@twynix/model';
import { CommandHistoryComponent } from './command-history/command-history.component';
@Component({
  selector: 'tx-command-feedback',
  standalone: true,
  imports: [FormsModule, ModalDirective, CommandHistoryComponent],
  template: `@if (historyWidgets().length) {
      <tx-command-history [widgets]="historyWidgets()" />
    }
    @if (commands.current(); as record) {
      <section
        class="command-feedback"
        [style.right.px]="rightInset()"
        aria-label="Command feedback"
        aria-live="polite"
        [class.error]="['invalid', 'denied', 'failed', 'timeout'].includes(record.phase)"
      >
        <header>
          <strong>{{ record.name }} · {{ record.phase }}</strong
          ><small>{{ record.simulated ? 'PREVIEW · NO COMMAND SENT' : 'RUNTIME' }}</small
          ><button
            type="button"
            aria-label="Dismiss command feedback"
            [disabled]="commands.busy()"
            (click)="commands.reset()"
          >
            ×
          </button>
        </header>
        <p>{{ record.message }}</p>
        <dl>
          <dt>Requested</dt>
          <dd>{{ display(record.requested) }}</dd>
          <dt>{{ record.simulated ? 'Simulated reported' : 'Reported' }}</dt>
          <dd>{{ display(record.reported) }} · {{ record.quality }}</dd>
        </dl>
      </section>
    }
    @if (commands.pending(); as pending) {
      <dialog
        txModal
        class="modal command-confirmation"
        aria-label="Confirm command"
        (close)="commands.cancel()"
      >
        <span class="eyebrow">{{
          pending.context.mode === 'preview' ? 'PREVIEW TEST · NO COMMAND SENT' : 'DEVICE COMMAND'
        }}</span>
        <h2>Confirm operation</h2>
        <p>{{ pending.action.confirmation }}</p>
        <p class="field-hint">
          {{ pending.context.widget.name }} · {{ pending.action.method }} ·
          {{ pending.action.deviceId }}
        </p>
        <label
          >Resolved parameters
          <pre>{{ json(pending.params) }}</pre>
        </label>
        @if (pending.context.mode === 'preview') {
          <label
            >Simulate result<select
              aria-label="Simulate result"
              [(ngModel)]="commands.simulationResult"
            >
              <option value="confirmed">Reply and matching reported value</option>
              <option value="accepted">Reply only</option>
              <option value="failed">Device failure</option>
              <option value="timeout">Timeout / unknown outcome</option>
            </select></label
          >
        }
        <div class="info-note">
          A device reply is separate from reported equipment state. Commands are never automatically
          retried.
        </div>
        <div class="modal-actions">
          <button type="button" class="button secondary" (click)="commands.cancel()">Cancel</button
          ><button type="button" class="button primary" (click)="commands.confirm()">
            {{ pending.context.mode === 'preview' ? 'Simulate command' : 'Send command' }}
          </button>
        </div>
      </dialog>
    }`,
  styles: [
    `
      :host {
        display: contents;
      }
      .command-feedback {
        position: fixed;
        bottom: 52px;
        right: 24px;
        z-index: 110;
        max-width: 420px;
        width: calc(100vw - 48px);
        padding: 14px 16px;
        border: 1px solid #adc9da;
        border-left: 3px solid #267c91;
        border-radius: 6px;
        background: #fff;
        box-shadow: 0 4px 20px #17364d20;
        color: #19374c;
        font: 12px system-ui;
      }
      header {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      header strong {
        flex: 1;
      }
      header small {
        font-size: 9px;
        color: #617b8e;
      }
      header button {
        border: 0;
        background: none;
        color: #617b8e;
        font-size: 18px;
        cursor: pointer;
      }
      .error {
        border-left-color: #b84646;
      }
      p {
        line-height: 1.5;
        margin: 10px 0;
      }
      dl {
        display: grid;
        grid-template-columns: 110px 1fr;
        gap: 6px;
        margin: 0;
        font-size: 11px;
      }
      dt {
        color: #647c8d;
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .command-confirmation {
        width: min(560px, 90vw);
      }
      pre {
        padding: 12px;
        background: #f1f5f8;
        border: 1px solid #d6e1e9;
        border-radius: 4px;
        font: 12px monospace;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class CommandFeedbackComponent {
  readonly commands = inject(CommandStateService);
  readonly rightInset = input(24);
  readonly historyWidgets = input<Widget[]>([]);
  display(value: unknown) {
    return value === undefined || value === null
      ? '—'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  }
  json(value: unknown) {
    return JSON.stringify(value, null, 2);
  }
}

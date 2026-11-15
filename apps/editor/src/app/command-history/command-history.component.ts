import { Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { Widget } from '@twynix/model';
import { CommandRuntimeService, type SimulationResult } from '../command-runtime.service';

/** Session-only Preview history; never an equipment audit log. */
@Component({
  selector: 'tx-command-history',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './command-history.component.html',
  styleUrl: './command-history.component.css',
})
export class CommandHistoryComponent {
  readonly widgets = input.required<Widget[]>();
  private readonly commands = inject(CommandRuntimeService);
  readonly entries = computed(() => {
    const ids = new Set(this.widgets().map((widget) => widget.id));
    return this.commands.history().filter((entry) => ids.has(entry.widgetId));
  });
  readonly outcomes: Record<SimulationResult, string> = {
    confirmed: 'Reply + matching value',
    accepted: 'Reply only',
    failed: 'Device failure',
    timeout: 'Timeout / unknown',
  };
  display(value: unknown) {
    return value === undefined || value === null ? '—' : JSON.stringify(value);
  }
}

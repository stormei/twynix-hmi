import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Widget } from '@twynix/model';
import { CommandRuntimeService } from '../command-runtime.service';
import { commandHistoryCsv, SIMULATION_LABELS } from './command-history-csv';
import { createSampleHistory } from './command-history-samples';
import { CommandStateService } from '../command-state.service';

/** Session-only Preview history; never an equipment audit log. */
@Component({
  selector: 'tx-command-history',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './command-history.component.html',
  styleUrl: './command-history.component.css',
})
export class CommandHistoryComponent {
  readonly widgets = input.required<Widget[]>();
  private readonly commands = inject(CommandRuntimeService);
  constructor() {
    // Preview history can load the engine before the first interactive command.
    inject(CommandStateService).engine.set(this.commands);
  }
  readonly control = signal('');
  readonly result = signal('');
  readonly exportError = signal('');
  readonly entries = computed(() => {
    const ids = new Set(this.widgets().map((widget) => widget.id));
    return this.commands.history().filter((entry) => ids.has(entry.widgetId));
  });
  readonly outcomes = SIMULATION_LABELS;
  readonly undoCount = computed(() => {
    const ids = new Set(this.widgets().map((widget) => widget.id));
    return this.commands.clearedEntries().filter((entry) => ids.has(entry.widgetId)).length;
  });
  readonly filteredEntries = computed(() =>
    this.entries().filter(
      (entry) =>
        (!this.control() || entry.widgetId === this.control()) &&
        (!this.result() ||
          entry.phase === this.result() ||
          `simulation:${entry.simulationResult}` === this.result()),
    ),
  );
  clearFilters() {
    this.control.set('');
    this.result.set('');
  }
  clearHistory() {
    this.commands.clearHistory(this.widgets().map((widget) => widget.id));
    this.exportError.set('');
  }
  undoClearHistory() {
    this.commands.undoClearHistory(this.widgets().map((widget) => widget.id));
    this.exportError.set('');
  }
  loadSampleHistory() {
    this.commands.clearedEntries.set([]);
    const samples = createSampleHistory(this.widgets());
    const ids = new Set(this.widgets().map((widget) => widget.id));
    this.commands.history.update((entries) =>
      [...samples, ...entries.filter((entry) => !entry.sample || !ids.has(entry.widgetId))].slice(
        0,
        100,
      ),
    );
    this.clearFilters();
    this.exportError.set('');
  }
  exportCsv() {
    const entries = this.filteredEntries();
    if (!entries.length) return;
    this.exportError.set('');
    try {
      const blob = new Blob([commandHistoryCsv(entries)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `twynix-preview-history-${new Date().toISOString().replaceAll(':', '-')}.csv`;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      this.exportError.set('CSV export could not start. Your history is unchanged. Try again.');
    }
  }
  display(value: unknown) {
    return value === undefined || value === null ? '—' : JSON.stringify(value);
  }
}

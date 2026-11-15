import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Binding, SourceCatalog, SourceKey } from '@twynix/model';
import { ApiService, type Entity } from './api.service';

export interface BrowserSource {
  entityId: string;
  entityType: Binding['entityType'];
  key: string;
  dataType: NonNullable<Binding['dataType']>;
}
@Component({
  selector: 'tx-data-browser',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './data-browser.component.html',
  styleUrl: './data-browser.component.css',
})
export class DataBrowserComponent {
  readonly api = inject(ApiService);
  readonly entityOnly = input(false);
  readonly staleAfterMs = input(30000);
  readonly sourceSelected = output<BrowserSource>();
  readonly entitySelected = output<{ entityId: string; entityType: Binding['entityType'] }>();
  readonly entityType = signal<Binding['entityType']>('DEVICE');
  readonly entities = signal<Entity[]>([]);
  readonly selected = signal<Entity | null>(null);
  readonly catalog = signal<SourceCatalog | null>(null);
  readonly chosen = signal<BrowserSource | null>(null);
  readonly sample = signal<SourceKey | null>(null);
  readonly busy = signal(false);
  readonly loadingKeys = signal(false);
  readonly error = signal('');
  readonly searched = signal(false);
  readonly page = signal(0);
  readonly hasNext = signal(false);
  readonly branches = [
    { type: 'TIME_SERIES' as const, label: 'Telemetry' },
    { type: 'ATTRIBUTE' as const, label: 'Attributes' },
  ];
  search = '';
  keyFilter = '';
  private generation = 0;
  private keysGeneration = 0;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.keysGeneration++;
    });
  }
  changeType(type: Binding['entityType']) {
    this.entityType.set(type);
    this.entities.set([]);
    this.clearSelection();
    void this.browse();
  }
  private clearSelection() {
    this.keysGeneration++;
    this.selected.set(null);
    this.catalog.set(null);
    this.chosen.set(null);
    this.sample.set(null);
  }
  async browse(page = 0) {
    if (!this.api.user()) return;
    const generation = ++this.generation;
    this.clearSelection();
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.entityPage(this.entityType(), this.search, page);
      if (generation !== this.generation) return;
      this.entities.set(result.entities);
      this.hasNext.set(result.hasNext);
      this.page.set(page);
      this.searched.set(true);
    } catch (error) {
      if (generation === this.generation)
        this.error.set(error instanceof Error ? error.message : 'Unable to browse sources.');
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
  async select(entity: Entity) {
    this.clearSelection();
    const generation = ++this.keysGeneration;
    this.selected.set(entity);
    this.error.set('');
    this.keyFilter = '';
    this.entitySelected.emit({ entityId: entity.id, entityType: this.entityType() });
    if (this.entityOnly()) return;
    this.loadingKeys.set(true);
    try {
      const catalog = await this.api.sourceCatalog(this.entityType(), entity.id);
      if (generation === this.keysGeneration) this.catalog.set(catalog);
    } catch (error) {
      if (generation === this.keysGeneration)
        this.error.set(error instanceof Error ? error.message : 'Unable to load sources.');
    } finally {
      if (generation === this.keysGeneration) this.loadingKeys.set(false);
    }
  }
  rows(type: 'TIME_SERIES' | 'ATTRIBUTE') {
    const rows = type === 'TIME_SERIES' ? this.catalog()?.telemetry : this.catalog()?.attributes;
    return (rows ?? []).filter((row) =>
      row.key.toLowerCase().includes(this.keyFilter.toLowerCase()),
    );
  }
  choose(row: SourceKey, dataType: BrowserSource['dataType']) {
    const entity = this.selected();
    if (!entity) return;
    this.sample.set(row);
    this.chosen.set({ entityId: entity.id, entityType: this.entityType(), key: row.key, dataType });
  }
  apply() {
    const source = this.chosen();
    if (source) this.sourceSelected.emit(source);
  }
  quality(row: SourceKey) {
    return row.timestamp === null
      ? 'unknown'
      : Date.now() - row.timestamp > this.staleAfterMs()
        ? 'stale'
        : 'available';
  }
  display(value: unknown) {
    if (value === undefined || value === null) return '—';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return text.length > 120 ? text.slice(0, 117) + '…' : text;
  }
}

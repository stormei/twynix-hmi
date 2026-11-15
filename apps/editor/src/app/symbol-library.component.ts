import { Component, computed, input, output, model } from '@angular/core';
import {
  instrumentFunctions,
  isDashboardKind,
  newWidget,
  widgetKinds,
  type InstrumentFunction,
  type SymbolStyle,
  type WidgetKind,
  type Widget,
} from '@twynix/model';
import { IconComponent } from './icon.component';
import { SymbolComponent } from './symbol.component';
import { dashboardRegistry } from './dashboard/widget-registry';
import { instrumentLabels, symbolCategories } from './symbol-catalog';

@Component({
  selector: 'tx-symbol-library',
  standalone: true,
  imports: [IconComponent, SymbolComponent],
  templateUrl: './symbol-library.component.html',
  styleUrl: './symbol-library.component.css',
})
export class SymbolLibraryComponent {
  readonly labels = input.required<Record<WidgetKind, string>>();
  readonly editable = input(true);
  readonly visualStyle = input<SymbolStyle>('industrial');
  readonly chosen = output<WidgetKind>();
  readonly instrumentChosen = output<InstrumentFunction>();
  readonly exampleRequested = output<void>();
  readonly commandExampleRequested = output<void>();
  readonly dragStarted = output<{ event: DragEvent; kind: WidgetKind }>();
  readonly query = model('');
  readonly expanded = model<string[]>(['dashboard']);
  readonly registry = dashboardRegistry;
  readonly instrumentLabels = instrumentLabels;
  readonly isDashboardKind = isDashboardKind;
  readonly palette: Record<WidgetKind, Widget> = Object.fromEntries(
    widgetKinds.map((kind, index) => {
      const widget = newWidget(kind, index);
      widget.name = kind === 'value' ? 'Pressure' : kind === 'trend' ? 'Process trend' : kind;
      widget.text =
        (
          {
            tank: 'TK-101',
            pump: 'P-101',
            valve: 'FV-101',
            button: 'Operate',
            label: 'Label',
          } as Partial<Record<WidgetKind, string>>
        )[kind] ?? widget.text;
      return [kind, widget];
    }),
  ) as Record<WidgetKind, Widget>;
  readonly matches = computed(() => {
    const query = this.query().trim().toLowerCase();
    return symbolCategories
      .map((category) => {
        const categoryMatches =
          `${category.label} ${category.id === 'inputs' ? 'command Preview example validation' : ''}`
            .toLowerCase()
            .includes(query);
        const kinds = category.kinds.filter(
          (kind) =>
            !query ||
            categoryMatches ||
            `${this.labels()[kind]} ${kind} ${isDashboardKind(kind) ? dashboardRegistry[kind].description : ''}`
              .toLowerCase()
              .includes(query),
        );
        const presets =
          category.id === 'instruments'
            ? instrumentFunctions.filter(
                (code) =>
                  !query ||
                  categoryMatches ||
                  `${code} ${instrumentLabels[code]}`.toLowerCase().includes(query),
              )
            : [];
        return { ...category, kinds, presets, count: kinds.length + presets.length };
      })
      .filter((category) => category.count > 0);
  });
  isOpen(id: string) {
    return !!this.query().trim() || this.expanded().includes(id);
  }
  toggle(id: string) {
    this.expanded.update((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
}

import type { WidgetKind } from '@twynix/model';

/** Library navigation is metadata, independent of how any symbol is rendered. */
export const symbolCategories: { id: string; label: string; icon: string; kinds: WidgetKind[] }[] =
  [
    {
      id: 'dashboard',
      label: 'Dashboard widgets',
      icon: 'chart',
      kinds: ['chart', 'gauge', 'sparkline', 'linear-gauge', 'markdown', 'iframe', 'html'],
    },
    {
      id: 'inputs',
      label: 'Input controls',
      icon: 'slider',
      kinds: ['dropdown', 'slider', 'radio', 'toggle', 'segmented'],
    },
    {
      id: 'equipment',
      label: 'Process equipment',
      icon: 'pump',
      kinds: ['tank', 'pump', 'valve', 'motor', 'fan', 'conveyor'],
    },
    {
      id: 'piping',
      label: 'Pipes & connections',
      icon: 'pipe',
      kinds: ['pipe', 'elbow', 'tee', 'connector'],
    },
    {
      id: 'instruments',
      label: 'Instruments & ISA',
      icon: 'instrument',
      kinds: ['sensor', 'instrument'],
    },
    {
      id: 'displays',
      label: 'Displays & controls',
      icon: 'value',
      kinds: ['value', 'trend', 'label', 'button'],
    },
  ];
export const instrumentLabels: Record<string, string> = {
  PT: 'Pressure transmitter',
  TT: 'Temperature transmitter',
  FT: 'Flow transmitter',
  LT: 'Level transmitter',
  PI: 'Pressure indicator',
  TI: 'Temperature indicator',
  FI: 'Flow indicator',
  LI: 'Level indicator',
  PIC: 'Pressure indicating controller',
  TIC: 'Temperature indicating controller',
  FIC: 'Flow indicating controller',
  LIC: 'Level indicating controller',
};

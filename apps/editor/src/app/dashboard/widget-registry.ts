import type { Type } from '@angular/core';
import type { DashboardKind } from '@twynix/model';
import type { DashboardWidgetInputs } from './shared/widget-inputs';

export interface WidgetField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'select' | 'textarea' | 'options';
  options?: string[];
}
export interface WidgetDefinition {
  label: string;
  description: string;
  loadComponent: () => Promise<Type<DashboardWidgetInputs>>;
  fields: WidgetField[];
}
/** One registration per independently owned component; editor code does not render widget internals. */
export const dashboardRegistry: Record<DashboardKind, WidgetDefinition> = {
  chart: {
    label: 'Chart',
    description: 'Live line, area or bar chart',
    loadComponent: () =>
      import('./chart/chart.component').then((module) => module.ChartWidgetComponent),
    fields: [
      { key: 'style', label: 'Chart style', type: 'select', options: ['line', 'area', 'bar'] },
      { key: 'autoScale', label: 'Automatic scale', type: 'checkbox' },
      { key: 'minimum', label: 'Axis minimum', type: 'number' },
      { key: 'maximum', label: 'Axis maximum', type: 'number' },
      { key: 'showGrid', label: 'Chart grid', type: 'checkbox' },
    ],
  },
  gauge: {
    label: 'Gauge',
    description: 'Value, range and thresholds',
    loadComponent: () =>
      import('./gauge/gauge.component').then((module) => module.GaugeWidgetComponent),
    fields: [
      { key: 'minimum', label: 'Gauge minimum', type: 'number' },
      { key: 'maximum', label: 'Gauge maximum', type: 'number' },
      { key: 'warning', label: 'Warning threshold', type: 'number' },
      { key: 'critical', label: 'Critical threshold', type: 'number' },
      { key: 'unit', label: 'Gauge unit', type: 'text' },
    ],
  },
  dropdown: {
    label: 'Dropdown',
    description: 'Choose a labeled value',
    loadComponent: () =>
      import('./dropdown/dropdown.component').then((module) => module.DropdownWidgetComponent),
    fields: [{ key: 'options', label: 'Options (value = Label)', type: 'options' }],
  },
  slider: {
    label: 'Slider',
    description: 'Adjust a numeric setpoint',
    loadComponent: () =>
      import('./slider/slider.component').then((module) => module.SliderWidgetComponent),
    fields: [
      { key: 'minimum', label: 'Slider minimum', type: 'number' },
      { key: 'maximum', label: 'Slider maximum', type: 'number' },
      { key: 'step', label: 'Slider step', type: 'number' },
      { key: 'unit', label: 'Slider unit', type: 'text' },
    ],
  },
  radio: {
    label: 'Radio group',
    description: 'Choose one operating mode',
    loadComponent: () =>
      import('./radio/radio.component').then((module) => module.RadioWidgetComponent),
    fields: [
      { key: 'options', label: 'Options (value = Label)', type: 'options' },
      { key: 'layout', label: 'Radio layout', type: 'select', options: ['horizontal', 'vertical'] },
    ],
  },
  toggle: {
    label: 'Toggle switch',
    description: 'Boolean on/off selection',
    loadComponent: () =>
      import('./toggle/toggle.component').then((module) => module.ToggleWidgetComponent),
    fields: [
      { key: 'onLabel', label: 'On label', type: 'text' },
      { key: 'offLabel', label: 'Off label', type: 'text' },
    ],
  },
  segmented: {
    label: 'Multi-state button',
    description: 'Segmented operating selection',
    loadComponent: () =>
      import('./segmented/segmented.component').then((module) => module.SegmentedWidgetComponent),
    fields: [{ key: 'options', label: 'Options (value = Label)', type: 'options' }],
  },
  sparkline: {
    label: 'Sparkline',
    description: 'Compact live trend and value',
    loadComponent: () =>
      import('./sparkline/sparkline.component').then((module) => module.SparklineWidgetComponent),
    fields: [
      { key: 'showValue', label: 'Show current value', type: 'checkbox' },
      { key: 'fill', label: 'Fill sparkline', type: 'checkbox' },
    ],
  },
  'linear-gauge': {
    label: 'Linear gauge',
    description: 'Horizontal value and thresholds',
    loadComponent: () =>
      import('./linear-gauge/linear-gauge.component').then(
        (module) => module.LinearGaugeWidgetComponent,
      ),
    fields: [
      { key: 'minimum', label: 'Gauge minimum', type: 'number' },
      { key: 'maximum', label: 'Gauge maximum', type: 'number' },
      { key: 'warning', label: 'Warning threshold', type: 'number' },
      { key: 'critical', label: 'Critical threshold', type: 'number' },
      { key: 'unit', label: 'Gauge unit', type: 'text' },
    ],
  },
  markdown: {
    label: 'Markdown',
    description: 'Operator notes and instructions',
    loadComponent: () =>
      import('./markdown/markdown.component').then((module) => module.MarkdownWidgetComponent),
    fields: [{ key: 'content', label: 'Markdown content', type: 'textarea' }],
  },
  iframe: {
    label: 'Embedded page',
    description: 'Sandboxed HTTP or HTTPS page',
    loadComponent: () =>
      import('./iframe/iframe.component').then((module) => module.IframeWidgetComponent),
    fields: [{ key: 'url', label: 'Page URL', type: 'text' }],
  },
  html: {
    label: 'HTML panel',
    description: 'Isolated HTML and CSS content',
    loadComponent: () =>
      import('./html/html.component').then((module) => module.HtmlWidgetComponent),
    fields: [{ key: 'content', label: 'HTML content', type: 'textarea' }],
  },
};

import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createStarterProject, newWidget, projectSchema } from '../../packages/model/src';
import { moveWidgets } from '../../packages/editor/src/geometry';
import { smartAlignment, equalSpacing } from '../../packages/editor/src/smart-guides';

const widgets = Array.from({ length: 500 }, (_, index) => ({
  ...newWidget('value', index),
  x: (index % 20) * 180,
  y: Math.floor(index / 20) * 100,
  width: 130,
  height: 70,
}));
const project = createStarterProject();
project.screens = [
  {
    id: 'benchmark',
    name: 'Synthetic 500-widget screen',
    width: 4000,
    height: 3000,
    groups: {},
    connections: [],
    widgets,
  },
];
const screen = { x: 0, y: 0, width: 4000, height: 3000 };
function measure(label: string, iterations: number, operation: () => void) {
  for (let i = 0; i < 10; i++) operation();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) operation();
  return { label, iterations, totalMs: Number((performance.now() - start).toFixed(2)) };
}
const results = [
  measure('500-widget schema validation', 100, () => {
    projectSchema.parse(project);
  }),
  measure('500-widget snapshot serialization', 200, () => {
    JSON.stringify(structuredClone(project));
  }),
  measure('500-widget movement', 1000, () => {
    moveWidgets(widgets, 10, 10, screen);
  }),
  measure('one dragged symbol / 499 guide references', 200, () => {
    smartAlignment(widgets[0], widgets.slice(1), screen, 5);
    equalSpacing(widgets[0], widgets.slice(1), screen, 5);
  }),
];
mkdirSync('artifacts/benchmarks', { recursive: true });
writeFileSync(
  'artifacts/benchmarks/domain.json',
  JSON.stringify(
    {
      node: process.version,
      fixtureWidgets: 500,
      results,
      limitation:
        'Synthetic domain benchmark; not a browser FPS, network soak or hard real-time guarantee.',
    },
    null,
    2,
  ) + '\n',
);
console.table(results);

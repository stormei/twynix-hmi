import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getQuickJS } from 'quickjs-emscripten';
import {
  evaluateBehavior,
  evaluateExpression,
  evaluateScript,
} from '../../packages/scripting/src/evaluate';
async function main() {
  const engine = await getQuickJS();
  const context = {
    value: 82,
    quality: 'good',
    name: 'Benchmark',
    inputs: {
      primary: { value: 82, quality: 'good' as const, timestamp: 1, unit: '%' },
      secondary: { value: 30, quality: 'good' as const, timestamp: 1, unit: '°' },
    },
  };
  const percentile = (values: number[], fraction: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return Number(
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))].toFixed(3),
    );
  };
  const cases = [
    {
      name: 'appearance',
      evaluate: () =>
        evaluateBehavior(
          engine,
          'return {text:String(inputs.primary.value),color:"#329c8c",position:{offsetX:inputs.secondary.value,offsetY:0},rotation:{offsetDegrees:inputs.primary.value}};',
          context,
        ),
    },
    {
      name: 'legacy effects',
      evaluate: () =>
        evaluateScript(engine, 'hmi.setText(context.value);hmi.setColor("#329c8c");', context),
    },
    {
      name: 'property expression',
      evaluate: () => evaluateExpression(engine, '"Value " + context.value', context),
    },
  ];
  const heapBefore = process.memoryUsage();
  const results = cases.map((test) => {
    for (let warmup = 0; warmup < 20; warmup++) test.evaluate();
    const times: number[] = [];
    for (let iteration = 0; iteration < 200; iteration++) {
      const start = performance.now();
      test.evaluate();
      times.push(performance.now() - start);
    }
    return {
      name: test.name,
      evaluations: times.length,
      p50Ms: percentile(times, 0.5),
      p95Ms: percentile(times, 0.95),
      maxMs: percentile(times, 1),
    };
  });
  const artifact = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    results,
    heapBefore,
    heapAfter: process.memoryUsage(),
    limitation:
      'Fresh-runtime synthetic evaluations on this machine; process memory includes WASM/caches/GC noise, not a leak proof or hard-real-time guarantee.',
  };
  mkdirSync('artifacts/benchmarks', { recursive: true });
  writeFileSync(
    'artifacts/benchmarks/scripting-engine.json',
    JSON.stringify(artifact, null, 2) + '\n',
  );
  console.log(JSON.stringify(artifact, null, 2));
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

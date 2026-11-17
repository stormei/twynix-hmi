/// <reference lib="webworker" />
import { newQuickJSWASMModule, newVariant, RELEASE_SYNC } from 'quickjs-emscripten';
import {
  evaluateBehavior,
  evaluateExpression,
  evaluateScript,
} from '../../../../packages/scripting/src/evaluate';
let engine: ReturnType<typeof newQuickJSWASMModule> | undefined;
function loadEngine() {
  if (!engine)
    engine = newQuickJSWASMModule(
      newVariant(RELEASE_SYNC, {
        wasmLocation: new URL('/assets/emscripten-module.wasm', self.location.origin).href,
      }),
    ).catch((error) => {
      engine = undefined;
      throw error;
    });
  return engine;
}
addEventListener('message', async ({ data }) => {
  try {
    const result =
      data.mode === 'expression'
        ? evaluateExpression(await loadEngine(), data.source, data.context)
        : data.mode === 'behavior'
          ? evaluateBehavior(await loadEngine(), data.source, data.context)
          : evaluateScript(await loadEngine(), data.source, data.context);
    postMessage({ id: data.id, result });
  } catch (error) {
    postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Script failed.' });
  }
});

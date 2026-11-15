/// <reference lib="webworker" />
import { newQuickJSWASMModule, newVariant, RELEASE_SYNC } from 'quickjs-emscripten';
import { evaluateExpression, evaluateScript } from '../../../../packages/scripting/src/evaluate';
const engine = newQuickJSWASMModule(
  newVariant(RELEASE_SYNC, {
    wasmLocation: new URL('/assets/emscripten-module.wasm', self.location.origin).href,
  }),
);
addEventListener('message', async ({ data }) => {
  try {
    const result =
      data.mode === 'expression'
        ? evaluateExpression(await engine, data.source, data.context)
        : evaluateScript(await engine, data.source, data.context);
    postMessage({ id: data.id, result });
  } catch (error) {
    postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Script failed.' });
  }
});

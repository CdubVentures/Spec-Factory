import { renameContextKeys } from '../shared/contextUtils.js';

export function buildRunTraceWriterContext(context = {}) {
  return renameContextKeys(context, {
  "toBool": "toBoolFn",
  "createRuntimeTraceWriter": "createRuntimeTraceWriterFn"
});
}

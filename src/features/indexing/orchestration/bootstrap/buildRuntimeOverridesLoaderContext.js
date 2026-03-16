import { renameContextKeys } from '../shared/contextUtils.js';

export function buildRuntimeOverridesLoaderContext(context = {}) {
  return renameContextKeys(context, {
  "resolveRuntimeControlKey": "resolveRuntimeControlKeyFn",
  "defaultRuntimeOverrides": "defaultRuntimeOverridesFn",
  "normalizeRuntimeOverrides": "normalizeRuntimeOverridesFn"
});
}

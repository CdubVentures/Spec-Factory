/**
 * Key Finder — public API.
 *
 * Universal per-key extractor: one LLM call per (product, fieldKey), tier
 * model routing via resolvePhaseModelByTier, multi-key envelope response,
 * per-key discovery-log scope. Long-term replacement for per-field finders.
 */

export { keyFinderResponseSchema, perKeyShape } from './keySchema.js';
export {
  KEY_FINDER_DEFAULT_TEMPLATE,
  KEY_FINDER_SPEC,
  buildKeyFinderPrompt,
  buildKeyFinderSpec,
  createKeyFinderCallLlm,
} from './keyLlmAdapter.js';
export {
  keyFinderStore,
  readKeyFinder,
  writeKeyFinder,
  mergeKeyFinderDiscovery,
  deleteKeyFinderRun,
  deleteKeyFinderRuns,
  deleteKeyFinderAll,
  unselectKeyFinderField,
  scrubFieldFromKeyFinder,
  rebuildKeyFinderFromJson,
} from './keyStore.js';
export { runKeyFinder } from './keyFinder.js';
export { runKeyFinderLoop } from './keyFinderLoop.js';
export { registerKeyFinderRoutes } from './api/keyFinderRoutes.js';

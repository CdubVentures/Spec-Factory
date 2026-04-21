/**
 * Key Finder — public API (Phase 2 stub).
 *
 * Phase 3 will expand with runKeyFinder / runKeyGroup / runAllKeys and
 * the route registrar. For now, this barrel just re-exports the pieces
 * the framework needs for registration + codegen.
 */

export { keyFinderResponseSchema } from './keySchema.js';
export {
  KEY_FINDER_DEFAULT_TEMPLATE,
  KEY_FINDER_SPEC,
  buildKeyFinderPrompt,
} from './keyLlmAdapter.js';
export {
  readKeyFinder,
  writeKeyFinder,
  mergeKeyFinderDiscovery,
  deleteKeyFinderRun,
  deleteKeyFinderAll,
  rebuildKeyFinderFromJson,
} from './keyStore.js';

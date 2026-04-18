export {
  readColorEdition,
  writeColorEdition,
  mergeColorEditionDiscovery,
  rebuildColorEditionFinderFromJson,
  recalculateCumulativeFromRuns,
  deleteColorEditionFinderRun,
  deleteColorEditionFinderAll,
} from './colorEditionStore.js';

export { colorEditionFinderResponseSchema, variantIdentityCheckResponseSchema } from './colorEditionSchema.js';
export { createColorEditionFinderCallLlm, buildColorEditionFinderPrompt, createVariantIdentityCheckCallLlm, buildVariantIdentityCheckPrompt } from './colorEditionLlmAdapter.js';
export { runColorEditionFinder } from './colorEditionFinder.js';
export { registerColorEditionFinderRoutes } from './api/colorEditionFinderRoutes.js';
export { generateVariantId, buildVariantRegistry, applyIdentityMappings, validateColorsAgainstPalette, validateIdentityMappings, validateOrphanRemaps } from './variantRegistry.js';
export { backfillVariantRegistry } from './backfillVariantRegistry.js';
export { deriveColorNamesFromVariants, derivePublishedFromVariants, computePublishedArraysFromVariants, aggregateCefFieldConfidence, deleteVariant, deleteAllVariants } from './variantLifecycle.js';

// WHY: CEF owns the concept of "variant-backed fields" — published value comes from the
// variants table (SSOT), not from field_candidates evidence. Consumers that cascade
// deletions (e.g. review/deleteCandidate) must skip republish for these fields because
// only variant deletion can demote published state for them.
export const VARIANT_BACKED_FIELDS = Object.freeze(['colors', 'editions']);
export const isVariantBackedField = (fieldKey) => VARIANT_BACKED_FIELDS.includes(fieldKey);

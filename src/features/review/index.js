// Review feature — public API barrel.
// Consumers must import from this file, not from internal paths.

export { registerReviewRoutes } from './api/reviewRoutes.js';
export { createReviewRouteContext } from './api/reviewRouteContext.js';

// Domain logic (canonical home — internalized from legacy src/review/)
export {
  buildFieldLabelsMap, buildReviewLayout, readLatestArtifacts,
  buildFieldState, buildProductReviewPayload, writeProductReviewArtifacts,
  buildReviewQueue, writeCategoryReviewArtifacts,
  resolveOverrideFilePath, readReviewArtifacts, setOverrideFromCandidate,
  setManualOverride, approveGreenOverrides, buildReviewMetrics, finalizeOverrides,
  resolvePropertyFieldMeta, buildComponentReviewLayout,
  buildComponentReviewPayloads, buildEnumReviewPayloads,
  findProductsReferencingComponent, cascadeComponentChange, cascadeEnumChange,
  normalizeFieldKey, applySharedLaneState, confidenceColor, runQaJudge,
  startReviewQueueWebSocket, suggestionFilePath, appendReviewSuggestion,
  evaluateVariance, evaluateVarianceBatch,
} from './domain/index.js';

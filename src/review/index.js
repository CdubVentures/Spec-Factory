// Compatibility shim — canonical location: src/features/review/domain/
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
} from '../features/review/domain/index.js';

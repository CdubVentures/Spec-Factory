// Public API for src/review/
// All external consumers must import from this file, not internal modules.

export {
  buildFieldLabelsMap,
  buildReviewLayout,
  readLatestArtifacts,
  buildFieldState,
  buildProductReviewPayload,
  writeProductReviewArtifacts,
  buildReviewQueue,
  writeCategoryReviewArtifacts,
} from './reviewGridData.js';

export {
  resolveOverrideFilePath,
  readReviewArtifacts,
  setOverrideFromCandidate,
  setManualOverride,
  approveGreenOverrides,
  buildReviewMetrics,
  finalizeOverrides,
} from './overrideWorkflow.js';

export {
  resolvePropertyFieldMeta,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  buildEnumReviewPayloads,
} from './componentReviewData.js';

export {
  findProductsReferencingComponent,
  cascadeComponentChange,
  cascadeEnumChange,
} from './componentImpact.js';

export { normalizeFieldKey } from './reviewNormalization.js';
export { applySharedLaneState } from './keyReviewState.js';
export { confidenceColor } from './confidenceColor.js';
export { runQaJudge } from './qaJudge.js';
export { startReviewQueueWebSocket } from './queueWebSocket.js';
export { appendReviewSuggestion } from './suggestions.js';
export { evaluateVariance, evaluateVarianceBatch } from './varianceEvaluator.js';

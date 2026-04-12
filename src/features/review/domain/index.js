// Public API for src/review/
// All external consumers must import from this file, not internal modules.

export {
  buildFieldLabelsMap,
  buildReviewLayout,
  readLatestArtifacts,
  buildFieldState,
  buildProductReviewPayload,
  writeProductReviewArtifacts,
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
export { confidenceColor } from './confidenceColor.js';
export { runQaJudge } from './qaJudge.js';
export { evaluateVariance, evaluateVarianceBatch } from './varianceEvaluator.js';

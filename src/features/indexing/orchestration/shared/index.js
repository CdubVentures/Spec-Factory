// Orchestration shared helpers — public API re-exports.
// These helper modules support the orchestration pipeline phases.

export {
  sha256,
  sha256Buffer,
  stableHash,
  screenshotMimeType,
  screenshotExtension,
} from './cryptoHelpers.js';

export {
  isDiscoveryOnlySourceUrl,
  isRobotsTxtUrl,
  isSitemapUrl,
  isHttpPreferredStaticSourceUrl,
  hasSitemapXmlSignals,
  isLikelyIndexableEndpointUrl,
  isSafeManufacturerFollowupUrl,
  isHelperSyntheticUrl,
  isHelperSyntheticSource,
} from './urlHelpers.js';

export {
  createEmptyProvenance,
  ensureProvenanceField,
  mergePhase08Rows,
  buildPhase08SummaryFromBatches,
  tsvRowFromFields,
} from './provenanceHelpers.js';

export {
  METHOD_PRIORITY,
  parseFirstNumber,
  hasKnownFieldValue,
  plausibilityBoost,
  candidateScore,
  buildCandidateFieldMap,
  dedupeCandidates,
  collectContributionFields,
} from './candidateHelpers.js';

// WHY: evidenceHelpers.js and reasoningHelpers.js removed — they import
// from deleted extraction/evidencePack.js and pipeline/consensusPhase.js.
// Their exports were only consumed by the deleted execution/finalize phases.

export {
  toInt,
  toFloat,
  toBool,
} from './typeHelpers.js';

export {
  resolveIdentityAmbiguitySnapshot,
  buildRunIdentityFingerprint,
  bestIdentityFromSources,
  isIdentityLockedField,
  helperSupportsProvisionalFill,
  deriveNeedSetIdentityState,
  resolveExtractionGateOpen,
  buildNeedSetIdentityAuditRows,
} from './identityHelpers.js';

export {
  parseMinEvidenceRefs,
  sendModeIncludesPrime,
  selectPreferredRouteRow,
  deriveRouteMatrixPolicy,
  loadRouteMatrixPolicyForRun,
  resolveRuntimeControlKey,
  resolveIndexingResumeKey,
  defaultRuntimeOverrides,
  normalizeRuntimeOverrides,
} from './runtimeHelpers.js';

export {
  resolveScreencastCallback,
} from './runProductContracts.js';

export {
  buildIndexlabRuntimeCategoryConfig,
} from './indexlabRuntimeFieldRules.js';

export {
  PASS_TARGET_EXEMPT_FIELDS,
  markSatisfiedLlmFields,
  refreshFieldsBelowPassTarget,
  isAnchorLocked,
  resolveTargets,
  resolveLlmTargetFields,
} from './scoringHelpers.js';

export {
  loadEnabledSourceEntries,
} from './runProductOrchestrationHelpers.js';

export {
  copyContext,
  renameContextKeys,
} from './contextUtils.js';

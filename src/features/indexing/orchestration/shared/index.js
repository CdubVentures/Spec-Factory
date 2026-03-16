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

export {
  selectAggressiveEvidencePack,
  selectAggressiveDomHtml,
  buildDomSnippetArtifact,
  normalizedSnippetRows,
  enrichFieldCandidatesWithEvidenceRefs,
  buildTopEvidenceReferences,
} from './evidenceHelpers.js';

export {
  buildFieldReasoning,
  emitFieldDecisionEvents,
  buildProvisionalHypothesisQueue,
} from './reasoningHelpers.js';

export {
  toInt,
  toFloat,
  toBool,
  isIndexingHelperFlowEnabled,
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
  applyRuntimeOverridesToPlanner,
} from './runtimeHelpers.js';

export {
  buildInitialLlmBudgetState,
  enqueueAdapterSeedUrls,
  resolveScreencastCallback,
  createRunProductFetcherFactory,
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

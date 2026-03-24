// Validation — public API re-exports.
// Anchors, identity, quality, traffic light, critics, enum, verification, live-crawl.

export {
  evaluateAnchorConflicts,
  hasMajorAnchorConflicts,
  mergeAnchorConflictLists,
} from './anchors.js';

export {
  buildIdentityCriticalContradictions,
  evaluateSourceIdentity,
  evaluateIdentityGate,
  buildIdentityReport,
} from './identityGate.js';

export { evaluateValidationGate } from './qualityGate.js';

export { buildTrafficLight } from './trafficLight.js';

export { validateComponentMatches } from './validateComponentMatches.js';

export {
  runEnumConsistencyReview,
  resolveEnumConsistencyFormatGuidance,
  sanitizeEnumConsistencyDecisions,
} from './validateEnumConsistency.js';

export { runDeterministicCritic } from './critic.js';

export { appendLlmVerificationReport } from './verificationReport.js';

// WHY: validateCandidatesLLM removed — imports from deleted extraction/extractionContext.js.

// Live-crawl evaluators
export {
  evaluateAllSections,
  evaluateBlockerRB0,
  evaluateBlockerRB1,
  evaluateDefaultsAligned,
  evaluateCrawlAlive,
  evaluateFetchStrategy,
  evaluateDocCollection,
  evaluateParserAlive,
  evaluateExtractionAlive,
  evaluatePublishableAlive,
  evaluateRuntimeGui,
  evaluateScreenshots,
  evaluateRepairRetryQueue,
  evaluatePhase3IndexAlignment,
  evaluateOptimization,
} from './live-crawl/sectionEvaluators.js';

export {
  EVIDENCE_REPORT_FIELDS,
  buildEvidenceReport,
} from './live-crawl/evidenceReport.js';

export {
  REQUIRED_SETTINGS_KEYS,
  buildEffectiveSettingsSnapshot,
  FETCH_STRATEGIES,
  buildFetchDecisionEntry,
  SCREENSHOT_MANIFEST_KEYS,
  buildScreenshotManifestEntry,
  buildScreenshotManifestFromEvents,
  buildRuntimeVsFinalDiff,
} from './live-crawl/artifactBuilders.js';

export {
  VERDICT_STATUS,
  aggregateSectionResult,
  computeSingleVerdict,
  computeVerdicts,
} from './live-crawl/verdicts.js';

export {
  VERDICT_IDS,
  SECTION_IDS,
  sectionToVerdict,
  getSection,
  CHECK_CATALOG,
  getCheck,
  getSectionChecks,
} from './live-crawl/checkCatalog.js';

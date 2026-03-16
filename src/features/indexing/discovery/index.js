// Discovery Control Plane — public API re-exports.
// Phase 1 foundation: host parsing, source registry, hint tokens,
// provider capabilities, query compilation, host policy.

export {
  parseHost,
  normalizeHost,
  isSubdomainOf,
  hostMatchesDomain,
  isValidDomain,
} from './hostParser.js';

export {
  loadSourceRegistry,
  lookupSource,
  listSourcesByTier,
  fieldCoverageForHost,
  isConnectorOnly,
  isBlockedInSearch,
  registrySparsityReport,
  checkCategoryPopulationHardGate,
  sourceEntrySchema,
  TIER_ENUM,
  TIER_TO_ROLE,
} from './sourceRegistry.js';

export {
  resolveHintToken,
  resolveHintTokens,
} from './hintTokenResolver.js';

export {
  getProviderCapabilities,
  supportsOperator,
  listProviders,
  providerCapabilitySchema,
} from './providerCapabilities.js';

export {
  compileQuery,
  compileQueryBatch,
  logicalQueryPlanSchema,
} from './queryCompiler.js';

export {
  buildHostPolicy,
  resolveHostPolicies,
} from './hostPolicy.js';

export {
  buildEffectiveHostPlan,
  buildHostPlanShadowDiff,
} from './domainHintResolver.js';

export {
  classifyFieldCoreDeep,
  applyTierAcceptancePolicy,
  clusterDeepNumericClaims,
} from './coreDeepGate.js';

export {
  recordQueryResult,
  lookupQueryHistory,
  recordUrlVisit,
  lookupUrlHistory,
  isDeadQuery,
  queryIndexSummary,
  urlIndexSummary,
  highYieldUrls,
} from './queryIndex.js';

export { applyCoreDeepGates } from './coreDeepGate.js';

export {
  discoverCandidateSources,
  computeIdentityMatchLevel,
  detectVariantGuardHit,
  detectMultiModelHint,
  resolveEnabledSourceEntries,
} from './searchDiscovery.js';

export { planEscalationQueries } from './escalationPlanner.js';

export {
  recordPromptResult,
  lookupPromptHistory,
  promptIndexSummary,
} from './promptIndex.js';

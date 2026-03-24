// Discovery Control Plane — public API re-exports.

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

export {
  recordPromptResult,
  lookupPromptHistory,
  promptIndexSummary,
} from './promptIndex.js';

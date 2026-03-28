// Pipeline shared utilities — public API barrel.

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
  recordQueryResult,
  lookupQueryHistory,
  recordUrlVisit,
  lookupUrlHistory,
  isDeadQuery,
  queryIndexSummary,
  urlIndexSummary,
  highYieldUrls,
  computeQueryIndexSummary,
  computeUrlIndexSummary,
} from './queryIndex.js';

export {
  recordPromptResult,
  lookupPromptHistory,
  promptIndexSummary,
  computePromptIndexSummary,
} from './promptIndex.js';

export { createPhaseCallLlm } from './createPhaseCallLlm.js';

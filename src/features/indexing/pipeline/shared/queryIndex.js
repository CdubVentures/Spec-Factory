// WHY: Cross-run query and URL indexes. Collected during shadow mode
// to prove v2 improvements compound. NDJSON storage — portable, no new deps.
// Delegates to createQueryIndex factory with in-memory cache.

import { createQueryIndex, computeQueryIndexSummary, computeUrlIndexSummary } from './createQueryIndex.js';

const _default = createQueryIndex();

export const recordQueryResult = _default.recordQueryResult;
export const lookupQueryHistory = _default.lookupQueryHistory;
export const recordUrlVisit = _default.recordUrlVisit;
export const lookupUrlHistory = _default.lookupUrlHistory;
export const isDeadQuery = _default.isDeadQuery;
export const queryIndexSummary = _default.queryIndexSummary;
export const urlIndexSummary = _default.urlIndexSummary;
export const highYieldUrls = _default.highYieldUrls;

export { createQueryIndex, computeQueryIndexSummary, computeUrlIndexSummary };

// WHY: Cross-run prompt effectiveness index. Tracks which prompt versions
// yield the most fields per token — enables prompt evolution decisions.
// Delegates to createPromptIndex factory with in-memory cache.

import { createPromptIndex, computePromptIndexSummary } from './createPromptIndex.js';

const _default = createPromptIndex();

export const recordPromptResult = _default.recordPromptResult;
export const lookupPromptHistory = _default.lookupPromptHistory;
export const promptIndexSummary = _default.promptIndexSummary;

export { createPromptIndex, computePromptIndexSummary };

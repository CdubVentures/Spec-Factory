// WHY: Orchestration descriptor for Search Planner phase.
// Async — LLM-based query enhancement.

import { runSearchPlanner } from './runSearchPlanner.js';

export const searchPlannerPhase = {
  id: 'searchPlanner',
  stageCursor: 'stage:search-planner',
  checkpoint: 'afterPlanner',

  async execute(ctx) {
    const fn = ctx._di?.runSearchPlannerFn || runSearchPlanner;
    const result = await fn({
      searchProfileBase: ctx.searchProfileBase,
      queryExecutionHistory: ctx.queryExecutionHistory,
      urlExecutionHistory: ctx.urlExecutionHistory,
      config: ctx.config,
      logger: ctx.logger,
      identityLock: ctx.identityLock,
      missingFields: ctx.missingFields,
      llmContext: ctx.llmContext || null,
    });
    return { enhancedRows: result.enhancedRows };
  },
};

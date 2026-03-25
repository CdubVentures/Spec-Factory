// WHY: Orchestration descriptor for Search Planner phase.
// Async — LLM-based query enhancement.

import { runSearchPlanner } from './runSearchPlanner.js';

export const searchPlannerPhase = {
  id: 'searchPlanner',
  phaseCursor: 'phase_04_search_planner',
  checkpoint: 'afterPlanner',

  async execute(ctx) {
    const fn = ctx._di?.runSearchPlannerFn || runSearchPlanner;
    const result = await fn({
      searchProfileBase: ctx.searchProfileBase,
      queryExecutionHistory: ctx.queryExecutionHistory,
      config: ctx.config,
      logger: ctx.logger,
      identityLock: ctx.identityLock,
      missingFields: ctx.missingFields,
    });
    return { enhancedRows: result.enhancedRows };
  },
};

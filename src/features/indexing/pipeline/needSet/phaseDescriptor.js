// WHY: Orchestration descriptor for NeedSet phase.
// Runs IN PARALLEL with Brand Resolver via Promise.all.

import { runNeedSet } from './runNeedSet.js';
import { computeNeedSet } from './needsetEngine.js';
import { buildSearchPlanningContext } from './searchPlanningContext.js';
import { buildSearchPlan } from './searchPlanBuilder.js';

export const needSetPhase = {
  id: 'needset',
  phaseCursor: 'phase_01_needset',
  checkpoint: null,

  async execute(ctx) {
    const fn = ctx._di?.runNeedSetFn || runNeedSet;
    const result = await fn({
      config: ctx.config,
      job: ctx.job,
      runId: ctx.runId,
      category: ctx.category,
      categoryConfig: ctx.categoryConfig,
      roundContext: ctx.roundContext,
      llmContext: ctx.llmContext,
      logger: ctx.logger,
      queryExecutionHistory: ctx.queryExecutionHistory,
      computeNeedSetFn: ctx._di?.computeNeedSetFn || computeNeedSet,
      buildSearchPlanningContextFn: ctx._di?.buildSearchPlanningContextFn || buildSearchPlanningContext,
      buildSearchPlanFn: ctx._di?.buildSearchPlanFn || buildSearchPlan,
    });
    return {
      focusGroups: result.focusGroups,
      seedStatus: result.seedStatus,
      seedSearchPlan: result.seedSearchPlan,
    };
  },
};

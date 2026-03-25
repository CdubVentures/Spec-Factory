// WHY: Orchestration descriptor for Search Profile phase.
// Synchronous — deterministic query generation from NeedSet + Brand outputs.

import { runSearchProfile } from './runSearchProfile.js';

export const searchProfilePhase = {
  id: 'searchProfile',
  phaseCursor: 'phase_03_search_profile',
  checkpoint: 'afterProfile',

  execute(ctx) {
    const fn = ctx._di?.runSearchProfileFn || runSearchProfile;
    const result = fn({
      job: ctx.job,
      categoryConfig: ctx.categoryConfig,
      missingFields: ctx.missingFields,
      learning: { ...ctx.learning, enrichedLexicon: ctx.enrichedLexicon },
      brandResolution: ctx.brandResolution,
      config: ctx.config,
      variables: ctx.variables,
      focusGroups: ctx.focusGroups,
      seedStatus: ctx.seedStatus,
      logger: ctx.logger,
      runId: ctx.runId,
    });
    return { ...result };
  },
};

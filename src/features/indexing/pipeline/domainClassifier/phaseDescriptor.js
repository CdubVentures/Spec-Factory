// WHY: Orchestration descriptor for Domain Classifier phase.
// Assembles final pipeline result. buildOrderedFetchPlan runs post-discovery
// in runProduct — this phase just merges results.

export const domainClassifierPhase = {
  id: 'domainClassifier',
  stageCursor: 'stage:domain-classifier',
  checkpoint: 'final',

  execute(ctx) {
    const finalResult = {
      ...ctx.discoveryResult,
      ...(ctx.seedSearchPlan ? { seed_search_plan_output: ctx.seedSearchPlan } : {}),
      enqueue_summary: {},
    };

    return { discoveryResult: finalResult, finalResult };
  },
};

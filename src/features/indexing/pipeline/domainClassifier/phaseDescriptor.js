// WHY: Orchestration descriptor for Domain Classifier phase.
// Includes final result assembly — merges discoveryResult + seedSearchPlan
// + classifier output into the pipeline's return value.

import { runDomainClassifier } from './runDomainClassifier.js';

export const domainClassifierPhase = {
  id: 'domainClassifier',
  phaseCursor: 'phase_08_domain_classifier',
  checkpoint: 'final',

  execute(ctx) {
    const fn = ctx._di?.runDomainClassifierFn || runDomainClassifier;
    const classifierResult = fn({
      discoveryResult: ctx.discoveryResult,
      planner: ctx.planner,
      config: ctx.config,
      logger: ctx.logger,
    });

    // WHY: Build final result as a fresh merge instead of mutating discoveryResult.
    const finalResult = {
      ...ctx.discoveryResult,
      ...(ctx.seedSearchPlan ? { seed_search_plan_output: ctx.seedSearchPlan } : {}),
      enqueue_summary: classifierResult || {},
    };

    return { discoveryResult: finalResult, finalResult };
  },
};

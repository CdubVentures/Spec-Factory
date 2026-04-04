// WHY: Orchestration descriptor for Result Processing (SERP Selector) phase.

import { processDiscoveryResults } from './processDiscoveryResults.js';

export const resultProcessingPhase = {
  id: 'resultProcessing',
  stageCursor: 'stage:serp-selector',
  checkpoint: null,

  async execute(ctx) {
    const fn = ctx._di?.processDiscoveryResultsFn || processDiscoveryResults;
    const discoveryResult = await fn({
      searchResults: ctx.searchResults,
      searchAttempts: ctx.searchAttempts,
      searchJournal: ctx.searchJournal,
      internalSatisfied: ctx.internalSatisfied,
      externalSearchReason: ctx.externalSearchReason,
      config: ctx.config, storage: ctx.storage,
      categoryConfig: ctx.categoryConfig, job: ctx.job,
      runId: ctx.runId, logger: ctx.logger,
      frontierDb: ctx.frontierDb,
      variables: ctx.variables, identityLock: ctx.identityLock,
      brandResolution: ctx.brandResolution,
      missingFields: ctx.missingFields, learning: ctx.learning,
      llmContext: ctx.llmContext,
      searchProfileBase: ctx.searchProfileBase,
      llmQueries: [],
      queries: ctx.queries, searchProfilePlanned: ctx.searchProfilePlanned,
      providerState: ctx.providerState, discoveryCap: ctx.discoveryCap,
    });
    return { discoveryResult };
  },
};

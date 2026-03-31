// WHY: Orchestration descriptor for Search Execution phase.
// Pre-computes discoveryCap, providerState, requiredOnlySearch before
// calling executeSearchQueries. These are orchestrator-level derivations
// that downstream phases also need on ctx.

import { executeSearchQueries } from './executeSearchQueries.js';
import { searchEngineAvailability } from './searchProviders.js';
import { configInt } from '../../../../shared/settingsAccessor.js';
import { toArray } from '../shared/discoveryIdentity.js';

export const searchExecutionPhase = {
  id: 'searchExecution',
  phaseCursor: 'phase_06_search_results',
  checkpoint: 'afterExecution',

  async execute(ctx) {
    const fn = ctx._di?.executeSearchQueriesFn || executeSearchQueries;

    // WHY: discoveryCap derives from serpSelectorMaxKeep (a URL count).
    const discoveryCap = configInt(ctx.config, 'serpSelectorMaxKeep');
    const providerState = searchEngineAvailability(ctx.config);
    const requiredOnlySearch = Boolean(ctx.planningHints.requiredOnlySearch);
    const missingRequiredFields = ctx.normalizeFieldListFn(
      toArray(ctx.planningHints.missingRequiredFields),
      { fieldOrder: ctx.categoryConfig?.fieldOrder || [] },
    );

    const searchResult = await fn({
      config: ctx.config, storage: ctx.storage, logger: ctx.logger,
      frontierDb: ctx.frontierDb,
      categoryConfig: ctx.categoryConfig, job: ctx.job, runId: ctx.runId,
      queries: ctx.queries, executionQueryLimit: ctx.executionQueryLimit,
      queryLimit: ctx.queryLimit,
      missingFields: ctx.missingFields, variables: ctx.variables,
      selectedQueryRowMap: ctx.selectedQueryRowMap,
      // WHY: Query Journey exports profileQueryRowsByQuery; Search Execution expects profileQueryRowMap.
      profileQueryRowMap: ctx.profileQueryRowsByQuery,
      providerState, requiredOnlySearch, missingRequiredFields,
    });

    return {
      discoveryCap,
      providerState,
      requiredOnlySearch,
      missingRequiredFields,
      ...searchResult,
    };
  },
};

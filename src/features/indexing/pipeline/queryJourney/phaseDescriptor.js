// WHY: Orchestration descriptor for Query Journey phase.
// Includes post-execute search_queued emission so GUI renders
// all planned workers BEFORE Search Execution starts.

import { runQueryJourney } from './runQueryJourney.js';
import { SLOT_LABELS } from '../shared/discoveryIdentity.js';

export const queryJourneyPhase = {
  id: 'queryJourney',
  phaseCursor: 'phase_05_query_journey',
  checkpoint: 'afterJourney',

  async execute(ctx) {
    const fn = ctx._di?.runQueryJourneyFn || runQueryJourney;
    const journey = await fn({
      searchProfileBase: ctx.searchProfileBase,
      enhancedRows: ctx.enhancedRows,
      variables: ctx.variables,
      config: ctx.config,
      missingFields: ctx.missingFields,
      planningHints: ctx.planningHints,
      categoryConfig: ctx.categoryConfig,
      job: ctx.job,
      runId: ctx.runId,
      logger: ctx.logger,
      storage: ctx.storage,
      brandResolution: ctx.brandResolution,
    });

    // WHY: Emit search_queued events BEFORE Search Execution starts so the GUI
    // renders all planned workers immediately. The bridge processes events in
    // order, so emitting here guarantees correct slot allocation.
    const plannedQueries = journey.queries.slice(0, journey.executionQueryLimit);
    if (plannedQueries.length > 0) {
      const provider = String(ctx.config.searchEngines || '').trim();
      for (let i = 0; i < plannedQueries.length && i < SLOT_LABELS.length; i++) {
        const letter = SLOT_LABELS[i];
        ctx.logger?.info?.('search_queued', {
          scope: 'query',
          worker_id: `search-${letter}`,
          slot: letter,
          query: String(plannedQueries[i] || '').trim(),
          provider,
          state: 'queued',
        });
      }
    }

    return { ...journey };
  },
};

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { runRepairSearchPhase } from '../src/features/indexing/orchestration/execution/runRepairSearchPhase.js';

function createMockLogger() {
  const events = [];
  return {
    events,
    info(event, payload) { events.push({ level: 'info', event, payload }); },
    warn(event, payload) { events.push({ level: 'warn', event, payload }); },
    error(event, payload) { events.push({ level: 'error', event, payload }); },
    getEvents() { return events; },
  };
}

function createMockPlanner() {
  const seeded = [];
  return {
    seeded,
    enqueue(url, source) {
      seeded.push({ url, source });
      return true;
    },
  };
}

describe('repairSearchWorkerLifecycle', () => {
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it('skips when no repair_query_enqueued events exist', async () => {
    const result = await runRepairSearchPhase({
      logger,
      repairEvents: [],
      planner: createMockPlanner(),
      config: {},
      processPlannerQueueFn: async () => {},
      runSearchFn: async () => [],
      startMs: Date.now(),
      nowFn: Date.now,
    });

    assert.equal(result.repairSearchesAttempted, 0);
    assert.equal(result.repairSearchesCompleted, 0);
    assert.equal(result.repairSearchesFailed, 0);
  });

  it('emits repair_search_started and repair_search_completed on success', async () => {
    const repairEvents = [{
      domain: 'techpowerup.com',
      query: 'site:techpowerup.com "Logitech G Pro X Superlight 2" spec',
      field_targets: ['sensor', 'weight'],
      provider: 'searxng',
      reason: 'status_410',
      source_url: 'https://techpowerup.com/old-review',
    }];

    const searchResults = [
      { url: 'https://techpowerup.com/review/new-review', title: 'New Review' },
      { url: 'https://techpowerup.com/specs/mouse', title: 'Specs' },
    ];

    const planner = createMockPlanner();
    let plannerQueueCalled = false;

    const result = await runRepairSearchPhase({
      logger,
      repairEvents,
      planner,
      config: { searchEngines: 'bing,brave,duckduckgo', maxRunSeconds: 300 },
      processPlannerQueueFn: async () => { plannerQueueCalled = true; },
      runSearchFn: async ({ query }) => {
        assert.equal(query, repairEvents[0].query);
        return searchResults;
      },
      startMs: Date.now(),
      nowFn: Date.now,
    });

    assert.equal(result.repairSearchesAttempted, 1);
    assert.equal(result.repairSearchesCompleted, 1);
    assert.equal(result.repairSearchesFailed, 0);

    const started = logger.events.find((e) => e.event === 'repair_search_started');
    assert.ok(started, 'repair_search_started event missing');
    assert.equal(started.payload.domain, 'techpowerup.com');
    assert.equal(started.payload.query, repairEvents[0].query);

    const completed = logger.events.find((e) => e.event === 'repair_search_completed');
    assert.ok(completed, 'repair_search_completed event missing');
    assert.equal(completed.payload.domain, 'techpowerup.com');
    assert.equal(completed.payload.urls_found, 2);
    assert.equal(completed.payload.urls_seeded, 2);

    assert.equal(planner.seeded.length, 2);
    assert.equal(planner.seeded[0].url, 'https://techpowerup.com/review/new-review');
    assert.ok(plannerQueueCalled, 'processPlannerQueueFn should have been called');
  });

  it('emits repair_search_failed when search throws', async () => {
    const repairEvents = [{
      domain: 'techpowerup.com',
      query: 'site:techpowerup.com "Logitech G Pro X Superlight 2" spec',
      field_targets: ['sensor'],
      provider: 'searxng',
      reason: 'status_404',
      source_url: 'https://techpowerup.com/old',
    }];

    const result = await runRepairSearchPhase({
      logger,
      repairEvents,
      planner: createMockPlanner(),
      config: { searchEngines: 'bing,brave,duckduckgo', maxRunSeconds: 300 },
      processPlannerQueueFn: async () => {},
      runSearchFn: async () => { throw new Error('search timeout'); },
      startMs: Date.now(),
      nowFn: Date.now,
    });

    assert.equal(result.repairSearchesAttempted, 1);
    assert.equal(result.repairSearchesCompleted, 0);
    assert.equal(result.repairSearchesFailed, 1);

    const failed = logger.events.find((e) => e.event === 'repair_search_failed');
    assert.ok(failed, 'repair_search_failed event missing');
    assert.equal(failed.payload.domain, 'techpowerup.com');
    assert.equal(failed.payload.error, 'search timeout');
  });

  it('respects maxRunSeconds budget', async () => {
    const repairEvents = [{
      domain: 'example.com',
      query: 'site:example.com test',
      field_targets: ['weight'],
      provider: 'searxng',
      reason: 'status_404',
      source_url: 'https://example.com/old',
    }];

    const result = await runRepairSearchPhase({
      logger,
      repairEvents,
      planner: createMockPlanner(),
      config: { searchEngines: 'bing,brave,duckduckgo', maxRunSeconds: 60 },
      processPlannerQueueFn: async () => {},
      runSearchFn: async () => [{ url: 'https://example.com/new', title: 'New' }],
      startMs: Date.now() - 120_000, // started 120s ago, budget is 60s
      nowFn: Date.now,
    });

    assert.equal(result.repairSearchesAttempted, 0);
    assert.equal(result.repairSearchesCompleted, 0);
    const skipped = logger.events.find((e) => e.event === 'repair_search_skipped');
    assert.ok(skipped, 'repair_search_skipped event expected');
    assert.equal(skipped.payload.reason, 'time_budget_exhausted');
  });

  it('deduplicates repair queries by domain', async () => {
    const repairEvents = [
      {
        domain: 'techpowerup.com',
        query: 'site:techpowerup.com query1',
        field_targets: ['sensor'],
        provider: 'searxng',
        reason: 'status_404',
        source_url: 'https://techpowerup.com/a',
      },
      {
        domain: 'techpowerup.com',
        query: 'site:techpowerup.com query2',
        field_targets: ['weight'],
        provider: 'searxng',
        reason: 'status_410',
        source_url: 'https://techpowerup.com/b',
      },
    ];

    let searchCallCount = 0;
    const result = await runRepairSearchPhase({
      logger,
      repairEvents,
      planner: createMockPlanner(),
      config: { searchEngines: 'bing,brave,duckduckgo', maxRunSeconds: 300 },
      processPlannerQueueFn: async () => {},
      runSearchFn: async () => {
        searchCallCount += 1;
        return [{ url: 'https://techpowerup.com/new', title: 'New' }];
      },
      startMs: Date.now(),
      nowFn: Date.now,
    });

    // only 1 search, not 2 — dedupe by domain
    assert.equal(searchCallCount, 1);
    assert.equal(result.repairSearchesAttempted, 1);
    assert.equal(result.repairSearchesCompleted, 1);
  });

  it('processes multiple distinct domains', async () => {
    const repairEvents = [
      {
        domain: 'techpowerup.com',
        query: 'site:techpowerup.com spec',
        field_targets: ['sensor'],
        provider: 'searxng',
        reason: 'status_404',
        source_url: 'https://techpowerup.com/a',
      },
      {
        domain: 'rtings.com',
        query: 'site:rtings.com spec',
        field_targets: ['weight'],
        provider: 'searxng',
        reason: 'status_410',
        source_url: 'https://rtings.com/b',
      },
    ];

    let searchCallCount = 0;
    const result = await runRepairSearchPhase({
      logger,
      repairEvents,
      planner: createMockPlanner(),
      config: { searchEngines: 'bing,brave,duckduckgo', maxRunSeconds: 300 },
      processPlannerQueueFn: async () => {},
      runSearchFn: async () => {
        searchCallCount += 1;
        return [{ url: `https://example.com/result-${searchCallCount}`, title: 'Result' }];
      },
      startMs: Date.now(),
      nowFn: Date.now,
    });

    assert.equal(searchCallCount, 2);
    assert.equal(result.repairSearchesAttempted, 2);
    assert.equal(result.repairSearchesCompleted, 2);
  });

  it('skips when search provider is none', async () => {
    const repairEvents = [{
      domain: 'techpowerup.com',
      query: 'site:techpowerup.com spec',
      field_targets: ['sensor'],
      provider: 'none',
      reason: 'status_404',
      source_url: 'https://techpowerup.com/a',
    }];

    const result = await runRepairSearchPhase({
      logger,
      repairEvents,
      planner: createMockPlanner(),
      config: { searchEngines: '', maxRunSeconds: 300 },
      processPlannerQueueFn: async () => {},
      runSearchFn: async () => [],
      startMs: Date.now(),
      nowFn: Date.now,
    });

    assert.equal(result.repairSearchesAttempted, 0);
    const skipped = logger.events.find((e) => e.event === 'repair_search_skipped');
    assert.ok(skipped);
    assert.equal(skipped.payload.reason, 'search_provider_disabled');
  });

  it('does not call processPlannerQueueFn when no URLs are seeded', async () => {
    const repairEvents = [{
      domain: 'techpowerup.com',
      query: 'site:techpowerup.com spec',
      field_targets: ['sensor'],
      provider: 'searxng',
      reason: 'status_404',
      source_url: 'https://techpowerup.com/a',
    }];

    let plannerQueueCalled = false;
    const result = await runRepairSearchPhase({
      logger,
      repairEvents,
      planner: createMockPlanner(),
      config: { searchEngines: 'bing,brave,duckduckgo', maxRunSeconds: 300 },
      processPlannerQueueFn: async () => { plannerQueueCalled = true; },
      runSearchFn: async () => [], // no results
      startMs: Date.now(),
      nowFn: Date.now,
    });

    assert.equal(result.repairSearchesAttempted, 1);
    assert.equal(result.repairSearchesCompleted, 1);
    assert.ok(!plannerQueueCalled, 'processPlannerQueueFn should NOT be called when no URLs seeded');

    const completed = logger.events.find((e) => e.event === 'repair_search_completed');
    assert.equal(completed.payload.urls_found, 0);
    assert.equal(completed.payload.urls_seeded, 0);
  });
});

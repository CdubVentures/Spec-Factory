// WHY: Characterization + contract test for the query_index writer. Bug B8:
// every external search query landed TWO rows in query_index — one with tier
// set (from bootstrapRunEventIndexing hook on 'discovery_query_completed'
// events) and one with tier=null (from the direct insertQueryIndexEntry call
// in executeSearchQueries.js:212). The fix: delete the direct call so the
// event-hook is the single writer. This test locks the single-writer contract.

import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { executeSearchQueries } from '../executeSearchQueries.js';

function makeFakeSpecDb() {
  const inserted = [];
  return {
    inserted,
    insertQueryIndexEntry(row) { inserted.push(row); },
  };
}

function makeCtx({ specDb, selectedQueryRowMap, profileQueryRowMap }) {
  return {
    config: {
      specDb,
      searchEngines: 'google',
      discoveryInternalFirst: false,
      discoveryInternalMinResults: 1,
      serperBurstEnabled: false,
      serperSearchMinIntervalMs: 0,
    },
    storage: null,
    logger: { info: () => {}, warn: () => {} },
    frontierDb: {
      getUrlRow: () => null,
      recordQuery: () => ({ query_hash: 'h', query_text: 't' }),
    },
    categoryConfig: { category: 'mouse', fieldOrder: [] },
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'test-run',
    queries: ['Cooler Master MM731 specs'],
    executionQueryLimit: 1,
    queryLimit: 10,
    missingFields: [],
    variables: {},
    selectedQueryRowMap,
    profileQueryRowMap,
    providerState: {
      provider: 'google',
      internet_ready: true,
      active_providers: ['google'],
      fallback_reason: null,
      serper_ready: false,
    },
    requiredOnlySearch: false,
    missingRequiredFields: [],
    _runSearchProvidersFn: async () => ({ results: [{ url: 'https://example.com', title: 't', snippet: 's' }], usedFallback: false }),
    _searchSourceCorpusFn: async () => [],
  };
}

describe('executeSearchQueries — query_index single writer (B8 fix)', () => {
  it('does NOT directly call insertQueryIndexEntry (event-hook is the sole writer)', async () => {
    const specDb = makeFakeSpecDb();
    const selectedQueryRowMap = new Map([[
      'cooler master mm731 specs',
      { query: 'Cooler Master MM731 specs', tier: 'seed', hint_source: 'tier1_seed', group_key: '', normalized_key: '', source_host: 'coolermaster.com' },
    ]]);
    const profileQueryRowMap = new Map(selectedQueryRowMap);

    await executeSearchQueries(makeCtx({ specDb, selectedQueryRowMap, profileQueryRowMap }));

    strictEqual(specDb.inserted.length, 0, `executeSearchQueries must not call insertQueryIndexEntry directly (got ${specDb.inserted.length} writes). The event-hook in bootstrapRunEventIndexing is the sole writer.`);
  });

  it('still emits discovery_query_completed event with tier (so event-hook writes tier)', async () => {
    const specDb = makeFakeSpecDb();
    const selectedQueryRowMap = new Map([[
      'cooler master mm731 specs',
      { query: 'Cooler Master MM731 specs', tier: 'seed', hint_source: 'tier1_seed', group_key: '', normalized_key: '', source_host: 'coolermaster.com' },
    ]]);
    const profileQueryRowMap = new Map(selectedQueryRowMap);
    const events = [];
    const ctx = makeCtx({ specDb, selectedQueryRowMap, profileQueryRowMap });
    ctx.logger = { info: (event, payload) => events.push({ event, payload }), warn: () => {} };

    await executeSearchQueries(ctx);

    const dqc = events.find((e) => e.event === 'discovery_query_completed');
    ok(dqc, 'discovery_query_completed event must be emitted');
    strictEqual(dqc.payload.tier, 'seed', 'event must carry tier from selectedQueryRow');
  });

  it('tier resolves from profileRow when selectedQueryRow is missing (guard-dropped fallback)', async () => {
    const specDb = makeFakeSpecDb();
    // selectedQueryRowMap empty — simulates guard-dropped query
    const selectedQueryRowMap = new Map();
    const profileQueryRowMap = new Map([[
      'cooler master mm731 specs',
      { query: 'Cooler Master MM731 specs', tier: 'group_search', hint_source: 'tier2_group', group_key: 'sensor', normalized_key: '', source_host: '' },
    ]]);
    const events = [];
    const ctx = makeCtx({ specDb, selectedQueryRowMap, profileQueryRowMap });
    ctx.logger = { info: (event, payload) => events.push({ event, payload }), warn: () => {} };

    await executeSearchQueries(ctx);

    const dqc = events.find((e) => e.event === 'discovery_query_completed');
    ok(dqc, 'discovery_query_completed event must be emitted');
    strictEqual(dqc.payload.tier, 'group_search', 'event must fall back to profileRow.tier when selectedQueryRow is missing');
  });
});

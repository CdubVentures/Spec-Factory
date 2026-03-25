import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processDiscoveryResults,
  makeCategoryConfig,
  makeIdentityLock,
  makeConfig,
  makeRawResults,
  makeSearchProfilePlanned,
  makeStubSerpSelectorCallFn,
  makeStubStorage,
  makeStubFrontierDb,
  makeStubLogger,
} from './helpers/triageCharacterizationHarness.js';
describe('Characterization - processDiscoveryResults filtering and dedupe', () => {
it('canonical URL merge deduplicates same URL from different providers', async () => {
  // Same URL appears twice with different providers
  const rawResults = [
    {
      url: 'https://razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      snippet: 'Official product page',
      provider: 'google',
      query: 'razer viper v3 pro specs',
    },
    {
      url: 'https://razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      snippet: 'Official product page',
      provider: 'bing',
      query: 'razer viper v3 pro specs',
    },
    {
      url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro',
      title: 'RTINGS Review',
      snippet: 'Lab review',
      provider: 'google',
      query: 'razer viper v3 pro review',
    },
  ];

  const logger = makeStubLogger();
  const result = await processDiscoveryResults({
    rawResults,
    searchAttempts: [],
    searchJournal: [],
    internalSatisfied: false,
    externalSearchReason: '',
    config: makeConfig(),
    storage: makeStubStorage(),
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'p1' },
    runId: 'r1',
    logger,
    runtimeTraceWriter: null,
    frontierDb: makeStubFrontierDb(),
    variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    identityLock: makeIdentityLock(),
    brandResolution: { officialDomain: 'razer.com' },
    missingFields: ['weight'],
    learning: { fieldYield: {} },
    llmContext: {},
    searchProfileBase: { variant_guard_terms: [] },
    llmQueries: [],
    queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    searchProfilePlanned: makeSearchProfilePlanned(),
    searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
    providerState: {},


    _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
  });

  // 3 raw results but razer.com appears twice → 2 unique candidates
  const uniqueUrls = new Set(result.candidates.map((c) => c.url));
  assert.equal(uniqueUrls.size, 2, 'duplicate URL merged into one candidate');

  // canon_merge_count should be reflected in serp_explorer
  assert.ok(result.serp_explorer.canon_merge_count >= 1, 'canon_merge_count >= 1');
});

it('domain classification produces safety map for mixed hosts', async () => {
  const logger = makeStubLogger();
  await processDiscoveryResults({
    rawResults: [
      ...makeRawResults(),
      {
        url: 'https://spam-site.biz/razer-viper',
        title: 'Spam', snippet: 'Spam', provider: 'google',
        query: 'razer viper v3 pro specs',
      },
    ],
    searchAttempts: [],
    searchJournal: [],
    internalSatisfied: false,
    externalSearchReason: '',
    config: makeConfig(),
    storage: makeStubStorage(),
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'p1' },
    runId: 'r1',
    logger,
    runtimeTraceWriter: null,
    frontierDb: makeStubFrontierDb(),
    variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    identityLock: makeIdentityLock(),
    brandResolution: { officialDomain: 'razer.com' },
    missingFields: ['weight'],
    learning: { fieldYield: {} },
    llmContext: {},
    searchProfileBase: { variant_guard_terms: [] },
    llmQueries: [],
    queries: ['razer viper v3 pro specs'],
    searchProfilePlanned: makeSearchProfilePlanned(),
    searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
    providerState: {},


    _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
  });

  // domains_classified event should contain classification rows
  const classifiedEvent = logger.events.find((e) => e.event === 'domains_classified');
  assert.ok(classifiedEvent, 'domains_classified event emitted');
  const rows = classifiedEvent.payload.classifications;
  assert.ok(Array.isArray(rows) && rows.length > 0, 'classification rows exist');

  // Each row has the expected shape
  for (const row of rows) {
    assert.equal(typeof row.domain, 'string');
    assert.ok(['blocked', 'safe', 'caution'].includes(row.safety_class), `valid safety_class: ${row.safety_class}`);
  }
});

it('hard-drops denied hosts and non-https, keeps valid candidates', async () => {
  const rawResults = [
    ...makeRawResults(),
    {
      url: 'https://spam-site.biz/razer-viper',
      title: 'Spam', snippet: 'Spam', provider: 'google',
      query: 'razer viper v3 pro specs',
    },
    {
      url: 'http://razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'HTTP Razer', snippet: 'HTTP', provider: 'bing',
      query: 'razer viper v3 pro specs',
    },
  ];

  const result = await processDiscoveryResults({
    rawResults,
    searchAttempts: [],
    searchJournal: [],
    internalSatisfied: false,
    externalSearchReason: '',
    config: makeConfig(),
    storage: makeStubStorage(),
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'p1' },
    runId: 'r1',
    logger: makeStubLogger(),
    runtimeTraceWriter: null,
    frontierDb: makeStubFrontierDb(),
    variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    identityLock: makeIdentityLock(),
    brandResolution: { officialDomain: 'razer.com' },
    missingFields: ['weight'],
    learning: { fieldYield: {} },
    llmContext: {},
    searchProfileBase: { variant_guard_terms: [] },
    llmQueries: [],
    queries: ['razer viper v3 pro specs'],
    searchProfilePlanned: makeSearchProfilePlanned(),
    searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
    providerState: {},


    _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
  });

  // Denied host must not appear in candidates
  const candidateUrls = result.candidates.map((c) => c.url);
  assert.ok(
    !candidateUrls.some((u) => u.includes('spam-site.biz')),
    'denied host excluded from candidates'
  );
  // Valid HTTPS candidates should be present
  assert.ok(candidateUrls.length >= 1, 'at least one valid candidate survives');
});
});

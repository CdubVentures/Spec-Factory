export { processDiscoveryResults } from '../../processDiscoveryResults.js';

export function makeCategoryConfig() {
  return {
    category: 'mouse',
    fieldOrder: ['weight', 'sensor', 'dpi', 'polling_rate'],
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
      { host: 'rtings.com', tierName: 'lab', role: 'review', tier: 2 },
      { host: 'techpowerup.com', tierName: 'lab', role: 'review', tier: 2 },
      { host: 'amazon.com', tierName: 'retailer', role: 'retailer', tier: 3 },
      { host: 'spam-site.biz', tierName: 'denied', role: 'denied', tier: 4 },
    ],
    denylist: ['spam-site.biz'],
  };
}

export function makeIdentityLock() {
  return { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' };
}

export function makeConfig(overrides = {}) {
  return {
    searchProvider: 'dual',
    llmModelPlan: 'test-model',
    s3InputPrefix: '_test',
    ...overrides,
  };
}

export function makeRawResults() {
  return [
    {
      url: 'https://razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      snippet: 'Official product page for the Razer Viper V3 Pro gaming mouse',
      provider: 'google',
      query: 'razer viper v3 pro specs',
    },
    {
      url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro',
      title: 'Razer Viper V3 Pro Review - RTINGS',
      snippet: 'Full lab review with measurements and latency testing',
      provider: 'google',
      query: 'razer viper v3 pro review',
    },
    {
      url: 'https://amazon.com/dp/B0EXAMPLE',
      title: 'Razer Viper V3 Pro Gaming Mouse',
      snippet: 'Buy the Razer Viper V3 Pro',
      provider: 'bing',
      query: 'razer viper v3 pro specs',
    },
  ];
}

export function makeSearchProfilePlanned() {
  return {
    category: 'mouse',
    focus_fields: ['weight', 'sensor', 'dpi'],
    variant_guard_terms: ['hyperspeed'],
    identity_aliases: [],
    query_rows: [
      {
        query: 'razer viper v3 pro specs',
        hint_source: 'archetype_planner',
        target_fields: ['weight', 'sensor', 'dpi'],
        doc_hint: 'spec',
        domain_hint: 'razer.com',
      },
      {
        query: 'razer viper v3 pro review',
        hint_source: 'archetype_planner',
        target_fields: ['sensor', 'polling_rate'],
        doc_hint: 'review',
        domain_hint: '',
      },
    ],
    queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
  };
}

// WHY: LLM selector is the only triage path. Stub approves all candidates.
export function makeStubSerpSelectorCallFn() {
  return async ({ selectorInput }) => {
    const ids = selectorInput.candidates.map((c) => c.id);
    return {
      schema_version: 'serp_selector_output.v1',
      keep_ids: ids,
      approved_ids: ids.slice(0, 1),
      candidate_ids: ids.slice(1),
      reject_ids: [],
      results: ids.map((id, i) => ({
        id,
        decision: i === 0 ? 'approved' : 'candidate',
        score: i === 0 ? 0.95 : 0.6,
        confidence: 'high',
        fetch_rank: i + 1,
        page_type: 'product_page',
        authority_bucket: 'official',
        likely_field_keys: ['weight'],
        reason_code: 'exact_official_product',
        reason: 'Stub selector',
      })),
      summary: { input_count: ids.length, approved_count: 1, candidate_count: ids.length - 1, reject_count: 0 },
    };
  };
}

export function makeKeepAllSelectorFn() {
  return async ({ selectorInput }) => ({
    keep_ids: selectorInput.candidates.map((candidate) => candidate.id),
  });
}

export function makeRejectAllSelectorFn() {
  return async () => ({ keep_ids: [] });
}

export function makeInvalidSelectorFn() {
  return async () => ({ keep_ids: ['FAKE_UNKNOWN_ID'] });
}

export function makeThrowingSelectorFn(message = 'timeout') {
  return async () => {
    throw new Error(message);
  };
}

export function makeStubStorage() {
  const written = [];
  return {
    written,
    writeObject: async (key, buffer, opts) => {
      written.push({ key, size: buffer.length, contentType: opts?.contentType });
    },
  };
}

export function makeStubFrontierDb() {
  return {
    canonicalize: (url) => ({ canonical_url: url }),
  };
}

export function makeStubLogger() {
  const events = [];
  return {
    events,
    info: (event, payload) => events.push({ event, payload }),
    warn: (event, payload) => events.push({ event, payload }),
  };
}

export function makeProcessDiscoveryResultsArgs(overrides = {}) {
  const {
    config,
    storage,
    categoryConfig,
    job,
    logger,
    frontierDb,
    variables,
    identityLock,
    brandResolution,
    learning,
    searchProfileBase,
    searchProfileKeys,
    providerState,
    _serpSelectorCallFn,
    ...rest
  } = overrides;

  return {
    searchResults: makeRawResults(),
    searchAttempts: [],
    searchJournal: [],
    internalSatisfied: false,
    externalSearchReason: '',
    config: makeConfig(config),
    storage: storage ?? makeStubStorage(),
    categoryConfig: categoryConfig ?? makeCategoryConfig(),
    job: { productId: 'p1', ...(job || {}) },
    runId: 'r1',
    logger: logger ?? makeStubLogger(),
    runtimeTraceWriter: null,
    frontierDb: frontierDb ?? makeStubFrontierDb(),
    variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro', ...(variables || {}) },
    identityLock: identityLock ?? makeIdentityLock(),
    brandResolution: { officialDomain: 'razer.com', ...(brandResolution || {}) },
    missingFields: ['weight'],
    learning: { fieldYield: {}, ...(learning || {}) },
    llmContext: {},
    searchProfileBase: { variant_guard_terms: [], ...(searchProfileBase || {}) },
    llmQueries: [],
    queries: ['razer viper v3 pro specs'],
    searchProfilePlanned: makeSearchProfilePlanned(),
    searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3', ...(searchProfileKeys || {}) },
    providerState: providerState ?? {},
    _serpSelectorCallFn: _serpSelectorCallFn ?? makeStubSerpSelectorCallFn(),
    ...rest,
  };
}

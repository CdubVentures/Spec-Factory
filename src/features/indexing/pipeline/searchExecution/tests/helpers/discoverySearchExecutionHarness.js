export function makeLogger() {
  const events = [];
  return {
    events,
    info: (name, data) => events.push({ event: name, data }),
    warn: (name, data) => events.push({ event: name, data }),
  };
}

export function makeConfig(overrides = {}) {
  return {
    discoveryInternalFirst: false,
    discoveryInternalMinResults: 1,
    searchEngines: '',
    ...overrides,
  };
}

export function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    sourceHosts: [
      { host: 'razer.com', role: 'manufacturer', tierName: 'manufacturer' },
      { host: 'rtings.com', role: 'lab', tierName: 'lab' },
    ],
    sourceHostMap: new Map([
      ['razer.com', { host: 'razer.com', tierName: 'manufacturer' }],
      ['rtings.com', { host: 'rtings.com', tierName: 'lab' }],
    ]),
    fieldOrder: [],
    ...overrides,
  };
}

export function makeProviderState(overrides = {}) {
  return {
    provider: 'none',
    internet_ready: false,
    active_providers: [],
    fallback_reason: null,
    ...overrides,
  };
}

export function makeExecutionArgs(overrides = {}) {
  return {
    config: makeConfig(),
    storage: null,
    logger: makeLogger(),
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'run-001',
    queries: [],
    executionQueryLimit: 0,
    queryLimit: 4,
    missingFields: [],
    variables: { brand: 'Test', model: 'Mouse', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState(),
    requiredOnlySearch: false,
    missingRequiredFields: [],
    ...overrides,
  };
}

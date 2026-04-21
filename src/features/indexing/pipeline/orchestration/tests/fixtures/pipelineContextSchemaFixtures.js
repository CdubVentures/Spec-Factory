export function makeSeed(overrides = {}) {
  return {
    config: { searchEngines: 'bing', discoveryEnabled: true },
    job: { productId: 'p1', brand: 'Razer', model: 'Viper V3' },
    category: 'mouse',
    categoryConfig: { category: 'mouse', fieldOrder: [] },
    runId: 'run-001',
    ...overrides,
  };
}

export function makeFocusGroup(overrides = {}) {
  return {
    key: 'sensor',
    label: 'Sensor',
    field_keys: ['dpi', 'polling_rate'],
    unresolved_field_keys: ['dpi'],
    priority: 'core',
    phase: 'now',
    group_search_worthy: true,
    skip_reason: null,
    normalized_key_queue: [{ normalized_key: 'dpi', repeat_count: 0 }],
    ...overrides,
  };
}

export function makeSeedSearchPlan(overrides = {}) {
  return {
    schema_version: 'needset_planner_output.v2',
    run: {
      run_id: 'run-001',
      category: 'mouse',
      product_id: 'p1',
      brand: 'Razer',
      model: 'Viper V3',
      base_model: 'Viper V3',
      aliases: [],
      round: 0,
    },
    planner: { mode: 'llm', planner_complete: true, planner_confidence: 0.9, queries_generated: 3 },
    search_plan_handoff: {
      queries: [{ q: 'razer viper v3 specs', family: 'spec' }],
      total: 1,
      query_hashes: [],
    },
    panel: { round: 0 },
    learning_writeback: { query_hashes_generated: [], queries_generated: [], families_used: [] },
    ...overrides,
  };
}

export function makeCandidate(overrides = {}) {
  return {
    url: 'https://razer.com/viper',
    host: 'razer.com',
    query: 'razer viper v3 specs',
    provider: 'bing',
    approvedDomain: true,
    tier: 1,
    doc_kind_guess: 'product_page',
    identity_match_level: 'strong',
    triage_disposition: 'fetch_high',
    score: 100,
    ...overrides,
  };
}

export function makeSerpExplorer(overrides = {}) {
  return {
    generated_at: '2026-03-23T00:00:00Z',
    query_count: 2,
    candidates_checked: 10,
    urls_selected: 3,
    urls_rejected: 5,
    hard_drop_count: 2,
    queries: [
      {
        query: 'razer viper v3 specs',
        result_count: 8,
        candidate_count: 5,
        selected_count: 2,
      },
    ],
    ...overrides,
  };
}

export function makeDiscoveryResult(overrides = {}) {
  return {
    enabled: true,
    candidates: [makeCandidate()],
    selectedUrls: ['https://razer.com/viper'],
    allCandidateUrls: ['https://razer.com/viper'],
    queries: ['razer viper v3 specs'],
    llm_queries: [],
    search_profile: { status: 'executed' },
    provider_state: { provider: 'bing' },
    query_concurrency: 1,
    internal_satisfied: false,
    external_search_reason: 'required_fields_missing_internal_under_target',
    search_attempts: [],
    search_journal: [],
    serp_explorer: makeSerpExplorer(),
    ...overrides,
  };
}

export function makeBootstrap(overrides = {}) {
  return {
    ...makeSeed(),
    focusGroups: [makeFocusGroup()],
    seedStatus: { specs_seed: { is_needed: true }, source_seeds: {} },
    seedSearchPlan: null,
    brandResolution: {
      officialDomain: 'razer.com',
      aliases: ['razer'],
      supportDomain: 'support.razer.com',
      confidence: 0.95,
      reasoning: ['Official website'],
    },
    variables: { brand: 'Razer', model: 'Viper V3', variant: '', category: 'mouse' },
    identityLock: { brand: 'Razer', model: 'Viper V3', variant: '', productId: 'p1' },
    missingFields: ['dpi', 'weight'],
    learning: { lexicon: {}, queryTemplates: [] },
    enrichedLexicon: {},
    planningHints: { missingRequiredFields: ['dpi'], missingCriticalFields: [] },
    queryExecutionHistory: { queries: [] },
    urlExecutionHistory: { urls: [] },
    ...overrides,
  };
}

export function makeProfile(overrides = {}) {
  return {
    ...makeBootstrap(),
    searchProfileBase: {
      category: 'mouse',
      identity: { brand: 'Razer', model: 'Viper V3' },
      queries: ['razer viper v3 specs'],
      query_rows: [
        {
          query: 'razer viper v3 specs',
          hint_source: 'tier1_seed',
          tier: 'seed',
          target_fields: [],
        },
      ],
      identity_aliases: [],
      variant_guard_terms: [],
      base_templates: ['razer viper v3'],
      focus_fields: ['dpi'],
      query_reject_log: [],
    },
    ...overrides,
  };
}

export function makePlanner(overrides = {}) {
  return {
    ...makeProfile(),
    enhancedRows: [{ query: 'razer viper v3 specs', tier: 'seed', hint_source: 'tier1_seed' }],
    ...overrides,
  };
}

export function makeJourney(overrides = {}) {
  return {
    ...makePlanner(),
    queries: ['razer viper v3 specs', 'razer viper v3 dpi'],
    selectedQueryRowMap: new Map(),
    profileQueryRowsByQuery: new Map(),
    searchProfilePlanned: { status: 'planned' },
    executionQueryLimit: 2,
    queryLimit: 10,
    queryRejectLogCombined: [],
    ...overrides,
  };
}

export function makeExecution(overrides = {}) {
  return {
    ...makeJourney(),
    discoveryCap: 20,
    providerState: { provider: 'bing', internet_ready: true },
    requiredOnlySearch: false,
    missingRequiredFields: ['dpi'],
    searchResults: [
      {
        url: 'https://razer.com/viper',
        title: 'Viper V3',
        snippet: 'specs',
        provider: 'bing',
        query: 'razer viper v3 specs',
      },
    ],
    searchAttempts: [
      {
        query: 'razer viper v3 specs',
        provider: 'bing',
        result_count: 8,
        reason_code: 'internet_search',
      },
    ],
    searchJournal: [
      {
        ts: '2026-03-23T00:00:00Z',
        query: 'razer viper v3 specs',
        provider: 'bing',
        result_count: 8,
      },
    ],
    internalSatisfied: false,
    externalSearchReason: null,
    ...overrides,
  };
}

export function makeResults(overrides = {}) {
  return {
    ...makeExecution(),
    discoveryResult: makeDiscoveryResult(),
    ...overrides,
  };
}

/**
 * Contract tests for the cumulative pipeline context schema.
 *
 * Validates that checkpoint schemas accept valid data, reject invalid data,
 * and extend monotonically (no fields lost between checkpoints).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pipelineContextSeed,
  pipelineContextAfterBootstrap,
  pipelineContextAfterProfile,
  pipelineContextAfterPlanner,
  pipelineContextAfterJourney,
  pipelineContextAfterExecution,
  pipelineContextAfterResults,
  pipelineContextFinal,
  rawResultElementSchema,
  searchAttemptElementSchema,
  searchJournalElementSchema,
  focusGroupElementSchema,
  seedStatusSchema,
  seedSearchPlanSchema,
  queryRowSchema,
  searchProfileBaseSchema,
  candidateRowSchema,
  serpExplorerSchema,
  discoveryResultSchema,
  validatePipelineCheckpoint,
} from '../src/features/indexing/discovery/pipelineContextSchema.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeSeed(overrides = {}) {
  return {
    config: { searchEngines: 'bing', discoveryEnabled: true },
    job: { productId: 'p1', brand: 'Razer', model: 'Viper V3' },
    category: 'mouse',
    categoryConfig: { category: 'mouse', fieldOrder: [] },
    runId: 'run-001',
    ...overrides,
  };
}

function makeFocusGroup(overrides = {}) {
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

function makeSeedSearchPlan(overrides = {}) {
  return {
    schema_version: 'needset_planner_output.v2',
    run: { run_id: 'run-001', category: 'mouse', product_id: 'p1', brand: 'Razer', model: 'Viper V3', base_model: 'Viper V3', aliases: [], round: 0 },
    planner: { mode: 'llm', planner_complete: true, planner_confidence: 0.9, queries_generated: 3 },
    search_plan_handoff: { queries: [{ q: 'razer viper v3 specs', family: 'spec' }], total: 1, query_hashes: [] },
    panel: { round: 0 },
    learning_writeback: { query_hashes_generated: [], queries_generated: [], families_used: [] },
    ...overrides,
  };
}

function makeCandidate(overrides = {}) {
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

function makeSerpExplorer(overrides = {}) {
  return {
    generated_at: '2026-03-23T00:00:00Z',
    query_count: 2,
    candidates_checked: 10,
    urls_selected: 3,
    urls_rejected: 5,
    hard_drop_count: 2,
    queries: [{ query: 'razer viper v3 specs', result_count: 8, candidate_count: 5, selected_count: 2 }],
    ...overrides,
  };
}

function makeDiscoveryResult(overrides = {}) {
  return {
    enabled: true,
    discoveryKey: 'discovery/mouse/p1/run-001.json',
    candidatesKey: 'candidates/mouse/p1/run-001.json',
    candidates: [makeCandidate()],
    selectedUrls: ['https://razer.com/viper'],
    allCandidateUrls: ['https://razer.com/viper'],
    queries: ['razer viper v3 specs'],
    llm_queries: [],
    search_profile: { status: 'executed' },
    search_profile_key: 'sp/k1',
    search_profile_run_key: 'sp/k2',
    search_profile_latest_key: 'sp/k3',
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

function makeBootstrap(overrides = {}) {
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
    searchProfileCaps: { deterministicAliasCap: 6 },
    planningHints: { missingRequiredFields: ['dpi'], missingCriticalFields: [] },
    queryExecutionHistory: { queries: [] },
    ...overrides,
  };
}

function makeProfile(overrides = {}) {
  return {
    ...makeBootstrap(),
    searchProfileBase: {
      category: 'mouse',
      identity: { brand: 'Razer', model: 'Viper V3' },
      queries: ['razer viper v3 specs'],
      query_rows: [{ query: 'razer viper v3 specs', hint_source: 'tier1_seed', tier: 'seed', target_fields: [] }],
      identity_aliases: [],
      variant_guard_terms: [],
      base_templates: ['razer viper v3'],
      focus_fields: ['dpi'],
      query_reject_log: [],
    },
    ...overrides,
  };
}

function makePlanner(overrides = {}) {
  return {
    ...makeProfile(),
    enhancedRows: [{ query: 'razer viper v3 specs', tier: 'seed', hint_source: 'tier1_seed' }],
    ...overrides,
  };
}

function makeJourney(overrides = {}) {
  return {
    ...makePlanner(),
    queries: ['razer viper v3 specs', 'razer viper v3 dpi'],
    selectedQueryRowMap: new Map(),
    profileQueryRowsByQuery: new Map(),
    searchProfilePlanned: { status: 'planned' },
    searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
    executionQueryLimit: 2,
    queryLimit: 10,
    queryRejectLogCombined: [],
    ...overrides,
  };
}

function makeExecution(overrides = {}) {
  return {
    ...makeJourney(),
    resultsPerQuery: 8,
    discoveryCap: 20,
    queryConcurrency: 1,
    providerState: { provider: 'bing', internet_ready: true },
    requiredOnlySearch: false,
    missingRequiredFields: ['dpi'],
    rawResults: [
      { url: 'https://razer.com/viper', title: 'Viper V3', snippet: 'specs', provider: 'bing', query: 'razer viper v3 specs' },
    ],
    searchAttempts: [
      { query: 'razer viper v3 specs', provider: 'bing', result_count: 8, reason_code: 'internet_search' },
    ],
    searchJournal: [
      { ts: '2026-03-23T00:00:00Z', query: 'razer viper v3 specs', provider: 'bing', result_count: 8 },
    ],
    internalSatisfied: false,
    externalSearchReason: null,
    ...overrides,
  };
}

function makeResults(overrides = {}) {
  return {
    ...makeExecution(),
    discoveryResult: makeDiscoveryResult(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Seed checkpoint
// ---------------------------------------------------------------------------

test('pipelineContextSeed — accepts valid seed data', () => {
  const result = pipelineContextSeed.safeParse(makeSeed());
  assert.equal(result.success, true);
});

test('pipelineContextSeed — rejects missing config', () => {
  const result = pipelineContextSeed.safeParse(makeSeed({ config: undefined }));
  assert.equal(result.success, false);
});

test('pipelineContextSeed — rejects missing job', () => {
  const result = pipelineContextSeed.safeParse(makeSeed({ job: undefined }));
  assert.equal(result.success, false);
});

test('pipelineContextSeed — rejects missing category', () => {
  const result = pipelineContextSeed.safeParse(makeSeed({ category: undefined }));
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// AfterBootstrap checkpoint
// ---------------------------------------------------------------------------

test('pipelineContextAfterBootstrap — accepts full Stage 01+02 merge', () => {
  const result = pipelineContextAfterBootstrap.safeParse(makeBootstrap());
  assert.equal(result.success, true);
});

test('pipelineContextAfterBootstrap — accepts null brandResolution', () => {
  const result = pipelineContextAfterBootstrap.safeParse(makeBootstrap({ brandResolution: null }));
  assert.equal(result.success, true);
});

test('pipelineContextAfterBootstrap — rejects missing focusGroups', () => {
  const data = makeBootstrap();
  delete data.focusGroups;
  const result = pipelineContextAfterBootstrap.safeParse(data);
  assert.equal(result.success, false);
});

test('pipelineContextAfterBootstrap — rejects missing missingFields', () => {
  const data = makeBootstrap();
  delete data.missingFields;
  const result = pipelineContextAfterBootstrap.safeParse(data);
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// AfterProfile checkpoint
// ---------------------------------------------------------------------------

test('pipelineContextAfterProfile — accepts bootstrap + profile fields', () => {
  const result = pipelineContextAfterProfile.safeParse(makeProfile());
  assert.equal(result.success, true);
});

test('pipelineContextAfterProfile — rejects missing searchProfileBase', () => {
  const data = makeProfile();
  delete data.searchProfileBase;
  const result = pipelineContextAfterProfile.safeParse(data);
  assert.equal(result.success, false);
});


// ---------------------------------------------------------------------------
// AfterPlanner checkpoint
// ---------------------------------------------------------------------------

test('pipelineContextAfterPlanner — accepts profile + enhancedRows', () => {
  const result = pipelineContextAfterPlanner.safeParse(makePlanner());
  assert.equal(result.success, true);
});

test('pipelineContextAfterPlanner — rejects missing enhancedRows', () => {
  const data = makePlanner();
  delete data.enhancedRows;
  const result = pipelineContextAfterPlanner.safeParse(data);
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// AfterJourney checkpoint
// ---------------------------------------------------------------------------

test('pipelineContextAfterJourney — accepts planner + journey outputs', () => {
  const result = pipelineContextAfterJourney.safeParse(makeJourney());
  assert.equal(result.success, true);
});

test('pipelineContextAfterJourney — rejects missing queries', () => {
  const data = makeJourney();
  delete data.queries;
  const result = pipelineContextAfterJourney.safeParse(data);
  assert.equal(result.success, false);
});

test('pipelineContextAfterJourney — rejects missing executionQueryLimit', () => {
  const data = makeJourney();
  delete data.executionQueryLimit;
  const result = pipelineContextAfterJourney.safeParse(data);
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// AfterExecution checkpoint
// ---------------------------------------------------------------------------

test('pipelineContextAfterExecution — accepts journey + execution outputs', () => {
  const result = pipelineContextAfterExecution.safeParse(makeExecution());
  assert.equal(result.success, true);
});

test('pipelineContextAfterExecution — rejects missing rawResults', () => {
  const data = makeExecution();
  delete data.rawResults;
  const result = pipelineContextAfterExecution.safeParse(data);
  assert.equal(result.success, false);
});

test('pipelineContextAfterExecution — rejects malformed rawResults element', () => {
  const result = pipelineContextAfterExecution.safeParse(makeExecution({
    rawResults: [{ title: 'no url or provider' }],
  }));
  assert.equal(result.success, false);
});

test('pipelineContextAfterExecution — rejects malformed searchAttempts element', () => {
  const result = pipelineContextAfterExecution.safeParse(makeExecution({
    searchAttempts: [{ query: 'q1' }],
  }));
  assert.equal(result.success, false);
});

test('pipelineContextAfterExecution — accepts null externalSearchReason', () => {
  const result = pipelineContextAfterExecution.safeParse(makeExecution({ externalSearchReason: null }));
  assert.equal(result.success, true);
});

// ---------------------------------------------------------------------------
// AfterResults checkpoint
// ---------------------------------------------------------------------------

test('pipelineContextAfterResults — accepts execution + discoveryResult', () => {
  const result = pipelineContextAfterResults.safeParse(makeResults());
  assert.equal(result.success, true);
});

test('pipelineContextAfterResults — rejects missing discoveryResult', () => {
  const data = makeResults();
  delete data.discoveryResult;
  const result = pipelineContextAfterResults.safeParse(data);
  assert.equal(result.success, false);
});

test('pipelineContextAfterResults — rejects discoveryResult without candidates', () => {
  const incomplete = makeDiscoveryResult();
  delete incomplete.candidates;
  const result = pipelineContextAfterResults.safeParse(makeResults({
    discoveryResult: incomplete,
  }));
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Final checkpoint
// ---------------------------------------------------------------------------

test('pipelineContextFinal — is identical to AfterResults', () => {
  const result = pipelineContextFinal.safeParse(makeResults());
  assert.equal(result.success, true);
});

// ---------------------------------------------------------------------------
// Sub-schema validation
// ---------------------------------------------------------------------------

test('rawResultElementSchema — requires url, provider, query', () => {
  const valid = rawResultElementSchema.safeParse({
    url: 'https://example.com', provider: 'bing', query: 'test',
  });
  assert.equal(valid.success, true);

  const missingUrl = rawResultElementSchema.safeParse({ provider: 'bing', query: 'test' });
  assert.equal(missingUrl.success, false);

  const missingProvider = rawResultElementSchema.safeParse({ url: 'https://example.com', query: 'test' });
  assert.equal(missingProvider.success, false);

  const missingQuery = rawResultElementSchema.safeParse({ url: 'https://example.com', provider: 'bing' });
  assert.equal(missingQuery.success, false);
});

test('searchAttemptElementSchema — requires query, provider, result_count, reason_code', () => {
  const valid = searchAttemptElementSchema.safeParse({
    query: 'test', provider: 'bing', result_count: 8, reason_code: 'internet_search',
  });
  assert.equal(valid.success, true);

  const missingReasonCode = searchAttemptElementSchema.safeParse({
    query: 'test', provider: 'bing', result_count: 8,
  });
  assert.equal(missingReasonCode.success, false);
});

test('searchJournalElementSchema — requires ts, query, provider, result_count', () => {
  const valid = searchJournalElementSchema.safeParse({
    ts: '2026-03-23T00:00:00Z', query: 'test', provider: 'bing', result_count: 8,
  });
  assert.equal(valid.success, true);

  const missingTs = searchJournalElementSchema.safeParse({
    query: 'test', provider: 'bing', result_count: 8,
  });
  assert.equal(missingTs.success, false);
});

// ---------------------------------------------------------------------------
// NeedSet sub-schema validation
// ---------------------------------------------------------------------------

test('focusGroupElementSchema — rejects missing key', () => {
  const result = focusGroupElementSchema.safeParse({ ...makeFocusGroup(), key: undefined });
  assert.equal(result.success, false);
});

test('focusGroupElementSchema — rejects missing field_keys', () => {
  const data = makeFocusGroup();
  delete data.field_keys;
  const result = focusGroupElementSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('seedStatusSchema — rejects missing specs_seed', () => {
  const result = seedStatusSchema.safeParse({ source_seeds: {} });
  assert.equal(result.success, false);
});

test('seedStatusSchema — rejects specs_seed without is_needed', () => {
  const result = seedStatusSchema.safeParse({ specs_seed: {}, source_seeds: {} });
  assert.equal(result.success, false);
});

test('seedSearchPlanSchema — validates schema_version + planner + handoff', () => {
  const result = seedSearchPlanSchema.safeParse(makeSeedSearchPlan());
  assert.equal(result.success, true);
});

test('seedSearchPlanSchema — rejects missing planner', () => {
  const data = makeSeedSearchPlan();
  delete data.planner;
  const result = seedSearchPlanSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('seedSearchPlanSchema — rejects planner without mode', () => {
  const result = seedSearchPlanSchema.safeParse(makeSeedSearchPlan({
    planner: { planner_complete: true },
  }));
  assert.equal(result.success, false);
});

test('pipelineContextAfterBootstrap — accepts non-null seedSearchPlan', () => {
  const result = pipelineContextAfterBootstrap.safeParse(
    makeBootstrap({ seedSearchPlan: makeSeedSearchPlan() }),
  );
  assert.equal(result.success, true);
});

// ---------------------------------------------------------------------------
// Search Profile sub-schema validation
// ---------------------------------------------------------------------------

test('queryRowSchema — requires query, hint_source, tier, target_fields', () => {
  const valid = queryRowSchema.safeParse({
    query: 'test', hint_source: 'tier1_seed', tier: 'seed', target_fields: [],
  });
  assert.equal(valid.success, true);

  const missingQuery = queryRowSchema.safeParse({
    hint_source: 'tier1_seed', tier: 'seed', target_fields: [],
  });
  assert.equal(missingQuery.success, false);
});

test('searchProfileBaseSchema — rejects missing query_rows', () => {
  const data = makeProfile().searchProfileBase;
  delete data.query_rows;
  const result = searchProfileBaseSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('searchProfileBaseSchema — rejects missing category', () => {
  const data = makeProfile().searchProfileBase;
  delete data.category;
  const result = searchProfileBaseSchema.safeParse(data);
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Stage 07 sub-schema validation
// ---------------------------------------------------------------------------

test('candidateRowSchema — rejects missing url', () => {
  const data = makeCandidate();
  delete data.url;
  const result = candidateRowSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('candidateRowSchema — rejects missing provider', () => {
  const data = makeCandidate();
  delete data.provider;
  const result = candidateRowSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('candidateRowSchema — accepts null tier', () => {
  const result = candidateRowSchema.safeParse(makeCandidate({ tier: null }));
  assert.equal(result.success, true);
});

test('serpExplorerSchema — validates query_count + queries array', () => {
  const result = serpExplorerSchema.safeParse(makeSerpExplorer());
  assert.equal(result.success, true);
});

test('serpExplorerSchema — rejects missing queries array', () => {
  const data = makeSerpExplorer();
  delete data.queries;
  const result = serpExplorerSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('discoveryResultSchema — rejects missing discoveryKey', () => {
  const data = makeDiscoveryResult();
  delete data.discoveryKey;
  const result = discoveryResultSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('discoveryResultSchema — rejects missing serp_explorer', () => {
  const data = makeDiscoveryResult();
  delete data.serp_explorer;
  const result = discoveryResultSchema.safeParse(data);
  assert.equal(result.success, false);
});

test('discoveryResultSchema — rejects candidate without url', () => {
  const result = discoveryResultSchema.safeParse(makeDiscoveryResult({
    candidates: [{ host: 'razer.com', query: 'q', provider: 'bing', approvedDomain: true, tier: 1 }],
  }));
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Progressive extension is monotonic
// ---------------------------------------------------------------------------

test('progressive extension — later checkpoints accept earlier data', () => {
  const fullData = makeResults();

  // Every checkpoint from AfterResults back to Seed should accept full data
  assert.equal(pipelineContextSeed.safeParse(fullData).success, true,
    'Seed should accept full data (passthrough)');
  assert.equal(pipelineContextAfterBootstrap.safeParse(fullData).success, true,
    'AfterBootstrap should accept full data');
  assert.equal(pipelineContextAfterProfile.safeParse(fullData).success, true,
    'AfterProfile should accept full data');
  assert.equal(pipelineContextAfterPlanner.safeParse(fullData).success, true,
    'AfterPlanner should accept full data');
  assert.equal(pipelineContextAfterJourney.safeParse(fullData).success, true,
    'AfterJourney should accept full data');
  assert.equal(pipelineContextAfterExecution.safeParse(fullData).success, true,
    'AfterExecution should accept full data');
  assert.equal(pipelineContextAfterResults.safeParse(fullData).success, true,
    'AfterResults should accept full data');
});

// ---------------------------------------------------------------------------
// Passthrough allows extra fields
// ---------------------------------------------------------------------------

test('passthrough — unknown fields do not cause validation failure', () => {
  const data = { ...makeSeed(), extraField: 'hello', anotherOne: 42 };
  const result = pipelineContextSeed.safeParse(data);
  assert.equal(result.success, true);
});

test('passthrough — extra fields preserved in parsed output', () => {
  const data = { ...makeSeed(), extraField: 'hello' };
  const result = pipelineContextSeed.safeParse(data);
  assert.equal(result.success, true);
  assert.equal(result.data.extraField, 'hello');
});

// ---------------------------------------------------------------------------
// validatePipelineCheckpoint convenience function
// ---------------------------------------------------------------------------

test('validatePipelineCheckpoint — returns valid for correct data', () => {
  const result = validatePipelineCheckpoint('seed', makeSeed());
  assert.equal(result.valid, true);
  assert.equal(result.errors, undefined);
});

test('validatePipelineCheckpoint — returns errors for invalid data', () => {
  const result = validatePipelineCheckpoint('seed', {});
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].path);
  assert.ok(result.errors[0].message);
});

test('validatePipelineCheckpoint — returns error for unknown checkpoint', () => {
  const result = validatePipelineCheckpoint('nonexistent', {});
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].message, 'Unknown checkpoint: nonexistent');
});

test('validatePipelineCheckpoint — logs warning on failure', () => {
  const warnings = [];
  const logger = { warn: (name, data) => warnings.push({ name, data }) };
  validatePipelineCheckpoint('seed', {}, logger);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].name, 'pipeline_context_validation_failed');
  assert.equal(warnings[0].data.checkpoint, 'seed');
  assert.ok(warnings[0].data.error_count > 0);
});

test('validatePipelineCheckpoint — does not log on success', () => {
  const warnings = [];
  const logger = { warn: (name, data) => warnings.push({ name, data }) };
  validatePipelineCheckpoint('seed', makeSeed(), logger);
  assert.equal(warnings.length, 0);
});

// ---------------------------------------------------------------------------
// Enforcement modes
// ---------------------------------------------------------------------------

test('enforce mode — throws on invalid data', () => {
  const config = { pipelineSchemaEnforcementMode: 'enforce' };
  assert.throws(
    () => validatePipelineCheckpoint('seed', {}, null, config),
    (err) => err.message.includes('Pipeline schema validation failed at seed'),
  );
});

test('enforce mode — does not throw on valid data', () => {
  const config = { pipelineSchemaEnforcementMode: 'enforce' };
  const result = validatePipelineCheckpoint('seed', makeSeed(), null, config);
  assert.equal(result.valid, true);
});

test('warn mode — does not throw on invalid data', () => {
  const config = { pipelineSchemaEnforcementMode: 'warn' };
  const result = validatePipelineCheckpoint('seed', {}, null, config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('off mode — skips validation entirely', () => {
  const config = { pipelineSchemaEnforcementMode: 'off' };
  const result = validatePipelineCheckpoint('seed', {}, null, config);
  assert.equal(result.valid, true);
  assert.equal(result.errors, undefined);
});

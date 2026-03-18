import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContractEffortPlan,
  buildRoundConfig,
  buildRoundRequirements,
  explainSearchProviderSelection,
  evaluateRequiredSearchExhaustion,
  resolveMissingRequiredForPlanning,
  selectRoundSearchProvider,
  shouldStopForBudgetExhaustion,
  shouldForceExpectedFieldRetry,
  normalizeFieldContractToken,
  calcProgressDelta,
  isIdentityOrEditorialField,
  makeLlmTargetFields
} from '../src/runner/runUntilComplete.js';

test('shouldForceExpectedFieldRetry forces one extra loop for expected required fields with not_found_after_search', () => {
  const result = shouldForceExpectedFieldRetry({
    summary: {
      missing_required_fields: ['fields.weight', 'dpi'],
      field_reasoning: {
        weight: { unknown_reason: 'not_found_after_search' },
        dpi: { unknown_reason: 'not_found_after_search' }
      }
    },
    categoryConfig: {
      fieldOrder: ['weight', 'dpi']
    },
    fieldAvailabilityArtifact: {
      fields: {
        weight: { classification: 'expected' },
        dpi: { classification: 'sometimes' }
      }
    },
    overrideCount: 0
  });

  assert.equal(result.force, true);
  assert.deepEqual(result.fields, ['weight']);
  assert.equal(result.reason, 'expected_required_not_found');
});

test('shouldForceExpectedFieldRetry does not force when blocked/budget/identity reasons are present', () => {
  const result = shouldForceExpectedFieldRetry({
    summary: {
      missing_required_fields: ['weight'],
      field_reasoning: {
        weight: { unknown_reason: 'not_found_after_search' },
        dpi: { unknown_reason: 'budget_exhausted' }
      }
    },
    categoryConfig: {
      fieldOrder: ['weight', 'dpi']
    },
    fieldAvailabilityArtifact: {
      fields: {
        weight: { classification: 'expected' }
      }
    },
    overrideCount: 0
  });

  assert.equal(result.force, false);
  assert.equal(result.reason, 'blocked_or_budget_or_identity');
});

test('shouldForceExpectedFieldRetry only forces once per run', () => {
  const result = shouldForceExpectedFieldRetry({
    summary: {
      missing_required_fields: ['weight'],
      field_reasoning: {
        weight: { unknown_reason: 'not_found_after_search' }
      }
    },
    categoryConfig: {
      fieldOrder: ['weight']
    },
    fieldAvailabilityArtifact: {
      fields: {
        weight: { classification: 'expected' }
      }
    },
    overrideCount: 1
  });

  assert.equal(result.force, false);
  assert.equal(result.reason, 'already_forced_once');
});

test('buildRoundRequirements preserves base required fields across rounds', () => {
  const job = {
    productId: 'mouse-logitech-g-pro-x-superlight-2',
    requirements: {
      requiredFields: ['identity.brand', 'fields.connection']
    }
  };
  const out = buildRoundRequirements(job, ['weight'], {
    missing_required_fields: []
  });

  assert.deepEqual(out.requirements.focus_fields, ['weight']);
  assert.deepEqual(out.requirements.requiredFields, ['identity.brand', 'fields.connection']);
});

test('buildRoundRequirements unions previous missing required fields without dropping base required fields', () => {
  const job = {
    requirements: {
      requiredFields: ['identity.brand', 'fields.connection']
    }
  };
  const out = buildRoundRequirements(job, ['weight'], {
    missing_required_fields: ['fields.dpi', 'fields.connection']
  });

  assert.deepEqual(
    out.requirements.requiredFields,
    ['identity.brand', 'fields.connection', 'fields.dpi']
  );
});

test('buildRoundRequirements falls back to planning required fields when previous summary has no missing_required_fields', () => {
  const job = {
    requirements: {
      requiredFields: ['identity.brand']
    }
  };
  const out = buildRoundRequirements(job, ['weight'], {
    validated: false,
    missing_required_fields: []
  }, ['fields.connection', 'fields.dpi']);

  assert.deepEqual(
    out.requirements.requiredFields,
    ['identity.brand', 'fields.connection', 'fields.dpi']
  );
});

test('resolveMissingRequiredForPlanning restores category required fields for unresolved aggressive rounds', () => {
  const missing = resolveMissingRequiredForPlanning({
    previousSummary: {
      validated: false,
      missing_required_fields: [],
      critical_fields_below_pass_target: ['polling_rate']
    },
    categoryConfig: {
      fieldOrder: ['connection', 'dpi', 'polling_rate'],
      requiredFields: ['connection', 'dpi']
    }
  });

  assert.deepEqual(missing, ['connection', 'dpi']);
});

test('evaluateRequiredSearchExhaustion stops after required-field loop has no new urls/fields', () => {
  const stop = evaluateRequiredSearchExhaustion({
    round: 2,
    missingRequiredCount: 2,
    noNewUrlsRounds: 2,
    noNewFieldsRounds: 2,
    threshold: 2
  });
  assert.equal(stop.stop, true);
  assert.equal(stop.reason, 'required_search_exhausted_no_new_urls_or_fields');
});

test('evaluateRequiredSearchExhaustion continues before threshold or without missing required fields', () => {
  const pending = evaluateRequiredSearchExhaustion({
    round: 1,
    missingRequiredCount: 1,
    noNewUrlsRounds: 1,
    noNewFieldsRounds: 0,
    threshold: 2
  });
  assert.equal(pending.stop, false);
  assert.equal(pending.reason, 'continue');

  const noMissing = evaluateRequiredSearchExhaustion({
    round: 3,
    missingRequiredCount: 0,
    noNewUrlsRounds: 4,
    noNewFieldsRounds: 4,
    threshold: 2
  });
  assert.equal(noMissing.stop, false);
});

test('shouldStopForBudgetExhaustion does not stop for per-round budget caps', () => {
  const stop = shouldStopForBudgetExhaustion({
    budgetBlockedReason: 'budget_max_calls_per_round_reached',
    round: 1
  });
  assert.equal(stop, false);
});

test('shouldStopForBudgetExhaustion stops for hard budget reasons after round 0', () => {
  const round0Stop = shouldStopForBudgetExhaustion({
    budgetBlockedReason: 'budget_max_calls_per_product_reached',
    round: 0
  });
  assert.equal(round0Stop, false);

  const round1Stop = shouldStopForBudgetExhaustion({
    budgetBlockedReason: 'budget_max_calls_per_product_reached',
    round: 1
  });
  assert.equal(round1Stop, true);
});

test('selectRoundSearchProvider returns empty when no engines configured despite searxng ready', () => {
  const provider = selectRoundSearchProvider({
    baseConfig: {
      searchEngines: '',
      searxngBaseUrl: 'http://127.0.0.1:8080'
    },
    discoveryEnabled: true,
    missingRequiredCount: 2,
    requiredSearchIteration: 2
  });
  assert.equal(provider, '');
});

test('selectRoundSearchProvider uses configured engines when searxng is ready', () => {
  const provider = selectRoundSearchProvider({
    baseConfig: {
      searchEngines: 'bing,startpage',
      searxngBaseUrl: 'http://127.0.0.1:8080'
    },
    discoveryEnabled: true,
    missingRequiredCount: 2,
    requiredSearchIteration: 1
  });
  assert.equal(provider, 'bing,startpage');
});

test('selectRoundSearchProvider honors configured google provider in keyless mode', () => {
  const provider = selectRoundSearchProvider({
    baseConfig: {
      searchEngines: 'google',
      searxngBaseUrl: 'http://127.0.0.1:8080'
    },
    discoveryEnabled: true,
    missingRequiredCount: 2,
    requiredSearchIteration: 0
  });
  assert.equal(provider, 'google');
});

test('selectRoundSearchProvider returns empty when no engines configured', () => {
  const provider = selectRoundSearchProvider({
    baseConfig: {
      searchEngines: '',
      searxngBaseUrl: 'http://127.0.0.1:8080'
    },
    discoveryEnabled: true,
    missingRequiredCount: 1
  });
  assert.equal(provider, '');
});

test('selectRoundSearchProvider returns empty when discovery is disabled', () => {
  const provider = selectRoundSearchProvider({
    baseConfig: {
      searchEngines: 'bing,google',
      searxngBaseUrl: 'http://127.0.0.1:8080'
    },
    discoveryEnabled: false,
    missingRequiredCount: 3
  });
  assert.equal(provider, '');
});

test('explainSearchProviderSelection reports no engines configured when searchEngines is empty', () => {
  const selection = explainSearchProviderSelection({
    baseConfig: {
      searchEngines: '',
      searxngBaseUrl: 'http://127.0.0.1:8080'
    },
    discoveryEnabled: true,
    missingRequiredCount: 2,
    requiredSearchIteration: 2
  });

  assert.equal(selection.provider, '');
  assert.equal(selection.reason_code, 'no_engines_configured');
  assert.equal(selection.free_provider_ready, true);
});

test('explainSearchProviderSelection reports engines ready when configured', () => {
  const selection = explainSearchProviderSelection({
    baseConfig: {
      searchEngines: 'bing,startpage',
      searxngBaseUrl: 'http://127.0.0.1:8080'
    },
    discoveryEnabled: true,
    missingRequiredCount: 2,
    requiredSearchIteration: 1
  });

  assert.equal(selection.provider, 'bing,startpage');
  assert.equal(selection.reason_code, 'engines_ready');
});

test('buildRoundConfig keeps discovery disabled when required fields are already complete', () => {
  const roundConfig = buildRoundConfig(
    {
      runProfile: 'standard',
      discoveryEnabled: true,
      fetchCandidateSources: true,
      searchEngines: 'bing,startpage,duckduckgo',
      searxngBaseUrl: 'http://127.0.0.1:8080',
      maxUrlsPerProduct: 80,
      maxCandidateUrls: 120,
      maxPagesPerDomain: 3,
      llmMaxCallsPerRound: 4,

      endpointSignalLimit: 30,
      endpointSuggestionLimit: 12,
      endpointNetworkScanLimit: 600,
      hypothesisAutoFollowupRounds: 0,
      hypothesisFollowupUrlsPerRound: 12,
      postLoadWaitMs: 0,
      autoScrollEnabled: false,
      autoScrollPasses: 0,

    },
    {
      round: 1,
      missingRequiredCount: 0
    }
  );

  assert.equal(roundConfig.discoveryEnabled, false);
  assert.equal(roundConfig.fetchCandidateSources, false);
  assert.equal(roundConfig.searchEngines, '');
  assert.equal(roundConfig.maxUrlsPerProduct <= 48, true);
  assert.equal(roundConfig.maxCandidateUrls <= 48, true);
});

test('buildRoundConfig keeps aggressive discovery enabled when critical gaps remain and product not validated', () => {
  const roundConfig = buildRoundConfig(
    {
      runProfile: 'standard',
      discoveryEnabled: true,
      fetchCandidateSources: true,
      searchEngines: 'bing,startpage,duckduckgo',
      searxngBaseUrl: 'http://127.0.0.1:8080',
      maxUrlsPerProduct: 80,
      maxCandidateUrls: 120,
      maxPagesPerDomain: 3,
      llmMaxCallsPerRound: 4,

      llmMaxCallsPerProductTotal: 12,
      endpointSignalLimit: 30,
      endpointSuggestionLimit: 12,
      endpointNetworkScanLimit: 600,
      hypothesisAutoFollowupRounds: 0,
      hypothesisFollowupUrlsPerRound: 12,
      postLoadWaitMs: 0,
      autoScrollEnabled: false,
      autoScrollPasses: 0,

    },
    {
      round: 1,
      missingRequiredCount: 0,
      missingExpectedCount: 0,
      missingCriticalCount: 1,
      previousValidated: false
    }
  );

  assert.equal(roundConfig.discoveryEnabled, true);
  assert.equal(roundConfig.fetchCandidateSources, true);
  assert.equal(roundConfig.searchEngines, 'bing,startpage,duckduckgo');
  assert.equal(roundConfig.llmMaxCallsPerRound >= 4, true);
  assert.equal(roundConfig.llmMaxCallsPerProductTotal >= 12, true);
});

test('buildRoundConfig uses configured engines when required fields are missing', () => {
  const roundConfig = buildRoundConfig(
    {
      runProfile: 'standard',
      discoveryEnabled: true,
      fetchCandidateSources: true,
      searchEngines: 'bing,startpage,duckduckgo',
      searxngBaseUrl: 'http://127.0.0.1:8080',
      maxUrlsPerProduct: 80,
      maxCandidateUrls: 120,
      maxPagesPerDomain: 3,
      llmMaxCallsPerRound: 4,

      endpointSignalLimit: 30,
      endpointSuggestionLimit: 12,
      endpointNetworkScanLimit: 600,
      hypothesisAutoFollowupRounds: 0,
      hypothesisFollowupUrlsPerRound: 12,
      postLoadWaitMs: 0,
      autoScrollEnabled: false,
      autoScrollPasses: 0,

    },
    {
      round: 1,
      missingRequiredCount: 2,
      requiredSearchIteration: 2
    }
  );

  assert.equal(roundConfig.discoveryEnabled, true);
  assert.equal(roundConfig.fetchCandidateSources, true);
  assert.equal(roundConfig.searchEngines, 'bing,startpage,duckduckgo');
});

test('buildRoundConfig defers external discovery on first required-search iteration when internal-first is enabled', () => {
  const roundConfig = buildRoundConfig(
    {
      runProfile: 'standard',
      discoveryEnabled: true,
      fetchCandidateSources: true,
      discoveryInternalFirst: true,
      searchEngines: 'bing,startpage,duckduckgo',
      searxngBaseUrl: 'http://127.0.0.1:8080',
      maxUrlsPerProduct: 80,
      maxCandidateUrls: 120,
      maxPagesPerDomain: 3,
      llmMaxCallsPerRound: 4,

      endpointSignalLimit: 30,
      endpointSuggestionLimit: 12,
      endpointNetworkScanLimit: 600,
      hypothesisAutoFollowupRounds: 0,
      hypothesisFollowupUrlsPerRound: 12,
      postLoadWaitMs: 0,
      autoScrollEnabled: false,
      autoScrollPasses: 0,

    },
    {
      round: 1,
      missingRequiredCount: 2,
      requiredSearchIteration: 1
    }
  );

  assert.equal(roundConfig.discoveryEnabled, false);
  assert.equal(roundConfig.fetchCandidateSources, false);
  assert.equal(roundConfig.searchEngines, '');
});

test('buildRoundConfig enables one expected-field search pass when required fields are complete', () => {
  const roundConfig = buildRoundConfig(
    {
      runProfile: 'standard',
      discoveryEnabled: true,
      fetchCandidateSources: true,
      searchEngines: 'bing,startpage,duckduckgo',
      searxngBaseUrl: 'http://127.0.0.1:8080',
      maxUrlsPerProduct: 80,
      maxCandidateUrls: 120,
      maxPagesPerDomain: 3,
      llmMaxCallsPerRound: 4,

      endpointSignalLimit: 30,
      endpointSuggestionLimit: 12,
      endpointNetworkScanLimit: 600,
      hypothesisAutoFollowupRounds: 0,
      hypothesisFollowupUrlsPerRound: 12,
      postLoadWaitMs: 0,
      autoScrollEnabled: false,
      autoScrollPasses: 0,

    },
    {
      round: 1,
      missingRequiredCount: 0,
      missingExpectedCount: 2,
      requiredSearchIteration: 2
    }
  );

  assert.equal(roundConfig.discoveryEnabled, true);
  assert.equal(roundConfig.fetchCandidateSources, true);
  assert.equal(roundConfig.searchEngines, 'bing,startpage,duckduckgo');
});

test('buildRoundConfig applies fast round 0 using llmMaxCallsPerRound directly', () => {
  const roundConfig = buildRoundConfig(
    {
      runProfile: 'standard',
      llmMaxCallsPerRound: 4,
      discoveryEnabled: false,
      fetchCandidateSources: false,
      searchEngines: '',
      maxUrlsPerProduct: 30,
      maxCandidateUrls: 40
    },
    {
      round: 0,
      missingRequiredCount: 3
    }
  );

  assert.equal(roundConfig.runProfile, 'standard');
  assert.equal(roundConfig.llmMaxCallsPerRound, 4);
});

test('buildRoundConfig keeps aggressive round 1 in standard profile by default', () => {
  const roundConfig = buildRoundConfig(
    {
      runProfile: 'standard',
      aggressiveThoroughFromRound: 2,
      maxUrlsPerProduct: 140,
      maxCandidateUrls: 180,
      llmMaxCallsPerRound: 5,

      discoveryEnabled: true,
      fetchCandidateSources: true,
      searchEngines: 'bing,startpage,duckduckgo',
      searxngBaseUrl: 'http://127.0.0.1:8080'
    },
    {
      round: 1,
      missingRequiredCount: 3
    }
  );

  assert.equal(roundConfig.runProfile, 'standard');
  assert.equal(roundConfig.maxUrlsPerProduct >= 90, true);
  assert.equal(roundConfig.maxCandidateUrls >= 120, true);
});

test('buildRoundConfig allows aggressive thorough profile from configured round', () => {
  const roundConfig = buildRoundConfig(
    {
      runProfile: 'standard',
      aggressiveThoroughFromRound: 1,
      maxUrlsPerProduct: 90,
      maxCandidateUrls: 120,
      llmMaxCallsPerRound: 5,

      discoveryEnabled: true,
      fetchCandidateSources: true,
      searchEngines: 'bing,startpage,duckduckgo',
      searxngBaseUrl: 'http://127.0.0.1:8080'
    },
    {
      round: 1,
      missingRequiredCount: 3
    }
  );

  assert.equal(roundConfig.runProfile, 'standard');
});

test('buildRoundConfig applies production-mode budgets with boosted limits', () => {
  const config = buildRoundConfig(
    {
      runProfile: 'standard',
      maxUrlsPerProduct: 90,
      maxCandidateUrls: 120,
      discoveryEnabled: true,
      fetchCandidateSources: true,
      searchEngines: 'bing,startpage,duckduckgo',
      searxngBaseUrl: 'http://127.0.0.1:8080',
      llmMaxCallsPerRound: 5
    },
    {
      round: 1,
      missingRequiredCount: 3
    }
  );

  assert.equal((config.maxUrlsPerProduct || 0) >= 90, true);
  assert.equal((config.maxCandidateUrls || 0) >= 120, true);
  assert.equal((config.discoveryMaxQueries || 0) >= 8, true);
});

test('buildContractEffortPlan derives weighted effort from field rule contracts', () => {
  const plan = buildContractEffortPlan({
    missingRequiredFields: ['weight', 'dpi', 'connection'],
    missingCriticalFields: ['weight'],
    categoryConfig: {
      fieldRules: {
        fields: {
          weight: { required_level: 'critical', availability: 'expected', difficulty: 'easy', effort: 2 },
          dpi: { required_level: 'required', availability: 'expected', difficulty: 'medium', effort: 5 },
          connection: { required_level: 'required', availability: 'sometimes', difficulty: 'hard', effort: 8 }
        }
      }
    }
  });

  assert.equal(plan.total_effort, 15);
  assert.equal(plan.critical_missing_count, 1);
  assert.equal(plan.hard_missing_count, 1);
  assert.equal(plan.expected_required_count, 2);
});

test('buildRoundConfig raises deep-search budgets for high contract effort plans', () => {
  const low = buildRoundConfig(
    {
      runProfile: 'standard',
      discoveryEnabled: true,
      fetchCandidateSources: true,
      searchEngines: 'bing,startpage,duckduckgo',
      searxngBaseUrl: 'http://127.0.0.1:8080',
      maxUrlsPerProduct: 80,
      maxCandidateUrls: 120,
      maxPagesPerDomain: 3,
      llmMaxCallsPerRound: 4,

      endpointSignalLimit: 30,
      endpointSuggestionLimit: 12,
      endpointNetworkScanLimit: 600,
      hypothesisAutoFollowupRounds: 0,
      hypothesisFollowupUrlsPerRound: 12,
      postLoadWaitMs: 0,
      autoScrollEnabled: false,
      autoScrollPasses: 0,

    },
    {
      round: 2,
      missingRequiredCount: 2,
      contractEffort: {
        total_effort: 4,
        hard_missing_count: 0,
        critical_missing_count: 0,
        expected_required_count: 2
      }
    }
  );

  const high = buildRoundConfig(
    {
      runProfile: 'standard',
      discoveryEnabled: true,
      fetchCandidateSources: true,
      searchEngines: 'bing,startpage,duckduckgo',
      searxngBaseUrl: 'http://127.0.0.1:8080',
      maxUrlsPerProduct: 80,
      maxCandidateUrls: 120,
      maxPagesPerDomain: 3,
      llmMaxCallsPerRound: 4,

      endpointSignalLimit: 30,
      endpointSuggestionLimit: 12,
      endpointNetworkScanLimit: 600,
      hypothesisAutoFollowupRounds: 0,
      hypothesisFollowupUrlsPerRound: 12,
      postLoadWaitMs: 0,
      autoScrollEnabled: false,
      autoScrollPasses: 0,

    },
    {
      round: 2,
      missingRequiredCount: 2,
      contractEffort: {
        total_effort: 26,
        hard_missing_count: 2,
        critical_missing_count: 2,
        expected_required_count: 2
      }
    }
  );

  assert.equal(high.maxUrlsPerProduct >= low.maxUrlsPerProduct, true);
  assert.equal(high.maxCandidateUrls >= low.maxCandidateUrls, true);
  assert.equal(high.discoveryMaxQueries >= low.discoveryMaxQueries, true);
});

// --- Characterization tests for newly-exported private functions ---

// normalizeFieldContractToken
test('normalizeFieldContractToken: standard field name', () => {
  assert.equal(normalizeFieldContractToken('weight'), 'weight');
});

test('normalizeFieldContractToken: strips fields. prefix and lowercases', () => {
  assert.equal(normalizeFieldContractToken('fields.Polling_Rate'), 'polling_rate');
});

test('normalizeFieldContractToken: mixed case with special chars', () => {
  assert.equal(normalizeFieldContractToken('DPI-Resolution'), 'dpi_resolution');
});

test('normalizeFieldContractToken: empty/null returns empty string', () => {
  assert.equal(normalizeFieldContractToken(''), '');
  assert.equal(normalizeFieldContractToken(null), '');
  assert.equal(normalizeFieldContractToken(undefined), '');
});

// calcProgressDelta
test('calcProgressDelta: null previous returns improved with first_round reason', () => {
  const delta = calcProgressDelta(null, { validated: false, missingRequiredCount: 3, criticalCount: 1, contradictionCount: 0, confidence: 0.5 });
  assert.equal(delta.improved, true);
  assert.deepEqual(delta.reasons, ['first_round']);
});

test('calcProgressDelta: validated transition detected', () => {
  const delta = calcProgressDelta(
    { validated: false, missingRequiredCount: 1, criticalCount: 0, contradictionCount: 0, confidence: 0.8 },
    { validated: true, missingRequiredCount: 0, criticalCount: 0, contradictionCount: 0, confidence: 0.9 }
  );
  assert.equal(delta.improved, true);
  assert.ok(delta.reasons.includes('validated'));
  assert.ok(delta.reasons.includes('missing_required_reduced'));
});

test('calcProgressDelta: missing required reduced', () => {
  const delta = calcProgressDelta(
    { validated: false, missingRequiredCount: 3, criticalCount: 0, contradictionCount: 0, confidence: 0.5 },
    { validated: false, missingRequiredCount: 1, criticalCount: 0, contradictionCount: 0, confidence: 0.5 }
  );
  assert.equal(delta.improved, true);
  assert.deepEqual(delta.reasons, ['missing_required_reduced']);
});

test('calcProgressDelta: confidence up detected', () => {
  const delta = calcProgressDelta(
    { validated: false, missingRequiredCount: 2, criticalCount: 0, contradictionCount: 0, confidence: 0.4 },
    { validated: false, missingRequiredCount: 2, criticalCount: 0, contradictionCount: 0, confidence: 0.6 }
  );
  assert.equal(delta.improved, true);
  assert.deepEqual(delta.reasons, ['confidence_up']);
});

test('calcProgressDelta: no improvement when nothing changes', () => {
  const delta = calcProgressDelta(
    { validated: false, missingRequiredCount: 2, criticalCount: 1, contradictionCount: 0, confidence: 0.5 },
    { validated: false, missingRequiredCount: 2, criticalCount: 1, contradictionCount: 0, confidence: 0.5 }
  );
  assert.equal(delta.improved, false);
  assert.deepEqual(delta.reasons, []);
});

// isIdentityOrEditorialField
test('isIdentityOrEditorialField: identity fields return true', () => {
  assert.equal(isIdentityOrEditorialField('brand'), true);
  assert.equal(isIdentityOrEditorialField('model'), true);
  assert.equal(isIdentityOrEditorialField('sku'), true);
  assert.equal(isIdentityOrEditorialField('id'), true);
});

test('isIdentityOrEditorialField: non-identity fields return false', () => {
  assert.equal(isIdentityOrEditorialField('weight'), false);
  assert.equal(isIdentityOrEditorialField('dpi'), false);
  assert.equal(isIdentityOrEditorialField('polling_rate'), false);
});

test('isIdentityOrEditorialField: empty/null returns true', () => {
  assert.equal(isIdentityOrEditorialField(''), true);
  assert.equal(isIdentityOrEditorialField(null), true);
});

test('isIdentityOrEditorialField: editorial fields from config return true', () => {
  const categoryConfig = {
    schema: { editorial_fields: ['review_summary', 'editor_notes'] },
    fieldOrder: ['review_summary', 'editor_notes', 'weight']
  };
  assert.equal(isIdentityOrEditorialField('review_summary', categoryConfig), true);
  assert.equal(isIdentityOrEditorialField('weight', categoryConfig), false);
});

// makeLlmTargetFields
test('makeLlmTargetFields: no previousSummary returns required + critical + all non-identity fields', () => {
  const fields = makeLlmTargetFields({
    previousSummary: null,
    categoryConfig: {
      requiredFields: ['connection', 'dpi'],
      schema: { critical_fields: ['weight'] },
      fieldOrder: ['brand', 'model', 'connection', 'dpi', 'weight', 'polling_rate']
    }
  });
  assert.ok(fields.includes('connection'));
  assert.ok(fields.includes('dpi'));
  assert.ok(fields.includes('weight'));
  // Identity fields excluded from aggressive expansion
  assert.ok(!fields.includes('brand'));
  assert.ok(!fields.includes('model'));
});

test('makeLlmTargetFields: with previousSummary missing fields focuses on those', () => {
  const fields = makeLlmTargetFields({
    previousSummary: {
      missing_required_fields: ['weight'],
      critical_fields_below_pass_target: ['dpi'],
      fields_below_pass_target: [],
      constraint_analysis: {}
    },
    categoryConfig: {
      requiredFields: ['connection', 'dpi', 'weight'],
      schema: {},
      fieldOrder: ['connection', 'dpi', 'weight', 'polling_rate']
    }
  });
  assert.ok(fields.includes('weight'));
  assert.ok(fields.includes('dpi'));
});

test('makeLlmTargetFields: zero combined missing still returns fallback fields', () => {
  const fields = makeLlmTargetFields({
    previousSummary: {
      missing_required_fields: [],
      critical_fields_below_pass_target: [],
      fields_below_pass_target: [],
      constraint_analysis: {}
    },
    categoryConfig: {
      requiredFields: ['connection'],
      schema: { critical_fields: ['weight'] },
      fieldOrder: ['connection', 'weight', 'dpi']
    }
  });
  assert.ok(fields.length > 0);
  assert.ok(fields.includes('connection'));
});

test('makeLlmTargetFields: identity fields excluded from result', () => {
  const fields = makeLlmTargetFields({
    previousSummary: null,
    categoryConfig: {
      requiredFields: ['brand', 'weight'],
      schema: {},
      fieldOrder: ['brand', 'model', 'weight']
    }
  });
  // brand is in requiredFields so included, but model is identity-only and excluded from aggressive expansion
  assert.ok(fields.includes('weight'));
  assert.ok(!fields.includes('model'));
});

test('makeLlmTargetFields: cap enforcement limits output length', () => {
  const manyFields = Array.from({ length: 200 }, (_, i) => `field_${i}`);
  const fields = makeLlmTargetFields({
    previousSummary: null,
    categoryConfig: {
      requiredFields: ['field_0'],
      schema: {},
      fieldOrder: manyFields
    },
    config: {}
  });
  assert.ok(fields.length <= 110);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunSummaryPayload } from '../src/features/indexing/orchestration/index.js';

test('buildRunSummaryPayload assembles canonical run summary with stable helper/identity/reasoning sections', () => {
  const provenance = { shape: { confidence: 0.9 } };
  const sourceResults = [
    {
      role: 'manufacturer',
      identity: { match: true },
      url: 'https://example.com/spec',
      finalUrl: 'https://example.com/spec#final',
    },
    {
      role: 'manufacturer',
      identity: { match: false },
      url: 'helper://supportive/row',
    },
    {
      role: 'review',
      identity: { match: false },
      url: 'https://review.example.com/item',
    },
  ];

  const summary = buildRunSummaryPayload({
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    config: {
      runProfile: 'thorough',
      fetchCandidateSources: true,
      llmApiKey: 'present',
      llmProvider: 'openai',
      llmModelExtract: 'gpt-4.1-mini',
      llmModelPlan: 'gpt-4.1-mini',
      llmModelValidate: 'gpt-4.1-mini',
      llmVerifyMode: true,
      categoryAuthorityEnabled: true,
      indexingCategoryAuthorityEnabled: true,
      categoryAuthorityRoot: 'category_authority',
      fieldRulesEngineEnforceEvidence: true,
      maxRunSeconds: 300,
      maxUrlsPerProduct: 50,
      maxPagesPerDomain: 8,
      endpointSignalLimit: 100,
      endpointSuggestionLimit: 20,
      endpointNetworkScanLimit: 10,
      hypothesisAutoFollowupRounds: 2,
      hypothesisFollowupUrlsPerRound: 12,
    },
    runtimeMode: 'uber_aggressive',
    identityFingerprint: 'brand:model',
    identityLockStatus: 'locked',
    dedupeMode: 'strict',
    gate: {
      validated: true,
      reasons: ['validated'],
      confidencePercent: 91,
      completenessRequiredPercent: 88,
      coverageOverallPercent: 84,
    },
    validatedReason: 'validated',
    confidence: 0.91,
    completenessStats: {
      completenessRequired: 0.88,
      requiredFields: ['shape', 'weight_g'],
      missingRequiredFields: ['weight_g'],
    },
    coverageStats: {
      coverageOverall: 0.84,
    },
    targets: {
      targetCompleteness: 0.9,
      targetConfidence: 0.8,
    },
    anchors: {
      shape: 'symmetrical',
    },
    allAnchorConflicts: [{ field: 'weight_g', severity: 'MINOR' }],
    anchorMajorConflictsCount: 1,
    identityConfidence: 0.93,
    identityGate: {
      validated: true,
      reasonCodes: ['identity_ok'],
      needsReview: false,
      contradictions: [{ source: 'aggregate', conflict: 'size_class_conflict' }],
      acceptedConflictContributors: [
        {
          url: 'https://example.com/spec',
          rootDomain: 'example.com',
          contributingConflicts: ['size_class_conflict'],
        },
      ],
      rejectedSiblingSources: [
        {
          url: 'https://review.example.com/viper-v3-hyperspeed',
          candidateModel: 'Viper V3 HyperSpeed',
          reasonCodes: ['model_mismatch'],
        },
      ],
      firstConflictTrigger: {
        source: 'aggregate',
        conflict: 'size_class_conflict',
        contributors: [{ url: 'https://example.com/spec' }],
      },
    },
    extractionGateOpen: true,
    identityLock: {
      family_model_count: 2,
      ambiguity_level: 'medium',
    },
    publishable: true,
    publishBlockers: [],
    identityReport: {
      status: 'ok',
      needs_review: false,
      reason_codes: ['identity_ok'],
      pages: [{}, {}],
      contradiction_count: 1,
      contradictions: [{ source: 'aggregate', conflict: 'size_class_conflict' }],
      accepted_exact_match_sources: [{ url: 'https://example.com/spec' }],
      accepted_conflict_contributors: [{ url: 'https://example.com/spec' }],
      rejected_sibling_sources: [
        {
          url: 'https://review.example.com/viper-v3-hyperspeed',
          candidate_model: 'Viper V3 HyperSpeed',
        },
      ],
      first_conflict_trigger: {
        source: 'aggregate',
        conflict: 'size_class_conflict',
        contributors: [{ url: 'https://example.com/spec' }],
      },
    },
    fieldsBelowPassTarget: ['weight_g'],
    criticalFieldsBelowPassTarget: ['weight_g'],
    newValuesProposed: [{ field: 'weight_g', value: 60 }],
    provenance,
    sourceResults,
    discoveryResult: {
      enabled: true,
      discoveryKey: 'disc/key',
      candidatesKey: 'cand/key',
      candidates: [{ url: 'https://x' }, { url: 'https://y' }],
      search_attempts: [{ provider: 'searxng' }],
      search_profile_key: 'profile/key',
      search_profile_run_key: 'profile/run/key',
      search_profile_latest_key: 'profile/latest/key',
    },
    indexingHelperFlowEnabled: true,
    helperContext: {
      active_match: {
        source: 'active_filtering',
        record_id: 17,
      },
      seed_urls: ['https://seed-1', 'https://seed-2'],
      stats: {
        active_total: 1,
        supportive_total: 3,
        supportive_file_count: 2,
        supportive_matched_count: 1,
      },
    },
    helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
    helperFilledFields: ['weight_g'],
    helperFilledByMethod: { supportive: 1 },
    helperMismatches: [{ field: 'dpi' }, { field: 'polling_hz' }],
    componentPriorFilledFields: ['shape'],
    componentPriorMatches: ['base-shell'],
    criticDecisions: {
      accept: [{ field: 'shape' }],
      reject: [{ field: 'weight_g' }],
      unknown: [],
    },
    llmValidatorDecisions: {
      enabled: true,
      accept: [{ field: 'shape' }],
      reject: [],
      unknown: [{ field: 'weight_g' }],
    },
    runtimeFieldRulesEngine: { version: 'v1' },
    runtimeGateResult: {
      failures: [{ field: 'weight_g' }],
      warnings: [{ field: 'dpi' }],
      changes: [{ field: 'shape' }],
      curation_suggestions: [{ field: 'weight_g' }],
    },
    curationSuggestionResult: {
      appended_count: 1,
      total_count: 2,
      path: 'artifacts/curation.json',
    },
    llmTargetFields: ['shape', 'weight_g'],
    goldenExamples: [{ id: 1 }],
    llmCandidatesAccepted: 3,
    llmSourcesUsed: 2,
    contribution: {
      llmFields: ['shape'],
      componentFields: ['shell'],
    },
    llmRetryWithoutSchemaCount: 1,
    llmEstimatedUsageCount: 4,
    llmContext: {
      verification: {
        trigger: 'manual',
        done: true,
        report_key: 'verify/key',
      },
    },
    llmCallCount: 6,
    llmCostUsd: 0.123456789,
    llmBudgetSnapshot: {
      limits: {
        monthlyBudgetUsd: 100,
        productBudgetUsd: 10,
        maxCallsPerProductTotal: 200,
        maxCallsPerRound: 30,
      },
      state: {
        monthlySpentUsd: 2.5,
        productSpentUsd: 0.75,
        productCallsTotal: 10,
        roundCalls: 3,
      },
    },
    llmBudgetBlockedReason: 'none',
    cortexSidecar: {
      status: 'disabled',
    },
    aggressiveExtraction: {
      enabled: false,
      stage: 'disabled',
    },
    categoryConfig: {
      sources_override_key: 'source/override/key',
    },
    fetcherMode: 'playwright',
    fetcherStartFallbackReason: null,
    indexingResumeKey: 'resume/key',
    resumeMode: 'resume',
    resumeMaxAgeHours: 24,
    previousResumeStateAgeHours: 1.236,
    resumeReextractEnabled: true,
    resumeReextractAfterHours: 48,
    resumeSeededPendingCount: 5,
    resumeSeededLlmRetryCount: 2,
    resumeSeededReextractCount: 1,
    resumePersistedPendingCount: 4,
    resumePersistedLlmRetryCount: 2,
    resumePersistedSuccessCount: 3,
    manufacturerSources: sourceResults.filter((source) => source.role === 'manufacturer'),
    manufacturerMajorConflicts: 1,
    plannerStats: {
      pending: 3,
    },
    endpointMining: {
      endpoint_count: 5,
    },
    temporalEvidence: {
      hits: 12,
    },
    inferenceResult: {
      filled_fields: ['shape'],
    },
    hypothesisQueue: [{ field: 'shape', why: 'required' }],
    hypothesisFollowupRoundsExecuted: 2,
    hypothesisFollowupSeededUrls: ['https://seed-1'],
    constraintAnalysis: {
      conflicts: [],
    },
    fieldReasoning: {
      shape: { reason: 'anchored' },
    },
    trafficLight: {
      green: ['shape'],
      yellow: ['weight_g'],
      red: [],
    },
    needSet: {
      needset_size: 2,
      total_fields: 5,
      reason_counts: { required: 1 },
      required_level_counts: { critical: 1 },
      identity_lock_state: 'locked',
      identity_audit_rows: [{ id: 1 }],
      needs: [{ field_key: 'shape' }, { field_key: 'weight_g' }],
      generated_at: '2026-03-06T00:00:00.000Z',
    },
    phase07PrimeSources: {
      summary: {
        fields_attempted: 2,
        fields_with_hits: 2,
        fields_satisfied_min_refs: 1,
        fields_unsatisfied_min_refs: 1,
        refs_selected_total: 5,
        distinct_sources_selected: 3,
        avg_hits_per_field: 2.5,
      },
      generated_at: '2026-03-06T00:00:01.000Z',
    },
    phase08Extraction: {
      summary: {
        batch_count: 2,
        batch_error_count: 0,
        schema_fail_rate: 0,
        raw_candidate_count: 20,
        accepted_candidate_count: 10,
        dangling_snippet_ref_count: 1,
        dangling_snippet_ref_rate: 0.1,
        evidence_policy_violation_count: 0,
        evidence_policy_violation_rate: 0,
        min_refs_satisfied_count: 8,
        min_refs_total: 10,
        min_refs_satisfied_rate: 0.8,
      },
      validator: {
        context_field_count: 4,
        prime_source_rows: 3,
      },
      generated_at: '2026-03-06T00:00:02.000Z',
    },
    parserHealthRows: [{ score: 1 }],
    parserHealthAverage: 0.44,
    fingerprintCount: 7,
    durationMs: 1234,
    roundContext: {},
    normalizeAmbiguityLevelFn: (value) => {
      assert.equal(value, 'medium');
      return 'medium-normalized';
    },
    isHelperSyntheticSourceFn: (source) => String(source?.url || '').startsWith('helper://'),
    buildTopEvidenceReferencesFn: (provenanceArg, limit) => {
      assert.equal(provenanceArg, provenance);
      assert.equal(limit, 100);
      return [{ field: 'shape', refs: 2 }];
    },
    nowIsoFn: () => '2026-03-06T00:00:03.000Z',
  });

  assert.equal(summary.productId, 'mouse-1');
  assert.equal(summary.identity_ambiguity.ambiguity_level, 'medium-normalized');
  assert.equal(summary.manufacturer_research.attempted_sources, 2);
  assert.equal(summary.manufacturer_research.identity_matched_sources, 1);
  assert.equal(summary.identity_report.contradiction_count, 1);
  assert.equal(summary.identity_report.contradictions?.[0]?.conflict, 'size_class_conflict');
  assert.equal(summary.identity_report.accepted_exact_match_sources?.length, 1);
  assert.equal(summary.identity_report.accepted_conflict_contributors?.length, 1);
  assert.equal(summary.identity_report.rejected_sibling_sources?.[0]?.candidate_model, 'Viper V3 HyperSpeed');
  assert.equal(summary.identity_report.first_conflict_trigger?.conflict, 'size_class_conflict');
  assert.equal(summary.urls_fetched.includes('https://example.com/spec#final'), true);
  assert.equal(summary.urls_fetched.includes('https://review.example.com/item'), true);
  assert.equal(
    summary.urls_fetched.some((url) => String(url).startsWith('helper://')),
    false,
  );
  assert.equal(summary.llm.cost_usd_run, 0.12345679);
  assert.deepEqual(summary.top_evidence_references, [{ field: 'shape', refs: 2 }]);
  assert.equal(summary.generated_at, '2026-03-06T00:00:03.000Z');
});

test('buildRunSummaryPayload falls back to legacy helper root and excludes helper urls from fetched output', () => {
  const summary = buildRunSummaryPayload({
    productId: 'mouse-2',
    runId: 'run-2',
    category: 'mouse',
    config: {
      fetchCandidateSources: false,
      helperFilesEnabled: true,
      indexingHelperFilesEnabled: true,
      helperSupportiveFillMissing: true,
    },
    runtimeMode: 'production',
    gate: {
      validated: false,
      reasons: ['missing_fields'],
      confidencePercent: 30,
      completenessRequiredPercent: 20,
      coverageOverallPercent: 10,
    },
    validatedReason: 'missing_fields',
    completenessStats: {
      completenessRequired: 0.2,
      requiredFields: [],
      missingRequiredFields: [],
    },
    coverageStats: {
      coverageOverall: 0.1,
    },
    legacyRootFallback: 'legacy-helper-root',
    indexingHelperFlowEnabled: true,
    helperContext: {
      active_match: null,
      seed_urls: ['https://seed.example.com'],
      stats: {
        active_total: 0,
        supportive_total: 2,
        supportive_file_count: 1,
        supportive_matched_count: 1,
      },
    },
    helperSupportiveSyntheticSources: [
      { url: 'helper://supportive/one' },
      { url: 'helper://supportive/two' },
    ],
    helperFilledFields: ['weight_g'],
    helperFilledByMethod: { supportive: 1 },
    helperMismatches: [],
    sourceResults: [
      { url: 'helper://supportive/one', finalUrl: 'helper://supportive/one', identity: { match: false } },
      { url: 'https://example.com/spec', finalUrl: 'https://example.com/spec?utm_source=test', identity: { match: true } },
      { url: 'https://example.com/spec', finalUrl: 'https://example.com/spec?utm_source=test', identity: { match: true } },
      { url: 'https://review.example.com/item', identity: { match: false } },
    ],
    identityGate: { validated: false },
    identityLock: {},
    identityReport: {},
    fieldsBelowPassTarget: [],
    criticalFieldsBelowPassTarget: [],
    newValuesProposed: [],
    provenance: {},
    discoveryResult: {},
    criticDecisions: {},
    llmValidatorDecisions: {},
    runtimeGateResult: {},
    curationSuggestionResult: {},
    contribution: {},
    llmContext: {},
    llmBudgetSnapshot: {},
    cortexSidecar: {},
    aggressiveExtraction: {},
    categoryConfig: {},
    manufacturerSources: [],
    plannerStats: {},
    endpointMining: {},
    temporalEvidence: {},
    inferenceResult: {},
    hypothesisQueue: [],
    constraintAnalysis: {},
    fieldReasoning: {},
    trafficLight: {},
    needSet: {},
    phase07PrimeSources: {},
    phase08Extraction: {},
    normalizeAmbiguityLevelFn: () => '',
    isHelperSyntheticSourceFn: (source) => String(source?.url || '').startsWith('helper://'),
    buildTopEvidenceReferencesFn: () => [],
    nowIsoFn: () => '2026-03-06T00:00:04.000Z',
  });

  assert.equal(summary.category_authority.root, 'legacy-helper-root');
  assert.equal(summary.category_authority.supportive_synthetic_sources_used, 2);
  assert.equal(summary.category_authority.supportive_fill_missing_enabled, true);
  assert.deepEqual(summary.urls_fetched, [
    'https://example.com/spec?utm_source=test',
    'https://review.example.com/item',
  ]);
});

test('buildRunSummaryPayload preserves disabled llm defaults and rounds numeric summary fields', () => {
  const summary = buildRunSummaryPayload({
    productId: 'mouse-3',
    runId: 'run-3',
    category: 'mouse',
    config: {
      llmProvider: 'openai',
      fieldRulesEngineEnforceEvidence: false,
    },
    gate: {
      validated: true,
      reasons: [],
      confidencePercent: 55.55,
      completenessRequiredPercent: 44.44,
      coverageOverallPercent: 33.33,
    },
    validatedReason: 'validated',
    completenessStats: {
      completenessRequired: 0.4444,
      requiredFields: [],
      missingRequiredFields: [],
    },
    coverageStats: {
      coverageOverall: 0.3333,
    },
    previousResumeStateAgeHours: 1.236,
    parserHealthAverage: 0.123456789,
    llmCostUsd: 0.987654321,
    llmBudgetSnapshot: {
      limits: {},
      state: {},
    },
    sourceResults: [],
    identityGate: {},
    identityLock: {},
    identityReport: {},
    fieldsBelowPassTarget: [],
    criticalFieldsBelowPassTarget: [],
    newValuesProposed: [],
    provenance: {},
    discoveryResult: {},
    helperContext: {},
    criticDecisions: {},
    llmValidatorDecisions: {},
    runtimeGateResult: {},
    curationSuggestionResult: {},
    contribution: {},
    llmContext: {},
    cortexSidecar: {},
    aggressiveExtraction: {},
    categoryConfig: {},
    manufacturerSources: [],
    plannerStats: {},
    endpointMining: {},
    temporalEvidence: {},
    inferenceResult: {},
    hypothesisQueue: [],
    constraintAnalysis: {},
    fieldReasoning: {},
    trafficLight: {},
    needSet: {},
    phase07PrimeSources: {},
    phase08Extraction: {},
    normalizeAmbiguityLevelFn: () => '',
    isHelperSyntheticSourceFn: () => false,
    buildTopEvidenceReferencesFn: () => [],
    nowIsoFn: () => '2026-03-06T00:00:05.000Z',
  });

  assert.equal(summary.llm.enabled, false);
  assert.equal(summary.llm.model_extract, null);
  assert.equal(summary.llm.model_plan, null);
  assert.equal(summary.llm.model_validate, null);
  assert.equal(summary.llm.cost_usd_run, 0.98765432);
  assert.equal(summary.indexing_resume.state_age_hours, 1.24);
  assert.equal(summary.parser_health.average_health_score, 0.123457);
  assert.equal(summary.round_context, null);
  assert.equal(summary.generated_at, '2026-03-06T00:00:05.000Z');
});

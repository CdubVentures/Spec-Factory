import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunSummaryPayloadContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunSummaryPayloadContext maps runProduct summary inputs to payload contract keys', () => {
  const normalizeAmbiguityLevel = () => 'normalized';
  const isHelperSyntheticSource = () => false;
  const buildTopEvidenceReferences = () => [];
  const nowIso = () => '2026-03-06T00:00:00.000Z';

  const context = buildRunSummaryPayloadContext({
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    config: { runProfile: 'thorough' },
    runtimeMode: 'balanced',
    identityFingerprint: 'brand:model',
    identityLockStatus: 'locked',
    dedupeMode: 'deterministic_v2',
    gate: { validated: true },
    validatedReason: 'validated',
    confidence: 0.9,
    completenessStats: { completenessRequired: 0.8 },
    coverageStats: { coverageOverall: 0.7 },
    targets: { targetConfidence: 0.8 },
    anchors: { shape: 'ergonomic' },
    allAnchorConflicts: [],
    anchorMajorConflictsCount: 0,
    identityConfidence: 0.92,
    identityGate: { validated: true },
    extractionGateOpen: true,
    identityLock: { ambiguity_level: 'low' },
    publishable: true,
    publishBlockers: [],
    identityReport: { status: 'ok' },
    fieldsBelowPassTarget: ['weight_g'],
    criticalFieldsBelowPassTarget: ['weight_g'],
    newValuesProposed: [],
    provenance: { shape: { confidence: 0.9 } },
    sourceResults: [{ identity: { match: true }, url: 'https://example.com' }],
    discoveryResult: { enabled: true, candidates: [] },
    indexingHelperFlowEnabled: true,
    helperContext: { stats: { active_total: 1 } },
    helperSupportiveSyntheticSources: [],
    helperFilledFields: ['shape'],
    helperFilledByMethod: { supportive: 1 },
    helperMismatches: [],
    componentPriorFilledFields: ['shape'],
    componentPriorMatches: ['base-shell'],
    criticDecisions: { accept: [] },
    llmValidatorDecisions: { enabled: false },
    runtimeFieldRulesEngine: { version: 'v1' },
    runtimeGateResult: { failures: [] },
    curationSuggestionResult: { appended_count: 0 },
    llmTargetFields: ['shape'],
    goldenExamples: [],
    llmCandidatesAccepted: 1,
    llmSourcesUsed: 1,
    contribution: { llmFields: ['shape'] },
    llmRetryWithoutSchemaCount: 0,
    llmEstimatedUsageCount: 1,
    llmContext: { verification: { done: false } },
    llmCallCount: 1,
    llmCostUsd: 0.01,
    llmBudgetSnapshot: { limits: {}, state: {} },
    llmBudgetBlockedReason: null,
    aggressiveExtraction: { enabled: false },
    categoryConfig: { sources_override_key: null },
    fetcherMode: 'playwright',
    fetcherStartFallbackReason: null,
    indexingResumeKey: 'resume/key',
    resumeMode: 'auto',
    resumeMaxAgeHours: 24,
    previousResumeStateAgeHours: 1.5,
    resumeReextractEnabled: false,
    resumeReextractAfterHours: 48,
    resumeSeededPendingCount: 0,
    resumeSeededLlmRetryCount: 0,
    resumeSeededReextractCount: 0,
    resumePersistedPendingCount: 0,
    resumePersistedLlmRetryCount: 0,
    resumePersistedSuccessCount: 0,
    manufacturerSources: [],
    manufacturerMajorConflicts: 0,
    plannerStats: { pending: 3 },
    endpointMining: { endpoint_count: 1 },
    temporalEvidence: { hits: 0 },
    inferenceResult: { filled_fields: [] },
    hypothesisQueue: [],
    hypothesisFollowupRoundsExecuted: 0,
    hypothesisFollowupSeededUrls: [],
    constraintAnalysis: { conflicts: [] },
    fieldReasoning: { shape: { reason: 'anchor' } },
    trafficLight: { green: ['shape'] },
    needSet: { needset_size: 1 },
    phase07PrimeSources: { summary: { fields_attempted: 1 } },
    phase08Extraction: { summary: { batch_count: 1 } },
    parserHealthRows: [{ score: 1 }],
    parserHealthAverage: 1,
    fingerprintCount: 1,
    durationMs: 1000,
    roundContext: {},
    normalizeAmbiguityLevel,
    isHelperSyntheticSource,
    buildTopEvidenceReferences,
    nowIso,
  });

  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.dedupeMode, 'deterministic_v2');
  assert.equal(context.hypothesisFollowupRoundsExecuted, 0);
  assert.deepEqual(context.plannerStats, { pending: 3 });
  assert.equal(context.normalizeAmbiguityLevelFn, normalizeAmbiguityLevel);
  assert.equal(context.isHelperSyntheticSourceFn, isHelperSyntheticSource);
  assert.equal(context.buildTopEvidenceReferencesFn, buildTopEvidenceReferences);
  assert.equal(context.nowIsoFn, nowIso);
});

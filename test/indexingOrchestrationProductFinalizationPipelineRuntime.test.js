import test from 'node:test';
import assert from 'node:assert/strict';

import { createProductFinalizationPipelineRuntime } from '../src/features/indexing/orchestration/index.js';
import { runProductFinalizationPipeline } from '../src/features/indexing/orchestration/finalize/runProductFinalizationPipeline.js';

function createPipelineContext() {
  return {
    llmRuntime: {
      getUsageState: () => ({
        llmCallCount: 6,
        llmCostUsd: 0.12,
        llmEstimatedUsageCount: 4,
        llmRetryWithoutSchemaCount: 1,
      }),
    },
    productId: 'product-1',
    runId: 'run-1',
    category: 'mouse',
    config: { runProfile: 'thorough' },
    runtimeMode: 'aggressive',
    identityFingerprint: 'brand:model',
    identityLockStatus: 'locked',
    dedupeMode: 'strict',
    targets: { targetCompleteness: 0.9 },
    anchors: { shape: 'symmetrical' },
    discoveryResult: { enabled: true },
    indexingHelperFlowEnabled: true,
    helperContext: { active: true },
    helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
    helperFilledFields: ['weight_g'],
    helperFilledByMethod: { supportive: 1 },
    helperMismatches: [{ field: 'dpi' }],
    llmTargetFields: ['shape'],
    goldenExamples: [{ id: 1 }],
    llmCandidatesAccepted: 3,
    llmSourcesUsed: 2,
    llmContext: { verification: { done: true } },
    categoryConfig: { category: 'mouse' },
    fetcherMode: 'playwright',
    fetcherStartFallbackReason: null,
    indexingResumeKey: 'resume/key',
    resumeMode: 'resume',
    resumeMaxAgeHours: 24,
    previousResumeStateAgeHours: 2,
    resumeReextractEnabled: true,
    resumeReextractAfterHours: 48,
    resumeSeededPendingCount: 1,
    resumeSeededLlmRetryCount: 2,
    resumeSeededReextractCount: 3,
    resumePersistedPendingCount: 4,
    resumePersistedLlmRetryCount: 5,
    resumePersistedSuccessCount: 6,
    plannerStats: { pending: 2 },
    hypothesisFollowupRoundsExecuted: 1,
    hypothesisFollowupSeededUrls: ['https://seed.example.com'],
    roundContext: { round: 2 },
    storage: { id: 'storage' },
    runArtifactsBase: 'runs/base',
    sourceResults: [{ url: 'https://example.com/spec' }],
    logger: { id: 'logger' },
    fieldOrder: ['shape', 'weight_g'],
    sourceIntelBrand: 'Logitech',
    job: { id: 'job-1' },
    artifactsByHost: { 'example.com': {} },
    adapterArtifacts: { adapter: true },
    frontierDb: { id: 'frontier-db' },
    fieldReasoning: { shape: { reason: 'anchored' } },
  };
}

test('createProductFinalizationPipelineRuntime builds frozen derivation, summary, and completion contracts', () => {
  const runtime = createProductFinalizationPipelineRuntime({
    context: createPipelineContext(),
  });

  assert.ok(Object.isFrozen(runtime.contracts));
  assert.ok(Object.isFrozen(runtime.contracts.derivation));
  assert.ok(Object.isFrozen(runtime.contracts.summary));
  assert.ok(Object.isFrozen(runtime.contracts.completion));
  assert.equal(runtime.contracts.derivation.runId, 'run-1');
  assert.equal(runtime.contracts.summary.runId, 'run-1');
  assert.equal(runtime.contracts.completion.runId, 'run-1');
  assert.equal(runtime.contracts.completion.runArtifactsBase, 'runs/base');
});

test('createProductFinalizationPipelineRuntime derives, summarizes, and completes from shared context', async () => {
  const calls = [];
  const derivation = {
    identityGate: { validated: true },
    identityConfidence: 0.92,
    identityReport: { status: 'ok' },
    identity: { brand: 'Logitech' },
    allAnchorConflicts: [{ severity: 'MAJOR' }],
    anchorMajorConflictsCount: 1,
    normalized: { fields: { weight_g: '59' } },
    provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
    candidates: [{ field: 'weight_g' }],
    fieldsBelowPassTarget: ['weight_g'],
    criticalFieldsBelowPassTarget: [],
    newValuesProposed: [{ field: 'weight_g', value: '59' }],
    constrainedFinalizationConfig: {},
    componentPriorFilledFields: ['shape'],
    componentPriorMatches: ['shell'],
    criticDecisions: { accept: [{ field: 'shape' }] },
    llmValidatorDecisions: { enabled: true, accept: [{ field: 'shape' }] },
    temporalEvidence: { hits: 1 },
    inferenceResult: { filled_fields: ['shape'] },
    runtimeEvidencePack: { pack: true },
    aggressiveExtraction: { enabled: false },
    runtimeGateResult: { failures: [] },
    curationSuggestionResult: { appended_count: 1 },
    completenessStats: { completenessRequired: 0.9 },
    coverageStats: { coverageOverall: 0.84 },
    confidence: 0.91,
    gate: { validated: true, validatedReason: 'validated' },
    publishable: true,
    publishBlockers: [],
    durationMs: 1234,
    validatedReason: 'validated',
    manufacturerSources: [{ url: 'https://example.com/spec' }],
    manufacturerMajorConflicts: 0,
    endpointMining: { endpoint_count: 3 },
    constraintAnalysis: { conflicts: [] },
    hypothesisQueue: [{ field: 'shape' }],
    fieldReasoning: { shape: { reason: 'anchored' } },
    trafficLight: { green: ['shape'] },
    extractionGateOpen: true,
    needSet: { needs: [{ field_key: 'shape' }] },
    phase07PrimeSources: { summary: { refs_selected_total: 2 } },
    phase08Extraction: { summary: { accepted_candidate_count: 3 } },
    parserHealthRows: [{ score: 1 }],
    parserHealthAverage: 0.44,
    fingerprintCount: 7,
    contribution: { llmFields: ['shape'] },
  };
  const summaryBuildResult = {
    summary: { runId: 'run-1', validated: true },
    llmCallCount: 6,
    llmCostUsd: 0.12,
    llmEstimatedUsageCount: 4,
    llmRetryWithoutSchemaCount: 1,
  };
  const runResult = { ok: true };

  const runtime = createProductFinalizationPipelineRuntime({
    context: createPipelineContext(),
    runProductFinalizationDerivationFn: async (payload) => {
      calls.push(['runProductFinalizationDerivationFn', payload]);
      return derivation;
    },
    buildRunProductFinalizationSummaryFn: (payload) => {
      calls.push(['buildRunProductFinalizationSummaryFn', payload]);
      return summaryBuildResult;
    },
    runProductCompletionLifecycleFn: async (payload) => {
      calls.push(['runProductCompletionLifecycleFn', payload]);
      return runResult;
    },
  });

  const nextDerivation = await runtime.deriveFinalization();
  const nextSummaryBuildResult = runtime.buildSummary({ finalizationDerivation: nextDerivation });
  const result = await runtime.runCompletion({
    finalizationDerivation: nextDerivation,
    summaryBuildResult: nextSummaryBuildResult,
  });

  assert.equal(result, runResult);
  assert.equal(nextDerivation, derivation);
  assert.equal(nextSummaryBuildResult, summaryBuildResult);
  assert.equal(calls[0][1].runId, runtime.contracts.derivation.runId);
  assert.equal(calls[1][1].runId, runtime.contracts.summary.runId);
  assert.equal(calls[2][1].runArtifactsBase, runtime.contracts.completion.runArtifactsBase);
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'runProductFinalizationDerivationFn',
      'buildRunProductFinalizationSummaryFn',
      'runProductCompletionLifecycleFn',
    ],
  );
  assert.equal(calls[0][1].runId, 'run-1');
  assert.deepEqual(calls[0][1].llmValidatorDecisions, undefined);
  assert.equal(calls[1][1].llmRuntime.getUsageState().llmCallCount, 6);
  assert.deepEqual(calls[1][1].gate, { validated: true, validatedReason: 'validated' });
  assert.deepEqual(calls[1][1].plannerStats, { pending: 2 });
  assert.deepEqual(calls[2][1].summary, { runId: 'run-1', validated: true });
  assert.equal(calls[2][1].llmCallCount, 6);
  assert.deepEqual(calls[2][1].normalized, { fields: { weight_g: '59' } });
  assert.deepEqual(calls[2][1].needSet, { needs: [{ field_key: 'shape' }] });
});

test('runProductFinalizationPipeline can delegate through finalizationPipelineRuntime instead of raw collaborator wiring', async () => {
  const calls = [];
  const derivation = { gate: { validated: true } };
  const summaryBuildResult = { summary: { runId: 'run-1' }, llmCallCount: 1 };
  const runResult = { ok: true };

  const result = await runProductFinalizationPipeline({
    finalizationPipelineRuntime: {
      deriveFinalization: async () => {
        calls.push('deriveFinalization');
        return derivation;
      },
      buildSummary: ({ finalizationDerivation }) => {
        calls.push(['buildSummary', finalizationDerivation]);
        return summaryBuildResult;
      },
      runCompletion: async ({ finalizationDerivation, summaryBuildResult: nextSummaryBuildResult }) => {
        calls.push(['runCompletion', { finalizationDerivation, summaryBuildResult: nextSummaryBuildResult }]);
        return runResult;
      },
    },
  });

  assert.equal(result, runResult);
  assert.deepEqual(calls, [
    'deriveFinalization',
    ['buildSummary', derivation],
    ['runCompletion', { finalizationDerivation: derivation, summaryBuildResult }],
  ]);
});

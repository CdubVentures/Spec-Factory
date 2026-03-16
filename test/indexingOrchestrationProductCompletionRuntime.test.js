import test from 'node:test';
import assert from 'node:assert/strict';

import { createProductCompletionRuntime } from '../src/features/indexing/orchestration/index.js';
import { runProductCompletionLifecycle } from '../src/features/indexing/orchestration/finalize/runProductCompletionLifecycle.js';

test('createProductCompletionRuntime builds analysis keys and run-completed payload from static context', () => {
  const calls = [];
  const runtime = createProductCompletionRuntime({
    context: {
      storage: { id: 'storage' },
      category: 'mouse',
      productId: 'product-1',
      runBase: 'runs/base',
      summary: { runId: 'run-1' },
      config: { raw: true },
      runtimeMode: 'aggressive',
      identityFingerprint: 'brand:model',
      identityLockStatus: 'locked',
      dedupeMode: 'strict',
      confidence: 0.91,
      llmCandidatesAccepted: 3,
      llmCallCount: 4,
      llmCostUsd: 0.12,
      contribution: { llmFields: ['weight_g'] },
      llmEstimatedUsageCount: 5,
      llmRetryWithoutSchemaCount: 1,
      llmBudgetBlockedReason: '',
      indexingHelperFlowEnabled: true,
      helperContext: { active: true },
      helperFilledFields: ['weight_g'],
      componentPriorFilledFields: ['shape'],
      criticDecisions: { accept: [] },
      llmValidatorDecisions: { enabled: false },
      phase08Extraction: { summary: { batch_count: 1 } },
      trafficLight: { green: ['shape'] },
      resumeMode: 'resume',
      resumeMaxAgeHours: 24,
      resumeReextractEnabled: true,
      resumeReextractAfterHours: 48,
      resumeSeededPendingCount: 2,
      resumeSeededLlmRetryCount: 1,
      resumeSeededReextractCount: 1,
      resumePersistedPendingCount: 3,
      resumePersistedLlmRetryCount: 2,
      resumePersistedSuccessCount: 4,
      hypothesisFollowupRoundsExecuted: 2,
      hypothesisFollowupSeededUrls: ['https://seed.example.com'],
      aggressiveExtraction: { enabled: false },
      durationMs: 1234,
      logger: { id: 'logger' },
      runId: 'run-1',
      needSet: { needs: [] },
      phase07PrimeSources: { summary: { refs_selected_total: 2 } },
      categoryConfig: { category: 'mouse' },
      sourceResults: [{ url: 'https://example.com/spec' }],
      normalized: { fields: { weight_g: '59' } },
      provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
      startMs: 10,
    },
    buildAnalysisArtifactKeyPhaseContextFn: (payload) => {
      calls.push(['buildAnalysisArtifactKeyPhaseContextFn', payload]);
      return { analysisKeyPhaseContext: payload };
    },
    buildAnalysisArtifactKeyContextFn: (payload) => {
      calls.push(['buildAnalysisArtifactKeyContextFn', payload]);
      return {
        needSetRunKey: 'needset/run',
        needSetLatestKey: 'needset/latest',
        phase07RunKey: 'phase07/run',
        phase07LatestKey: 'phase07/latest',
        phase08RunKey: 'phase08/run',
        phase08LatestKey: 'phase08/latest',
        sourcePacketsRunKey: 'sources/run',
        sourcePacketsLatestKey: 'sources/latest',
        itemPacketRunKey: 'item/run',
        itemPacketLatestKey: 'item/latest',
        runMetaPacketRunKey: 'meta/run',
        runMetaPacketLatestKey: 'meta/latest',
      };
    },
    buildRunCompletedPayloadPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildRunCompletedPayloadPhaseCallsiteContextFn', payload]);
      return { runCompletedPayloadCallsite: payload };
    },
    buildRunCompletedPayloadContextFn: (payload) => {
      calls.push(['buildRunCompletedPayloadContextFn', payload]);
      return { runCompletedPayloadContext: payload };
    },
    buildRunCompletedPayloadFn: (payload) => {
      calls.push(['buildRunCompletedPayloadFn', payload]);
      return { event: 'run.completed', runId: 'run-1' };
    },
  });

  const keys = runtime.resolveAnalysisArtifactKeys();
  const runCompletedPayload = runtime.buildRunCompletedPayload();

  assert.deepEqual(keys, {
    needSetRunKey: 'needset/run',
    needSetLatestKey: 'needset/latest',
    phase07RunKey: 'phase07/run',
    phase07LatestKey: 'phase07/latest',
    phase08RunKey: 'phase08/run',
    phase08LatestKey: 'phase08/latest',
    sourcePacketsRunKey: 'sources/run',
    sourcePacketsLatestKey: 'sources/latest',
    itemPacketRunKey: 'item/run',
    itemPacketLatestKey: 'item/latest',
    runMetaPacketRunKey: 'meta/run',
    runMetaPacketLatestKey: 'meta/latest',
  });
  assert.deepEqual(runCompletedPayload, { event: 'run.completed', runId: 'run-1' });
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'buildAnalysisArtifactKeyPhaseContextFn',
      'buildAnalysisArtifactKeyContextFn',
      'buildRunCompletedPayloadPhaseCallsiteContextFn',
      'buildRunCompletedPayloadContextFn',
      'buildRunCompletedPayloadFn',
    ],
  );
});

test('runProductCompletionLifecycle can delegate through completionRuntime instead of raw collaborator wiring', async () => {
  const calls = [];
  const runtimeKeys = {
    needSetRunKey: 'needset/run',
    needSetLatestKey: 'needset/latest',
    phase07RunKey: 'phase07/run',
    phase07LatestKey: 'phase07/latest',
    phase08RunKey: 'phase08/run',
    phase08LatestKey: 'phase08/latest',
    sourcePacketsRunKey: 'sources/run',
    sourcePacketsLatestKey: 'sources/latest',
    itemPacketRunKey: 'item/run',
    itemPacketLatestKey: 'item/latest',
    runMetaPacketRunKey: 'meta/run',
    runMetaPacketLatestKey: 'meta/latest',
  };
  const runCompletedPayload = { event: 'run.completed', runId: 'run-1' };
  const runResultPayload = { ok: true };

  const result = await runProductCompletionLifecycle({
    completionRuntime: {
      applyResearchArtifacts: async () => {
        calls.push('applyResearchArtifacts');
      },
      resolveAnalysisArtifactKeys: () => {
        calls.push('resolveAnalysisArtifactKeys');
        return runtimeKeys;
      },
      runIndexingSchemaArtifacts: async ({ keys }) => {
        calls.push(['runIndexingSchemaArtifacts', keys]);
        return { indexingSchemaPackets: { packets: ['schema'] } };
      },
      emitFinalizationTelemetry: ({ keys, indexingSchemaPackets }) => {
        calls.push(['emitFinalizationTelemetry', { keys, indexingSchemaPackets }]);
      },
      buildRunCompletedPayload: () => {
        calls.push('buildRunCompletedPayload');
        return runCompletedPayload;
      },
      emitRunCompletedEvent: ({ runCompletedPayload: payload }) => {
        calls.push(['emitRunCompletedEvent', payload]);
      },
      buildSummaryArtifacts: async () => {
        calls.push('buildSummaryArtifacts');
        return { rowTsv: 'row-tsv', markdownSummary: '# summary' };
      },
      persistIdentityReport: async () => {
        calls.push('persistIdentityReport');
      },
      runSourceIntelFinalization: async () => {
        calls.push('runSourceIntelFinalization');
      },
      runPostLearningUpdates: async () => {
        calls.push('runPostLearningUpdates');
        return { categoryBrain: { updated: true } };
      },
      runLearningGate: () => {
        calls.push('runLearningGate');
        return { learningAllowed: true };
      },
      persistSelfImproveLearningStores: async ({ learningGateResult }) => {
        calls.push(['persistSelfImproveLearningStores', learningGateResult]);
      },
      buildLearningExportPhaseContext: ({ rowTsv, markdownSummary }) => {
        calls.push(['buildLearningExportPhaseContext', { rowTsv, markdownSummary }]);
        return { phase: 'learning-export' };
      },
      runTerminalLearningExportLifecycle: async ({ learningExportPhaseContext }) => {
        calls.push(['runTerminalLearningExportLifecycle', learningExportPhaseContext]);
        return {
          exportInfo: { key: 'export' },
          finalExport: { key: 'final' },
          learning: { key: 'learning' },
        };
      },
      buildRunResultPayload: ({
        exportInfo,
        finalExport,
        learning,
        learningGateResult,
        categoryBrain,
      }) => {
        calls.push([
          'buildRunResultPayload',
          { exportInfo, finalExport, learning, learningGateResult, categoryBrain },
        ]);
        return runResultPayload;
      },
    },
  });

  assert.equal(result, runResultPayload);
  assert.deepEqual(calls, [
    'applyResearchArtifacts',
    'resolveAnalysisArtifactKeys',
    ['runIndexingSchemaArtifacts', runtimeKeys],
    ['emitFinalizationTelemetry', { keys: runtimeKeys, indexingSchemaPackets: { packets: ['schema'] } }],
    'buildRunCompletedPayload',
    ['emitRunCompletedEvent', runCompletedPayload],
    'buildSummaryArtifacts',
    'persistIdentityReport',
    'runSourceIntelFinalization',
    'runPostLearningUpdates',
    'runLearningGate',
    ['persistSelfImproveLearningStores', { learningAllowed: true }],
    ['buildLearningExportPhaseContext', { rowTsv: 'row-tsv', markdownSummary: '# summary' }],
    ['runTerminalLearningExportLifecycle', { phase: 'learning-export' }],
    ['buildRunResultPayload', {
      exportInfo: { key: 'export' },
      finalExport: { key: 'final' },
      learning: { key: 'learning' },
      learningGateResult: { learningAllowed: true },
      categoryBrain: { updated: true },
    }],
  ]);
});

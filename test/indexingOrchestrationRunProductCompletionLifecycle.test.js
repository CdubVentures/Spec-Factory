import test from 'node:test';
import assert from 'node:assert/strict';

import { runProductCompletionLifecycle } from '../src/features/indexing/orchestration/finalize/runProductCompletionLifecycle.js';

test('runProductCompletionLifecycle preserves publication and learning lifecycle ordering', async () => {
  const calls = [];
  const summary = { runId: 'run-1', ok: true };
  const normalized = { fields: { weight_g: '59' } };
  const provenance = { weight_g: [{ url: 'https://example.com/spec' }] };
  const identityReport = { status: 'ok' };
  const learningExportPhaseContext = { phase: 'learning-export' };
  const runCompletedPayload = { event: 'run.completed', runId: 'run-1' };
  const runResultPayload = { ok: true };

  const result = await runProductCompletionLifecycle({
    constrainedFinalizationConfig: {
      writeMarkdownSummary: true,
    },
    storage: { id: 'storage' },
    runArtifactsBase: 'runs/base',
    category: 'mouse',
    productId: 'product-1',
    runId: 'run-1',
    runtimeMode: 'aggressive',
    startMs: 10,
    summary,
    categoryConfig: { category: 'mouse' },
    sourceResults: [{ url: 'https://example.com/spec' }],
    normalized,
    provenance,
    needSet: { needs: [] },
    phase08Extraction: { summary: { batch_count: 1 } },
    phase07PrimeSources: { summary: { refs_selected_total: 2 } },
    config: { raw: true },
    logger: { id: 'logger' },
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
    fieldOrder: ['weight_g'],
    llmContext: { verification: { done: true } },
    identityReport,
    sourceIntelBrand: 'Logitech',
    constraintAnalysis: { conflicts: [] },
    job: { identityLock: { brand: 'Logitech' } },
    updateCategoryBrainFn: async (payload) => {
      calls.push(['updateCategoryBrainFn', payload]);
      return { updated: true };
    },
    updateComponentLibraryFn: async (payload) => {
      calls.push(['updateComponentLibraryFn', payload]);
      return payload;
    },
    runtimeFieldRulesEngine: { version: 'v1' },
    evaluateFieldLearningGatesFn: (payload) => {
      calls.push(['evaluateFieldLearningGatesFn', payload]);
      return { fields: ['weight_g'] };
    },
    emitLearningGateEventsFn: (payload) => {
      calls.push(['emitLearningGateEventsFn', payload]);
      return payload;
    },
    importSpecDbFn: async () => ({ SpecDb: class SpecDb {} }),
    UrlMemoryStoreClass: class UrlMemoryStore {},
    DomainFieldYieldStoreClass: class DomainFieldYieldStore {},
    FieldAnchorsStoreClass: class FieldAnchorsStore {},
    ComponentLexiconStoreClass: class ComponentLexiconStore {},
    populateLearningStoresFn: async (payload) => {
      calls.push(['populateLearningStoresFn', payload]);
      return payload;
    },
    learningProfile: { enabled: true },
    discoveryResult: { enabled: true },
    artifactsByHost: { 'example.com': {} },
    adapterArtifacts: { adapter: true },
    candidates: [{ field: 'weight_g' }],
    persistLearningProfileFn: async (payload) => {
      calls.push(['persistLearningProfileFn', payload]);
      return { profile: true };
    },
    exportRunArtifactsFn: async (payload) => {
      calls.push(['exportRunArtifactsFn', payload]);
      return { export: true };
    },
    writeFinalOutputsFn: async (payload) => {
      calls.push(['writeFinalOutputsFn', payload]);
      return { final: true };
    },
    writeProductReviewArtifactsFn: async (payload) => {
      calls.push(['writeProductReviewArtifactsFn', payload]);
      return payload;
    },
    writeCategoryReviewArtifactsFn: async (payload) => {
      calls.push(['writeCategoryReviewArtifactsFn', payload]);
      return payload;
    },
    runLearningExportPhaseFn: async (payload) => {
      calls.push(['runLearningExportPhaseFn', payload]);
      return {
        exportInfo: { key: 'export' },
        finalExport: { key: 'final' },
        learning: { key: 'learning' },
      };
    },
    finalizeRunLifecycleFn: async (payload) => {
      calls.push(['finalizeRunLifecycleFn', payload]);
    },
    frontierDb: { id: 'frontier' },
    fieldReasoning: [{ field: 'weight_g', reason: 'evidence' }],
    emitFieldDecisionEventsFn: (payload) => {
      calls.push(['emitFieldDecisionEventsFn', payload]);
      return payload;
    },
    writeSummaryMarkdownLLMFn: async (payload) => {
      calls.push(['writeSummaryMarkdownLLMFn', payload]);
      return '# summary';
    },
    buildMarkdownSummaryFn: (payload) => {
      calls.push(['buildMarkdownSummaryFn', payload]);
      return '# fallback';
    },
    tsvRowFromFieldsFn: (fieldOrderArg, fieldsArg) => {
      calls.push(['tsvRowFromFieldsFn', { fieldOrderArg, fieldsArg }]);
      return 'row-tsv';
    },
    buildIndexingSchemaPacketsFn: (payload) => {
      calls.push(['buildIndexingSchemaPacketsFn', payload]);
      return { packets: true };
    },
    resolveIndexingSchemaValidationFn: async (payload) => {
      calls.push(['resolveIndexingSchemaValidationFn', payload]);
      return { validation: true };
    },
    buildIndexingSchemaSummaryPayloadFn: (payload) => {
      calls.push(['buildIndexingSchemaSummaryPayloadFn', payload]);
      return { payload: true };
    },
    persistAnalysisArtifactsFn: async (payload) => {
      calls.push(['persistAnalysisArtifactsFn', payload]);
      return payload;
    },
    validateIndexingSchemaPacketsFn: (payload) => {
      calls.push(['validateIndexingSchemaPacketsFn', payload]);
      return { valid: true };
    },
    persistSourceIntelFn: async (payload) => {
      calls.push(['persistSourceIntelFn', payload]);
      return payload;
    },
    buildResearchArtifactsPhaseContextFn: (payload) => {
      calls.push(['buildResearchArtifactsPhaseContextFn', payload]);
      return { researchContext: payload };
    },
    applyResearchArtifactsContextFn: async (payload) => {
      calls.push(['applyResearchArtifactsContextFn', payload]);
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
    buildIndexingSchemaArtifactsPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildIndexingSchemaArtifactsPhaseCallsiteContextFn', payload]);
      return { schemaCallsite: payload };
    },
    buildIndexingSchemaArtifactsPhaseContextFn: (payload) => {
      calls.push(['buildIndexingSchemaArtifactsPhaseContextFn', payload]);
      return { schemaContext: payload };
    },
    runIndexingSchemaArtifactsPhaseFn: async (payload) => {
      calls.push(['runIndexingSchemaArtifactsPhaseFn', payload]);
      return { indexingSchemaPackets: { packets: ['schema'] } };
    },
    buildFinalizationTelemetryPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildFinalizationTelemetryPhaseCallsiteContextFn', payload]);
      return { telemetryCallsite: payload };
    },
    buildFinalizationTelemetryContextFn: (payload) => {
      calls.push(['buildFinalizationTelemetryContextFn', payload]);
      return { telemetryContext: payload };
    },
    runFinalizationTelemetryPhaseFn: (payload) => {
      calls.push(['runFinalizationTelemetryPhaseFn', payload]);
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
      return runCompletedPayload;
    },
    buildRunCompletedEventCallsiteContextFn: (payload) => {
      calls.push(['buildRunCompletedEventCallsiteContextFn', payload]);
      return { runCompletedEventCallsite: payload };
    },
    buildRunCompletedEventContextFn: (payload) => {
      calls.push(['buildRunCompletedEventContextFn', payload]);
      return { runCompletedEventContext: payload };
    },
    emitRunCompletedEventFn: (payload) => {
      calls.push(['emitRunCompletedEventFn', payload]);
    },
    buildSummaryArtifactsPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildSummaryArtifactsPhaseCallsiteContextFn', payload]);
      return { summaryArtifactsCallsite: payload };
    },
    buildSummaryArtifactsPhaseContextFn: (payload) => {
      calls.push(['buildSummaryArtifactsPhaseContextFn', payload]);
      return { summaryArtifactsContext: payload };
    },
    buildSummaryArtifactsContextFn: async (payload) => {
      calls.push(['buildSummaryArtifactsContextFn', payload]);
      return { rowTsv: 'row-tsv', markdownSummary: '# summary' };
    },
    buildIdentityReportPersistencePhaseCallsiteContextFn: (payload) => {
      calls.push(['buildIdentityReportPersistencePhaseCallsiteContextFn', payload]);
      return { identityReportCallsite: payload };
    },
    buildIdentityReportPersistenceContextFn: (payload) => {
      calls.push(['buildIdentityReportPersistenceContextFn', payload]);
      return { identityReportContext: payload };
    },
    runIdentityReportPersistencePhaseFn: async (payload) => {
      calls.push(['runIdentityReportPersistencePhaseFn', payload]);
    },
    buildSourceIntelFinalizationPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildSourceIntelFinalizationPhaseCallsiteContextFn', payload]);
      return { sourceIntelCallsite: payload };
    },
    buildSourceIntelFinalizationContextFn: (payload) => {
      calls.push(['buildSourceIntelFinalizationContextFn', payload]);
      return { sourceIntelContext: payload };
    },
    runSourceIntelFinalizationPhaseFn: async (payload) => {
      calls.push(['runSourceIntelFinalizationPhaseFn', payload]);
    },
    buildPostLearningUpdatesPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildPostLearningUpdatesPhaseCallsiteContextFn', payload]);
      return { postLearningCallsite: payload };
    },
    buildPostLearningUpdatesContextFn: (payload) => {
      calls.push(['buildPostLearningUpdatesContextFn', payload]);
      return { postLearningContext: payload };
    },
    runPostLearningUpdatesPhaseFn: async (payload) => {
      calls.push(['runPostLearningUpdatesPhaseFn', payload]);
      return { categoryBrain: { updated: true } };
    },
    buildLearningGatePhaseCallsiteContextFn: (payload) => {
      calls.push(['buildLearningGatePhaseCallsiteContextFn', payload]);
      return { learningGateCallsite: payload };
    },
    buildLearningGateContextFn: (payload) => {
      calls.push(['buildLearningGateContextFn', payload]);
      return { learningGateContext: payload };
    },
    runLearningGatePhaseFn: (payload) => {
      calls.push(['runLearningGatePhaseFn', payload]);
      return { learningAllowed: true };
    },
    buildSelfImproveLearningStoresPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildSelfImproveLearningStoresPhaseCallsiteContextFn', payload]);
      return { selfImproveCallsite: payload };
    },
    buildSelfImproveLearningStoresContextFn: (payload) => {
      calls.push(['buildSelfImproveLearningStoresContextFn', payload]);
      return { selfImproveContext: payload };
    },
    persistSelfImproveLearningStoresFn: async (payload) => {
      calls.push(['persistSelfImproveLearningStoresFn', payload]);
    },
    buildLearningExportPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildLearningExportPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildLearningExportPhaseContextFn: (payload) => {
      calls.push(['buildLearningExportPhaseContextFn', payload]);
      assert.equal(payload.markdownSummary, '# summary');
      assert.equal(payload.rowTsv, 'row-tsv');
      return learningExportPhaseContext;
    },
    buildTerminalLearningExportLifecyclePhaseCallsiteContextFn: (payload) => {
      calls.push(['buildTerminalLearningExportLifecyclePhaseCallsiteContextFn', payload]);
      return { terminalLifecycleCallsite: payload };
    },
    buildTerminalLearningExportLifecycleContextFn: (payload) => {
      calls.push(['buildTerminalLearningExportLifecycleContextFn', payload]);
      return { terminalLifecycleContext: payload };
    },
    runTerminalLearningExportLifecycleFn: async (payload) => {
      calls.push(['runTerminalLearningExportLifecycleFn', payload]);
      return {
        exportInfo: { key: 'export' },
        finalExport: { key: 'final' },
        learning: { key: 'learning' },
      };
    },
    buildRunResultPayloadPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildRunResultPayloadPhaseCallsiteContextFn', payload]);
      return { runResultCallsite: payload };
    },
    buildRunResultPayloadContextFn: (payload) => {
      calls.push(['buildRunResultPayloadContextFn', payload]);
      return { runResultContext: payload };
    },
    buildRunResultPayloadFn: (payload) => {
      calls.push(['buildRunResultPayloadFn', payload]);
      return runResultPayload;
    },
  });

  assert.equal(result, runResultPayload);

  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'buildResearchArtifactsPhaseContextFn',
      'applyResearchArtifactsContextFn',
      'buildAnalysisArtifactKeyPhaseContextFn',
      'buildAnalysisArtifactKeyContextFn',
      'buildIndexingSchemaArtifactsPhaseCallsiteContextFn',
      'buildIndexingSchemaArtifactsPhaseContextFn',
      'runIndexingSchemaArtifactsPhaseFn',
      'buildFinalizationTelemetryPhaseCallsiteContextFn',
      'buildFinalizationTelemetryContextFn',
      'runFinalizationTelemetryPhaseFn',
      'buildRunCompletedPayloadPhaseCallsiteContextFn',
      'buildRunCompletedPayloadContextFn',
      'buildRunCompletedPayloadFn',
      'buildRunCompletedEventCallsiteContextFn',
      'buildRunCompletedEventContextFn',
      'emitRunCompletedEventFn',
      'buildSummaryArtifactsPhaseCallsiteContextFn',
      'buildSummaryArtifactsPhaseContextFn',
      'buildSummaryArtifactsContextFn',
      'buildIdentityReportPersistencePhaseCallsiteContextFn',
      'buildIdentityReportPersistenceContextFn',
      'runIdentityReportPersistencePhaseFn',
      'buildSourceIntelFinalizationPhaseCallsiteContextFn',
      'buildSourceIntelFinalizationContextFn',
      'runSourceIntelFinalizationPhaseFn',
      'buildPostLearningUpdatesPhaseCallsiteContextFn',
      'buildPostLearningUpdatesContextFn',
      'runPostLearningUpdatesPhaseFn',
      'buildLearningGatePhaseCallsiteContextFn',
      'buildLearningGateContextFn',
      'runLearningGatePhaseFn',
      'buildSelfImproveLearningStoresPhaseCallsiteContextFn',
      'buildSelfImproveLearningStoresContextFn',
      'persistSelfImproveLearningStoresFn',
      'buildLearningExportPhaseCallsiteContextFn',
      'buildLearningExportPhaseContextFn',
      'buildTerminalLearningExportLifecyclePhaseCallsiteContextFn',
      'buildTerminalLearningExportLifecycleContextFn',
      'runTerminalLearningExportLifecycleFn',
      'buildRunResultPayloadPhaseCallsiteContextFn',
      'buildRunResultPayloadContextFn',
      'buildRunResultPayloadFn',
    ],
  );

  const schemaCall = calls.find(([name]) => name === 'buildIndexingSchemaArtifactsPhaseCallsiteContextFn')[1];
  assert.deepEqual(schemaCall.keys, {
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

  const summaryArtifactsCall = calls.find(([name]) => name === 'buildSummaryArtifactsPhaseCallsiteContextFn')[1];
  const completedEventCall = calls.find(([name]) => name === 'buildRunCompletedEventCallsiteContextFn')[1];
  assert.equal(completedEventCall.runCompletedPayload, runCompletedPayload);

  const terminalLifecycleCall = calls.find(([name]) => name === 'buildTerminalLearningExportLifecyclePhaseCallsiteContextFn')[1];
  assert.equal(terminalLifecycleCall.learningExportPhaseContext, learningExportPhaseContext);
  assert.equal(terminalLifecycleCall.finalizeRunLifecycleFn.name, 'finalizeRunLifecycleFn');
});

test('runProductCompletionLifecycle propagates failures before downstream publication work', async () => {
  const calls = [];

  await assert.rejects(
    runProductCompletionLifecycle({
      summary: { runId: 'run-1' },
      runArtifactsBase: 'runs/base',
      category: 'mouse',
      productId: 'product-1',
      runId: 'run-1',
      fieldOrder: [],
      normalized: { fields: {} },
      provenance: {},
      buildResearchArtifactsPhaseContextFn: (payload) => payload,
      applyResearchArtifactsContextFn: async () => {
        calls.push('applyResearchArtifactsContextFn');
      },
      buildAnalysisArtifactKeyPhaseContextFn: (payload) => payload,
      buildAnalysisArtifactKeyContextFn: () => ({
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
      }),
      buildIndexingSchemaArtifactsPhaseCallsiteContextFn: (payload) => payload,
      buildIndexingSchemaArtifactsPhaseContextFn: (payload) => payload,
      runIndexingSchemaArtifactsPhaseFn: async () => {
        calls.push('runIndexingSchemaArtifactsPhaseFn');
        throw new Error('schema failed');
      },
      buildRunCompletedPayloadPhaseCallsiteContextFn: (payload) => payload,
      buildRunCompletedPayloadContextFn: (payload) => payload,
      buildRunCompletedPayloadFn: () => {
        calls.push('buildRunCompletedPayloadFn');
      },
    }),
    /schema failed/,
  );

  assert.deepEqual(calls, [
    'applyResearchArtifactsContextFn',
    'runIndexingSchemaArtifactsPhaseFn',
  ]);
});

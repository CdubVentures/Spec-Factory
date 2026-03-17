import test from 'node:test';
import assert from 'node:assert/strict';

import { runProductFinalizationDerivation } from '../src/features/indexing/orchestration/finalize/runProductFinalizationDerivation.js';

test('runProductFinalizationDerivation preserves derivation phase ordering and state threading', async () => {
  const calls = [];
  const result = await runProductFinalizationDerivation({
    adapterManager: { id: 'adapter-manager' },
    job: { identityLock: { brand: 'Logitech' } },
    runId: 'run-1',
    storage: { id: 'storage' },
    helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
    adapterArtifacts: { adapter: true },
    sourceResults: [{ url: 'https://example.com/spec' }],
    anchors: { shape: 'symmetrical' },
    config: {
      llmWriteSummary: true,
      cortexEnabled: true,
    },
    productId: 'product-1',
    categoryConfig: { criticalFieldSet: new Set(['weight_g']) },
    fieldOrder: ['shape', 'weight_g'],
    category: 'mouse',
    runtimeFieldRulesEngine: { version: 'v1' },
    terminalReason: '',
    learnedConstraints: { shape: true },
    logger: { id: 'logger' },
    llmContext: { verification: { done: true } },
    roundContext: { round: 2 },
    discoveryResult: { enabled: true },
    artifactsByHost: { 'example.com': {} },
    requiredFields: ['shape'],
    targets: {
      targetCompleteness: 0.9,
      targetConfidence: 0.8,
    },
    startMs: 500,
    nowFn: () => 2000,
    sourceIntel: { data: { domains: {} } },
    identityLock: { family_model_count: 2, ambiguity_level: 'medium' },
    learnedFieldAvailability: { shape: 'high' },
    learnedFieldYield: { shape: 'high' },
    llmBudgetGuard: {
      snapshot: () => ({ state: { blockedReason: '' } }),
    },
    phase08BatchRows: [{ batch: 1 }],
    phase08FieldContexts: { shape: { context: true } },
    phase08PrimeRows: [{ field: 'shape' }],
    llmValidatorDecisions: { enabled: false },
    buildCandidateFieldMapFn: (payload) => payload,
    evaluateAnchorConflictsFn: (payload) => payload,
    evaluateSourceIdentityFn: (payload) => payload,
    evaluateIdentityGateFn: (payload) => payload,
    buildIdentityReportFn: (payload) => payload,
    bestIdentityFromSourcesFn: (payload) => payload,
    buildIdentityObjectFn: (payload) => payload,
    buildSourceSummaryFn: (payload) => payload,
    mergeAnchorConflictListsFn: (payload) => payload,
    executeConsensusPhaseFn: (payload) => payload,
    buildAbortedNormalizedFn: (payload) => payload,
    buildValidatedNormalizedFn: (payload) => payload,
    createEmptyProvenanceFn: (payload) => payload,
    selectAggressiveEvidencePackFn: (payload) => {
      calls.push(['selectAggressiveEvidencePackFn', payload]);
      return { pack: true };
    },
    aggregateTemporalSignalsFn: (payload) => payload,
    applyInferencePoliciesFn: (payload) => payload,
    computeCompletenessRequiredFn: (payload) => payload,
    computeCoverageOverallFn: (payload) => payload,
    computeConfidenceFn: (payload) => payload,
    evaluateValidationGateFn: (payload) => payload,
    aggregateEndpointSignalsFn: (payload) => payload,
    evaluateConstraintGraphFn: (payload) => payload,
    buildDedicatedSyntheticSourceIngestionContextFn: (payload) => {
      calls.push(['buildDedicatedSyntheticSourceIngestionContextFn', payload]);
      return payload;
    },
    runDedicatedSyntheticSourceIngestionPhaseFn: async (payload) => {
      calls.push(['runDedicatedSyntheticSourceIngestionPhaseFn', payload]);
    },
    buildIdentityConsensusPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildIdentityConsensusPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildIdentityConsensusContextFn: (payload) => {
      calls.push(['buildIdentityConsensusContextFn', payload]);
      return {
        identityGate: { validated: true, needsReview: false, reasonCodes: [], certainty: 0.92 },
        identityConfidence: 0.92,
        identityReport: { status: 'ok' },
        identity: { brand: 'Logitech', model: 'G Pro X Superlight 2' },
        sourceSummary: { sources: 1 },
        allAnchorConflicts: [{ severity: 'MAJOR' }],
        anchorMajorConflictsCount: 1,
        consensus: { agreementScore: 0.87, fields: { weight_g: '60' } },
      };
    },
    buildIdentityNormalizationPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildIdentityNormalizationPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildIdentityNormalizationContextFn: (payload) => {
      calls.push(['buildIdentityNormalizationContextFn', payload]);
      return {
        identityPublishThreshold: 0.8,
        identityAbort: false,
        identityProvisional: true,
        identityFull: false,
        normalized: { fields: { weight_g: '60' }, quality: {} },
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
        candidates: [{ field: 'weight_g' }],
        fieldsBelowPassTarget: ['weight_g'],
        criticalFieldsBelowPassTarget: ['weight_g'],
        newValuesProposed: [{ field: 'weight_g', value: '60' }],
      };
    },
    runComponentPriorPhaseFn: async (payload) => {
      calls.push(['runComponentPriorPhaseFn', payload]);
      assert.deepEqual(payload.fieldsBelowPassTarget, ['weight_g']);
      return {
        componentPriorFilledFields: ['shape'],
        componentPriorMatches: ['shell'],
        fieldsBelowPassTarget: ['battery_life'],
        criticalFieldsBelowPassTarget: [],
      };
    },
    runDeterministicCriticPhaseFn: (payload) => {
      calls.push(['runDeterministicCriticPhaseFn', payload]);
      assert.deepEqual(payload.fieldsBelowPassTarget, ['battery_life']);
      return {
        criticDecisions: { accept: [{ field: 'shape' }] },
        fieldsBelowPassTarget: ['polling_hz'],
        criticalFieldsBelowPassTarget: [],
      };
    },
    runLlmValidatorPhaseFn: async (payload) => {
      calls.push(['runLlmValidatorPhaseFn', payload]);
      assert.equal(payload.identityProvisional, true);
      return {
        llmValidatorDecisions: { enabled: true, accept: [{ field: 'shape' }] },
        fieldsBelowPassTarget: ['sensor'],
        criticalFieldsBelowPassTarget: [],
      };
    },
    runInferencePolicyPhaseFn: (payload) => {
      calls.push(['runInferencePolicyPhaseFn', payload]);
      assert.deepEqual(payload.fieldsBelowPassTarget, ['sensor']);
      return {
        temporalEvidence: { hits: 2 },
        inferenceResult: { filled_fields: ['shape'] },
        fieldsBelowPassTarget: ['sensor'],
        criticalFieldsBelowPassTarget: [],
      };
    },
    runAggressiveExtractionPhaseFn: async (payload) => {
      calls.push(['runAggressiveExtractionPhaseFn', payload]);
      assert.deepEqual(payload.runtimeEvidencePack, { pack: true });
      return {
        aggressiveExtraction: { enabled: true },
        fieldsBelowPassTarget: ['dpi'],
        criticalFieldsBelowPassTarget: [],
      };
    },
    applyRuntimeGateAndCurationFn: async (payload) => {
      calls.push(['applyRuntimeGateAndCurationFn', payload]);
      assert.deepEqual(payload.runtimeEvidencePack, { pack: true });
      return {
        runtimeGateResult: { failures: [] },
        normalizedFields: { weight_g: '59' },
        fieldsBelowPassTarget: ['weight_g'],
        criticalFieldsBelowPassTarget: [],
        curationSuggestionResult: { appended_count: 1 },
      };
    },
    buildValidationGatePhaseCallsiteContextFn: (payload) => {
      calls.push(['buildValidationGatePhaseCallsiteContextFn', payload]);
      assert.deepEqual(payload.criticalFieldsBelowPassTarget, []);
      return payload;
    },
    buildValidationGateContextFn: (payload) => {
      calls.push(['buildValidationGateContextFn', payload]);
      return {
        completenessStats: { completenessRequired: 0.9 },
        coverageStats: { coverageOverall: 0.85 },
        confidence: 0.91,
        gate: { validated: true, validatedReason: 'validated' },
        publishable: true,
        publishBlockers: [],
      };
    },
    buildConstraintAnalysisPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildConstraintAnalysisPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildConstraintAnalysisContextFn: (payload) => {
      calls.push(['buildConstraintAnalysisContextFn', payload]);
      return {
        manufacturerSources: [{ url: 'https://example.com/spec' }],
        manufacturerMajorConflicts: 0,
        endpointMining: { endpoint_count: 3 },
        constraintAnalysis: { conflicts: [] },
      };
    },
    buildNeedsetReasoningPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildNeedsetReasoningPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildNeedsetReasoningContextFn: (payload) => {
      calls.push(['buildNeedsetReasoningContextFn', payload]);
      return {
        hypothesisQueue: [{ field: 'weight_g' }],
        fieldReasoning: { weight_g: { reason: 'missing' } },
        trafficLight: { yellow: ['weight_g'] },
        llmBudgetBlockedReason: '',
        extractionGateOpen: true,
        needSet: { needs: [{ field_key: 'weight_g' }] },
      };
    },
    buildPhase07PrimeSourcesOptionsFn: (payload) => {
      calls.push(['buildPhase07PrimeSourcesOptionsFn', payload]);
      return { maxSources: 3 };
    },
    buildPhase07PrimeSourcesPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildPhase07PrimeSourcesPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildPhase07PrimeSourcesContextFn: (payload) => {
      calls.push(['buildPhase07PrimeSourcesContextFn', payload]);
      return {
        phase07PrimeSources: { summary: { refs_selected_total: 2 } },
      };
    },
    buildPhase08ExtractionPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildPhase08ExtractionPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildPhase08ExtractionContextFn: (payload) => {
      calls.push(['buildPhase08ExtractionContextFn', payload]);
      return {
        phase08SummaryFromBatches: { batch_count: 1 },
        phase08Extraction: { summary: { accepted_candidate_count: 3 } },
      };
    },
    buildFinalizationMetricsPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildFinalizationMetricsPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildFinalizationMetricsContextFn: (payload) => {
      calls.push(['buildFinalizationMetricsContextFn', payload]);
      return {
        parserHealthRows: [{ score: 1 }],
        parserHealthAverage: 0.44,
        fingerprintCount: 7,
        contribution: { llmFields: ['shape'] },
      };
    },
    buildCortexSidecarPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildCortexSidecarPhaseCallsiteContextFn', payload]);
      return payload;
    },
    buildCortexSidecarContextFn: async (payload) => {
      calls.push(['buildCortexSidecarContextFn', payload]);
      return { status: 'disabled' };
    },
  });

  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'buildDedicatedSyntheticSourceIngestionContextFn',
      'runDedicatedSyntheticSourceIngestionPhaseFn',
      'buildIdentityConsensusPhaseCallsiteContextFn',
      'buildIdentityConsensusContextFn',
      'buildIdentityNormalizationPhaseCallsiteContextFn',
      'buildIdentityNormalizationContextFn',
      'runComponentPriorPhaseFn',
      'runDeterministicCriticPhaseFn',
      'runLlmValidatorPhaseFn',
      'runInferencePolicyPhaseFn',
      'selectAggressiveEvidencePackFn',
      'runAggressiveExtractionPhaseFn',
      'applyRuntimeGateAndCurationFn',
      'buildValidationGatePhaseCallsiteContextFn',
      'buildValidationGateContextFn',
      'buildConstraintAnalysisPhaseCallsiteContextFn',
      'buildConstraintAnalysisContextFn',
      'buildNeedsetReasoningPhaseCallsiteContextFn',
      'buildNeedsetReasoningContextFn',
      'buildPhase07PrimeSourcesOptionsFn',
      'buildPhase07PrimeSourcesPhaseCallsiteContextFn',
      'buildPhase07PrimeSourcesContextFn',
      'buildPhase08ExtractionPhaseCallsiteContextFn',
      'buildPhase08ExtractionContextFn',
      'buildFinalizationMetricsPhaseCallsiteContextFn',
      'buildFinalizationMetricsContextFn',
      'buildCortexSidecarPhaseCallsiteContextFn',
      'buildCortexSidecarContextFn',
    ],
  );

  assert.deepEqual(result.normalized.fields, { weight_g: '59' });
  assert.equal(result.confidence, 0.91);
  assert.equal(result.gate.validated, true);
  assert.equal(result.publishable, true);
  assert.deepEqual(result.componentPriorFilledFields, ['shape']);
  assert.deepEqual(result.componentPriorMatches, ['shell']);
  assert.deepEqual(result.criticDecisions, { accept: [{ field: 'shape' }] });
  assert.deepEqual(result.llmValidatorDecisions, { enabled: true, accept: [{ field: 'shape' }] });
  assert.deepEqual(result.runtimeEvidencePack, { pack: true });
  assert.deepEqual(result.phase07PrimeSources, { summary: { refs_selected_total: 2 } });
  assert.deepEqual(result.phase08Extraction, { summary: { accepted_candidate_count: 3 } });
  assert.equal(result.durationMs, 1500);
  assert.deepEqual(result.cortexSidecar, { status: 'disabled' });
});

test('runProductFinalizationDerivation disables expensive finalization phases when max run budget is already reached', async () => {
  const calls = [];

  const result = await runProductFinalizationDerivation({
    job: {},
    runId: 'run-1',
    sourceResults: [],
    config: {
      llmWriteSummary: true,
      cortexEnabled: true,
    },
    categoryConfig: { criticalFieldSet: new Set() },
    terminalReason: 'max_run_seconds_reached',
    fieldOrder: [],
    llmValidatorDecisions: { enabled: false, prior: true },
    llmBudgetGuard: {
      snapshot: () => ({ state: { blockedReason: '' } }),
    },
    buildDedicatedSyntheticSourceIngestionContextFn: (payload) => payload,
    runDedicatedSyntheticSourceIngestionPhaseFn: async () => {},
    buildIdentityConsensusPhaseCallsiteContextFn: (payload) => payload,
    buildIdentityConsensusContextFn: () => ({
      identityGate: { validated: true, needsReview: false, reasonCodes: [] },
      identityConfidence: 0.92,
      identityReport: {},
      identity: {},
      sourceSummary: {},
      allAnchorConflicts: [],
      anchorMajorConflictsCount: 0,
      consensus: {},
    }),
    buildIdentityNormalizationPhaseCallsiteContextFn: (payload) => payload,
    buildIdentityNormalizationContextFn: () => ({
      identityPublishThreshold: 0.8,
      identityAbort: false,
      identityProvisional: false,
      identityFull: true,
      normalized: { fields: {}, quality: {} },
      provenance: {},
      candidates: [],
      fieldsBelowPassTarget: [],
      criticalFieldsBelowPassTarget: [],
      newValuesProposed: [],
    }),
    runComponentPriorPhaseFn: async () => ({
      componentPriorFilledFields: [],
      componentPriorMatches: [],
      fieldsBelowPassTarget: [],
      criticalFieldsBelowPassTarget: [],
    }),
    runDeterministicCriticPhaseFn: () => ({
      criticDecisions: {},
      fieldsBelowPassTarget: [],
      criticalFieldsBelowPassTarget: [],
    }),
    runLlmValidatorPhaseFn: async () => {
      calls.push('runLlmValidatorPhaseFn');
      return {};
    },
    runInferencePolicyPhaseFn: () => ({
      temporalEvidence: {},
      inferenceResult: {},
      fieldsBelowPassTarget: [],
      criticalFieldsBelowPassTarget: [],
    }),
    selectAggressiveEvidencePackFn: () => null,
    runAggressiveExtractionPhaseFn: async () => {
      calls.push('runAggressiveExtractionPhaseFn');
      return {};
    },
    applyRuntimeGateAndCurationFn: async () => ({
      runtimeGateResult: {},
      normalizedFields: {},
      fieldsBelowPassTarget: [],
      criticalFieldsBelowPassTarget: [],
      curationSuggestionResult: {},
    }),
    buildValidationGatePhaseCallsiteContextFn: (payload) => payload,
    buildValidationGateContextFn: () => ({
      completenessStats: {},
      coverageStats: {},
      confidence: 0.9,
      gate: { validated: true, validatedReason: 'validated' },
      publishable: true,
      publishBlockers: [],
    }),
    buildConstraintAnalysisPhaseCallsiteContextFn: (payload) => payload,
    buildConstraintAnalysisContextFn: () => ({
      manufacturerSources: [],
      manufacturerMajorConflicts: 0,
      endpointMining: {},
      constraintAnalysis: {},
    }),
    buildNeedsetReasoningPhaseCallsiteContextFn: (payload) => payload,
    buildNeedsetReasoningContextFn: () => ({
      hypothesisQueue: [],
      fieldReasoning: {},
      trafficLight: {},
      llmBudgetBlockedReason: '',
      extractionGateOpen: true,
      needSet: {},
    }),
    buildPhase07PrimeSourcesOptionsFn: () => ({}),
    buildPhase07PrimeSourcesPhaseCallsiteContextFn: (payload) => payload,
    buildPhase07PrimeSourcesContextFn: () => ({
      phase07PrimeSources: {},
    }),
    buildPhase08ExtractionPhaseCallsiteContextFn: (payload) => payload,
    buildPhase08ExtractionContextFn: () => ({
      phase08SummaryFromBatches: {},
      phase08Extraction: {},
    }),
    buildFinalizationMetricsPhaseCallsiteContextFn: (payload) => payload,
    buildFinalizationMetricsContextFn: () => ({
      parserHealthRows: [],
      parserHealthAverage: 0,
      fingerprintCount: 0,
      contribution: {},
    }),
    buildCortexSidecarPhaseCallsiteContextFn: (payload) => {
      calls.push(payload.config);
      return payload;
    },
    buildCortexSidecarContextFn: async () => ({ status: 'disabled' }),
  });

  assert.deepEqual(calls, [
    {
      llmWriteSummary: false,
      cortexEnabled: false,
    },
  ]);
  assert.deepEqual(result.llmValidatorDecisions, { enabled: false, prior: true });
  assert.equal(result.aggressiveExtraction, null);
  assert.equal(result.constrainedFinalizationConfig.llmWriteSummary, false);
  assert.equal(result.constrainedFinalizationConfig.cortexEnabled, false);
});

test('runProductFinalizationDerivation uses seed schema4 from discoveryResult instead of calling LLM', async () => {
  const schema4Panel = {
    bundles: [{
      key: 'sensor_performance',
      label: 'Sensor & Performance',
      priority: 'core',
      phase: 'now',
      fields: [],
      queries: ['logitech g pro x superlight 2 sensor'],
    }],
    profile_influence: { manufacturer_html: 2, total_queries: 3 },
    deltas: [],
    round: 0,
    round_mode: 'seed',
  };
  const schema4Output = {
    schema_version: 'needset_planner_output.v2',
    panel: schema4Panel,
    search_plan_handoff: { queries: [{ q: 'logitech g pro x superlight 2 sensor', family: 'manufacturer_html' }] },
  };

  const result = await runProductFinalizationDerivation({
    job: { identityLock: { brand: 'Logitech' } },
    runId: 'run-1',
    sourceResults: [],
    config: {},
    productId: 'product-1',
    category: 'mouse',
    categoryConfig: { criticalFieldSet: new Set(), fieldGroupsData: { sensor_performance: {} } },
    fieldOrder: ['sensor'],
    llmValidatorDecisions: {},
    llmBudgetGuard: { snapshot: () => ({ state: { blockedReason: '' } }) },
    logger: { warn: () => {} },
    llmContext: {},
    discoveryResult: { enabled: true, seed_search_plan_output: schema4Output },
    buildDedicatedSyntheticSourceIngestionContextFn: (p) => p,
    runDedicatedSyntheticSourceIngestionPhaseFn: async () => {},
    buildIdentityConsensusPhaseCallsiteContextFn: (p) => p,
    buildIdentityConsensusContextFn: () => ({
      identityGate: { validated: true, reasonCodes: [] },
      identityConfidence: 0.9, identityReport: {}, identity: { brand: 'Logitech' },
      sourceSummary: {}, allAnchorConflicts: [], anchorMajorConflictsCount: 0, consensus: {},
    }),
    buildIdentityNormalizationPhaseCallsiteContextFn: (p) => p,
    buildIdentityNormalizationContextFn: () => ({
      identityPublishThreshold: 0.8, identityProvisional: false, identityFull: true,
      normalized: { fields: {} }, provenance: {}, candidates: [],
      fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [], newValuesProposed: [],
    }),
    runComponentPriorPhaseFn: async () => ({ componentPriorFilledFields: [], componentPriorMatches: [], fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [] }),
    runDeterministicCriticPhaseFn: () => ({ criticDecisions: {}, fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [] }),
    runLlmValidatorPhaseFn: async () => ({ llmValidatorDecisions: {}, fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [] }),
    runInferencePolicyPhaseFn: () => ({ temporalEvidence: {}, inferenceResult: {}, fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [] }),
    selectAggressiveEvidencePackFn: () => null,
    runAggressiveExtractionPhaseFn: async () => ({ aggressiveExtraction: null, fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [] }),
    applyRuntimeGateAndCurationFn: async () => ({ runtimeGateResult: {}, normalizedFields: {}, fieldsBelowPassTarget: [], criticalFieldsBelowPassTarget: [], curationSuggestionResult: {} }),
    buildValidationGatePhaseCallsiteContextFn: (p) => p,
    buildValidationGateContextFn: () => ({ completenessStats: {}, coverageStats: {}, confidence: 0.9, gate: { validated: true, validatedReason: 'ok' }, publishable: true, publishBlockers: [] }),
    buildConstraintAnalysisPhaseCallsiteContextFn: (p) => p,
    buildConstraintAnalysisContextFn: () => ({ manufacturerSources: [], manufacturerMajorConflicts: 0, endpointMining: {}, constraintAnalysis: {} }),
    buildNeedsetReasoningPhaseCallsiteContextFn: (p) => p,
    buildNeedsetReasoningContextFn: () => ({
      hypothesisQueue: [], fieldReasoning: {}, trafficLight: {},
      llmBudgetBlockedReason: '', extractionGateOpen: true,
      needSet: { fields: [{ field_key: 'sensor', state: 'missing', required_level: 'critical' }], total_fields: 1 },
    }),
    buildPhase07PrimeSourcesOptionsFn: () => ({}),
    buildPhase07PrimeSourcesPhaseCallsiteContextFn: (p) => p,
    buildPhase07PrimeSourcesContextFn: () => ({ phase07PrimeSources: {} }),
    buildPhase08ExtractionPhaseCallsiteContextFn: (p) => p,
    buildPhase08ExtractionContextFn: () => ({ phase08Extraction: {} }),
    buildFinalizationMetricsPhaseCallsiteContextFn: (p) => p,
    buildFinalizationMetricsContextFn: () => ({ parserHealthRows: [], parserHealthAverage: 0, fingerprintCount: 0, contribution: {} }),
    buildCortexSidecarPhaseCallsiteContextFn: (p) => p,
    buildCortexSidecarContextFn: async () => ({ status: 'disabled' }),
  });

  // needSet is enriched with seed Schema 4 panel data
  assert.deepEqual(result.needSet.bundles, schema4Panel.bundles);
  assert.deepEqual(result.needSet.profile_influence, schema4Panel.profile_influence);
  assert.equal(result.needSet.schema_version, 'needset_planner_output.v2');
  assert.equal(result.needSet.round, 0);
  assert.equal(result.needSet.round_mode, 'seed');

  // searchPlanOutput is the seed schema4 output (no LLM call in finalization)
  assert.deepEqual(result.searchPlanOutput, schema4Output);
});

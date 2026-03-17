import test from 'node:test';
import assert from 'node:assert/strict';

import { createProductFinalizationDerivationRuntime } from '../src/features/indexing/orchestration/index.js';
import { runProductFinalizationDerivation } from '../src/features/indexing/orchestration/finalize/runProductFinalizationDerivation.js';

test('createProductFinalizationDerivationRuntime builds derivation phases from static context', async () => {
  const calls = [];
  const computeCompletenessRequiredFn = (payload) => payload;
  const computeCoverageOverallFn = (payload) => payload;
  const computeConfidenceFn = (payload) => payload;
  const evaluateValidationGateFn = (payload) => payload;

  const runtime = createProductFinalizationDerivationRuntime({
    context: {
      adapterManager: { id: 'adapter-manager' },
      job: { id: 'job-1' },
      runId: 'run-1',
      storage: { id: 'storage' },
      helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
      adapterArtifacts: { adapter: true },
      sourceResults: [{ url: 'https://example.com/spec' }],
      anchors: { shape: 'symmetrical' },
      config: { cortexEnabled: true },
      productId: 'product-1',
      categoryConfig: { criticalFieldSet: new Set(['weight_g']) },
      fieldOrder: ['shape', 'weight_g'],
      category: 'mouse',
      runtimeFieldRulesEngine: { version: 'v1' },
      requiredFields: ['shape'],
      targets: { targetCompleteness: 0.9 },
      logger: { id: 'logger' },
    },
    buildDedicatedSyntheticSourceIngestionContextFn: (payload) => {
      calls.push(['buildDedicatedSyntheticSourceIngestionContextFn', payload]);
      return { ingestionContext: payload };
    },
    runDedicatedSyntheticSourceIngestionPhaseFn: async (payload) => {
      calls.push(['runDedicatedSyntheticSourceIngestionPhaseFn', payload]);
    },
    buildIdentityConsensusPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildIdentityConsensusPhaseCallsiteContextFn', payload]);
      return { identityConsensusPhaseCallsite: payload };
    },
    buildIdentityConsensusContextFn: (payload) => {
      calls.push(['buildIdentityConsensusContextFn', payload]);
      return {
        identityGate: { validated: true },
        identityConfidence: 0.92,
        identityReport: { status: 'ok' },
        identity: { brand: 'Logitech' },
        sourceSummary: { sources: 1 },
        allAnchorConflicts: [],
        anchorMajorConflictsCount: 0,
        consensus: { agreementScore: 0.88 },
      };
    },
    buildValidationGatePhaseCallsiteContextFn: (payload) => {
      calls.push(['buildValidationGatePhaseCallsiteContextFn', payload]);
      assert.equal(payload.computeCompletenessRequiredFn, computeCompletenessRequiredFn);
      assert.equal(payload.computeCoverageOverallFn, computeCoverageOverallFn);
      assert.equal(payload.computeConfidenceFn, computeConfidenceFn);
      assert.equal(payload.evaluateValidationGateFn, evaluateValidationGateFn);
      return { validationGatePhaseCallsite: payload };
    },
    buildValidationGateContextFn: (payload) => {
      calls.push(['buildValidationGateContextFn', payload]);
      return {
        completenessStats: { completenessRequired: 0.9 },
        coverageStats: { coverageOverall: 0.84 },
        confidence: 0.91,
        gate: { validated: true, validatedReason: 'validated' },
        publishable: true,
        publishBlockers: [],
      };
    },
    buildCortexSidecarPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildCortexSidecarPhaseCallsiteContextFn', payload]);
      return { cortexSidecarPhaseCallsite: payload };
    },
    buildCortexSidecarContextFn: async (payload) => {
      calls.push(['buildCortexSidecarContextFn', payload]);
      return { status: 'disabled' };
    },
  });

  await runtime.runDedicatedSyntheticSourceIngestion();
  const identityConsensus = runtime.buildIdentityConsensus();
  const validationGate = runtime.buildValidationGate({
    normalized: { fields: { weight_g: '59' } },
    provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
    allAnchorConflicts: [],
    consensus: identityConsensus.consensus,
    identityGate: identityConsensus.identityGate,
    identityConfidence: identityConsensus.identityConfidence,
    criticalFieldsBelowPassTarget: [],
    identityFull: false,
    identityPublishThreshold: 0.8,
    computeCompletenessRequiredFn,
    computeCoverageOverallFn,
    computeConfidenceFn,
    evaluateValidationGateFn,
  });
  const cortexSidecar = await runtime.buildCortexSidecar({
    constrainedFinalizationConfig: { cortexEnabled: false },
    confidence: validationGate.confidence,
    criticalFieldsBelowPassTarget: [],
    anchorMajorConflictsCount: identityConsensus.anchorMajorConflictsCount,
    constraintAnalysis: { conflicts: [] },
    completenessStats: validationGate.completenessStats,
  });

  assert.deepEqual(identityConsensus.identity, { brand: 'Logitech' });
  assert.deepEqual(validationGate.gate, { validated: true, validatedReason: 'validated' });
  assert.deepEqual(cortexSidecar, { status: 'disabled' });
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'buildDedicatedSyntheticSourceIngestionContextFn',
      'runDedicatedSyntheticSourceIngestionPhaseFn',
      'buildIdentityConsensusPhaseCallsiteContextFn',
      'buildIdentityConsensusContextFn',
      'buildValidationGatePhaseCallsiteContextFn',
      'buildValidationGateContextFn',
      'buildCortexSidecarPhaseCallsiteContextFn',
      'buildCortexSidecarContextFn',
    ],
  );
});

test('runProductFinalizationDerivation can delegate through finalizationDerivationRuntime instead of raw collaborator wiring', async () => {
  const calls = [];

  const result = await runProductFinalizationDerivation({
    config: {
      llmWriteSummary: true,
      cortexEnabled: true,
    },
    terminalReason: '',
    startMs: 500,
    nowFn: () => 2000,
    categoryConfig: { criticalFieldSet: new Set(['weight_g']) },
    fieldOrder: ['shape', 'weight_g'],
    llmValidatorDecisions: { seeded: true },
    buildSearchPlanningContextFn: () => ({}),
    buildSearchPlanFn: async () => null,
    finalizationDerivationRuntime: {
      runDedicatedSyntheticSourceIngestion: async () => {
        calls.push('runDedicatedSyntheticSourceIngestion');
      },
      buildIdentityConsensus: () => {
        calls.push('buildIdentityConsensus');
        return {
          identityGate: { validated: true },
          identityConfidence: 0.92,
          identityReport: { status: 'ok' },
          identity: { brand: 'Logitech' },
          sourceSummary: { sources: 1 },
          allAnchorConflicts: [{ severity: 'MAJOR' }],
          anchorMajorConflictsCount: 1,
          consensus: { agreementScore: 0.87 },
        };
      },
      buildIdentityNormalization: ({
        identityConfidence,
        identity,
        sourceSummary,
        consensus,
      }) => {
        calls.push([
          'buildIdentityNormalization',
          { identityConfidence, identity, sourceSummary, consensus },
        ]);
        return {
          identityPublishThreshold: 0.8,
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
      runComponentPrior: async ({
        identityGate,
        normalized,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
      }) => {
        calls.push([
          'runComponentPrior',
          { identityGate, normalized, fieldsBelowPassTarget, criticalFieldsBelowPassTarget },
        ]);
        return {
          componentPriorFilledFields: ['shape'],
          componentPriorMatches: ['shell'],
          fieldsBelowPassTarget: ['battery_life'],
          criticalFieldsBelowPassTarget: [],
        };
      },
      runDeterministicCritic: ({
        normalized,
        provenance,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
      }) => {
        calls.push([
          'runDeterministicCritic',
          { normalized, provenance, fieldsBelowPassTarget, criticalFieldsBelowPassTarget },
        ]);
        return {
          criticDecisions: { accept: [{ field: 'shape' }] },
          fieldsBelowPassTarget: ['polling_hz'],
          criticalFieldsBelowPassTarget: [],
        };
      },
      runLlmValidator: async ({
        skipExpensiveFinalization,
        fieldsBelowPassTarget,
        identityProvisional,
        llmValidatorDecisions,
      }) => {
        calls.push([
          'runLlmValidator',
          {
            skipExpensiveFinalization,
            fieldsBelowPassTarget,
            identityProvisional,
            llmValidatorDecisions,
          },
        ]);
        return {
          llmValidatorDecisions: { enabled: true, accept: [{ field: 'shape' }] },
          fieldsBelowPassTarget: ['sensor'],
          criticalFieldsBelowPassTarget: [],
        };
      },
      runInferencePolicy: ({
        normalized,
        provenance,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
      }) => {
        calls.push([
          'runInferencePolicy',
          { normalized, provenance, fieldsBelowPassTarget, criticalFieldsBelowPassTarget },
        ]);
        return {
          temporalEvidence: { hits: 2 },
          inferenceResult: { filled_fields: ['shape'] },
          fieldsBelowPassTarget: ['sensor'],
          criticalFieldsBelowPassTarget: [],
        };
      },
      selectRuntimeEvidencePack: () => {
        calls.push('selectRuntimeEvidencePack');
        return { pack: true };
      },
      runAggressiveExtraction: async ({
        skipExpensiveFinalization,
        runtimeEvidencePack,
        fieldsBelowPassTarget,
      }) => {
        calls.push([
          'runAggressiveExtraction',
          { skipExpensiveFinalization, runtimeEvidencePack, fieldsBelowPassTarget },
        ]);
        return {
          aggressiveExtraction: { enabled: true },
          fieldsBelowPassTarget: ['dpi'],
          criticalFieldsBelowPassTarget: [],
        };
      },
      applyRuntimeGateAndCuration: async ({
        normalizedFields,
        runtimeEvidencePack,
        fieldsBelowPassTarget,
      }) => {
        calls.push([
          'applyRuntimeGateAndCuration',
          { normalizedFields, runtimeEvidencePack, fieldsBelowPassTarget },
        ]);
        return {
          runtimeGateResult: { failures: [] },
          normalizedFields: { weight_g: '59' },
          fieldsBelowPassTarget: ['weight_g'],
          criticalFieldsBelowPassTarget: [],
          curationSuggestionResult: { appended_count: 1 },
        };
      },
      buildValidationGate: ({
        normalized,
        allAnchorConflicts,
        identityGate,
        criticalFieldsBelowPassTarget,
      }) => {
        calls.push([
          'buildValidationGate',
          { normalized, allAnchorConflicts, identityGate, criticalFieldsBelowPassTarget },
        ]);
        return {
          completenessStats: { completenessRequired: 0.9 },
          coverageStats: { coverageOverall: 0.85 },
          confidence: 0.91,
          gate: { validated: true, validatedReason: 'validated' },
          publishable: true,
          publishBlockers: [],
        };
      },
      buildConstraintAnalysis: ({ runtimeGateResult, normalized }) => {
        calls.push(['buildConstraintAnalysis', { runtimeGateResult, normalized }]);
        return {
          manufacturerSources: [{ url: 'https://example.com/spec' }],
          manufacturerMajorConflicts: 0,
          endpointMining: { endpoint_count: 3 },
          constraintAnalysis: { conflicts: [] },
        };
      },
      buildNeedsetReasoning: ({
        constraintAnalysis,
        fieldsBelowPassTarget,
        publishable,
      }) => {
        calls.push([
          'buildNeedsetReasoning',
          { constraintAnalysis, fieldsBelowPassTarget, publishable },
        ]);
        return {
          hypothesisQueue: [{ field: 'weight_g' }],
          fieldReasoning: { weight_g: { reason: 'missing' } },
          trafficLight: { yellow: ['weight_g'] },
          llmBudgetBlockedReason: '',
          extractionGateOpen: true,
          needSet: { needs: [{ field_key: 'weight_g' }] },
        };
      },
      buildPhase07PrimeSources: ({ needSet, provenance }) => {
        calls.push(['buildPhase07PrimeSources', { needSet, provenance }]);
        return {
          phase07PrimeSources: { summary: { refs_selected_total: 2 } },
        };
      },
      buildPhase08Extraction: ({ llmValidatorDecisions }) => {
        calls.push(['buildPhase08Extraction', { llmValidatorDecisions }]);
        return {
          phase08Extraction: { summary: { accepted_candidate_count: 3 } },
        };
      },
      buildFinalizationMetrics: ({ normalized, provenance }) => {
        calls.push(['buildFinalizationMetrics', { normalized, provenance }]);
        return {
          parserHealthRows: [{ score: 1 }],
          parserHealthAverage: 0.44,
          fingerprintCount: 7,
          contribution: { llmFields: ['shape'] },
        };
      },
      buildCortexSidecar: async ({
        constrainedFinalizationConfig,
        confidence,
        anchorMajorConflictsCount,
      }) => {
        calls.push([
          'buildCortexSidecar',
          { constrainedFinalizationConfig, confidence, anchorMajorConflictsCount },
        ]);
        return { status: 'disabled' };
      },
    },
  });

  assert.deepEqual(result.normalized.fields, { weight_g: '59' });
  assert.deepEqual(result.criticDecisions, { accept: [{ field: 'shape' }] });
  assert.deepEqual(result.llmValidatorDecisions, { enabled: true, accept: [{ field: 'shape' }] });
  assert.deepEqual(result.runtimeEvidencePack, { pack: true });
  assert.deepEqual(result.phase07PrimeSources, { summary: { refs_selected_total: 2 } });
  assert.deepEqual(result.phase08Extraction, { summary: { accepted_candidate_count: 3 } });
  assert.deepEqual(result.cortexSidecar, { status: 'disabled' });
  assert.equal(result.durationMs, 1500);
  assert.deepEqual(
    calls,
    [
      'runDedicatedSyntheticSourceIngestion',
      'buildIdentityConsensus',
      ['buildIdentityNormalization', {
        identityConfidence: 0.92,
        identity: { brand: 'Logitech' },
        sourceSummary: { sources: 1 },
        consensus: { agreementScore: 0.87 },
      }],
      ['runComponentPrior', {
        identityGate: { validated: true },
        normalized: { fields: { weight_g: '59' }, quality: {} },
        fieldsBelowPassTarget: ['weight_g'],
        criticalFieldsBelowPassTarget: ['weight_g'],
      }],
      ['runDeterministicCritic', {
        normalized: { fields: { weight_g: '59' }, quality: {} },
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
        fieldsBelowPassTarget: ['battery_life'],
        criticalFieldsBelowPassTarget: [],
      }],
      ['runLlmValidator', {
        skipExpensiveFinalization: false,
        fieldsBelowPassTarget: ['polling_hz'],
        identityProvisional: true,
        llmValidatorDecisions: { seeded: true },
      }],
      ['runInferencePolicy', {
        normalized: { fields: { weight_g: '59' }, quality: {} },
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
        fieldsBelowPassTarget: ['sensor'],
        criticalFieldsBelowPassTarget: [],
      }],
      'selectRuntimeEvidencePack',
      ['runAggressiveExtraction', {
        skipExpensiveFinalization: false,
        runtimeEvidencePack: { pack: true },
        fieldsBelowPassTarget: ['sensor'],
      }],
      ['applyRuntimeGateAndCuration', {
        normalizedFields: { weight_g: '60' },
        runtimeEvidencePack: { pack: true },
        fieldsBelowPassTarget: ['dpi'],
      }],
      ['buildValidationGate', {
        normalized: { fields: { weight_g: '59' }, quality: {} },
        allAnchorConflicts: [{ severity: 'MAJOR' }],
        identityGate: { validated: true },
        criticalFieldsBelowPassTarget: [],
      }],
      ['buildConstraintAnalysis', {
        runtimeGateResult: { failures: [] },
        normalized: { fields: { weight_g: '59' }, quality: {} },
      }],
      ['buildNeedsetReasoning', {
        constraintAnalysis: { conflicts: [] },
        fieldsBelowPassTarget: ['weight_g'],
        publishable: true,
      }],
      ['buildPhase07PrimeSources', {
        needSet: { needs: [{ field_key: 'weight_g' }] },
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
      }],
      ['buildPhase08Extraction', {
        llmValidatorDecisions: { enabled: true, accept: [{ field: 'shape' }] },
      }],
      ['buildFinalizationMetrics', {
        normalized: { fields: { weight_g: '59' }, quality: {} },
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
      }],
      ['buildCortexSidecar', {
        constrainedFinalizationConfig: {
          llmWriteSummary: true,
          cortexEnabled: true,
        },
        confidence: 0.91,
        anchorMajorConflictsCount: 1,
      }],
    ],
  );
});

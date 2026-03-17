import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceExtractionPhaseContext } from '../src/features/indexing/orchestration/index.js';

function toFloat(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

test('buildSourceExtractionPhaseContext assembles a frozen grouped source finalization contract', () => {
  const logger = { info() {}, warn() {}, error() {} };
  const planner = { enqueue() {} };
  const runSourceResultsAppendPhaseFn = () => {};
  const runSourceEvidenceIndexPhaseFn = () => {};
  const runSourcePostFetchStatusPhaseFn = () => {};
  const runSourceKnownCandidatesPhaseFn = async () => ({
    sourceFieldValueMap: {},
    knownCandidatesFromSource: [],
  });
  const runSourceConflictTelemetryPhaseFn = () => {};
  const runSourceFrontierPersistencePhaseFn = () => ({
    frontierFetchRow: null,
    pageContentHash: '',
    pageBytes: 0,
  });
  const runSourceArtifactAggregationPhaseFn = () => ({
    llmSourcesUsedDelta: 0,
    llmCandidatesAcceptedDelta: 0,
  });
  const runSourceHostBudgetPhaseFn = () => ({
    hostBudgetAfterSource: {},
  });
  const runSourceProcessedTelemetryPhaseFn = () => {};
  const buildSourceProcessedPayloadFn = () => ({});
  const runSourceFinalizationPhaseFn = async () => ({
    llmSourcesUsed: 0,
    llmCandidatesAccepted: 0,
  });

  const context = buildSourceExtractionPhaseContext({
    logger,
    planner,
    config: {},
    category: 'mouse',
    productId: 'mouse-test',
    sourceResults: [],
    successfulSourceMetaByUrl: new Map(),
    frontierDb: { id: 'frontier' },
    repairSearchEnabled: true,
    repairDedupeRule: 'domain_once',
    repairQueryByDomain: new Set(),
    requiredFields: ['weight_g'],
    jobIdentityLock: { brand: 'Logitech' },
    normalizeHostTokenFn: (value = '') => String(value || ''),
    hostFromHttpUrlFn: () => 'example.com',
    buildRepairSearchQueryFn: () => 'repair query',
    maybeEmitRepairQueryFn: () => {},
    sha256Fn: (value = '') => String(value || ''),
    toFloatFn: toFloat,
    artifactsByHost: {},
    adapterArtifacts: [],
    llmSatisfiedFields: new Set(),
    anchors: {},
    collectKnownCandidatesFromSourceFn: () => ({
      sourceFieldValueMap: {},
      knownCandidatesFromSource: [],
    }),
    markSatisfiedLlmFieldsFn: () => {},
    bumpHostOutcomeFn: () => {},
    noteHostRetryTsFn: () => {},
    applyHostBudgetBackoffFn: () => {},
    resolveHostBudgetStateFn: () => ({ score: 100, state: 'active' }),
    runSourceResultsAppendPhaseFn,
    runSourceEvidenceIndexPhaseFn,
    runSourcePostFetchStatusPhaseFn,
    runSourceKnownCandidatesPhaseFn,
    runSourceConflictTelemetryPhaseFn,
    runSourceFrontierPersistencePhaseFn,
    runSourceArtifactAggregationPhaseFn,
    runSourceHostBudgetPhaseFn,
    runSourceProcessedTelemetryPhaseFn,
    buildSourceProcessedPayloadFn,
    runSourceFinalizationPhaseFn,
  });

  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.runtimeContext));
  assert.ok(Object.isFrozen(context.phaseFns));
  assert.ok(Object.isFrozen(context.contracts));
  assert.equal(context.phaseFns.runSourceFinalizationPhaseFn, runSourceFinalizationPhaseFn);
  assert.equal(context.contracts.sourceFinalization, context.sourceFinalizationContext);
  assert.ok(Object.isFrozen(context.contracts.sourceFinalization));
  assert.equal(context.contracts.sourceFinalization.runtimeContext.logger, logger);
  assert.equal(context.contracts.sourceFinalization.runtimeContext.planner, planner);
  assert.equal(
    context.contracts.sourceFinalization.phaseFns.runSourceResultsAppendPhaseFn,
    runSourceResultsAppendPhaseFn,
  );
  assert.equal(
    context.contracts.sourceFinalization.repairQueryContext.buildRepairSearchQueryFn(),
    'repair query',
  );
});


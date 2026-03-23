import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRunResultPayload,
  collectKnownCandidatesFromSource,
  emitFinalizationEvents,
  emitRunCompletedEvent,
  resolveHypothesisFollowupState,
} from '../src/features/indexing/orchestration/index.js';

test('collectKnownCandidatesFromSource returns first value map and known-field list excluding unk/empty', () => {
  const result = collectKnownCandidatesFromSource([
    { field: 'dpi', value: '26000' },
    { field: 'dpi', value: '32000' },
    { field: 'weight_g', value: 60 },
    { field: 'polling_hz', value: 'unk' },
    { field: '', value: 'x' },
    { field: 'sensor', value: '' },
  ]);
  assert.deepEqual(result.sourceFieldValueMap, {
    dpi: '26000',
    weight_g: '60'
  });
  assert.deepEqual(result.knownCandidatesFromSource, ['dpi', 'dpi', 'weight_g']);
});

test('emitFinalizationEvents emits finalization telemetry events in stable order', () => {
  const calls = [];
  const logger = {
    info(eventName, payload) {
      calls.push({ eventName, payload });
    },
  };
  const finalizationEventPayloads = {
    needsetComputedPayload: { key: 'needset' },
    phase07PrimeSourcesBuiltPayload: { key: 'phase07' },
    phase08ExtractionContextBuiltPayload: { key: 'phase08' },
    indexingSchemaPacketsWrittenPayload: { key: 'schema' },
  };
  emitFinalizationEvents({
    logger,
    finalizationEventPayloads,
  });
  assert.deepEqual(calls, [
    { eventName: 'needset_computed', payload: finalizationEventPayloads.needsetComputedPayload },
    { eventName: 'phase07_prime_sources_built', payload: finalizationEventPayloads.phase07PrimeSourcesBuiltPayload },
    { eventName: 'phase08_extraction_context_built', payload: finalizationEventPayloads.phase08ExtractionContextBuiltPayload },
    { eventName: 'indexing_schema_packets_written', payload: finalizationEventPayloads.indexingSchemaPacketsWrittenPayload },
  ]);
});

test('resolveHypothesisFollowupState returns follow-up rounds and seeded URL set from phase result', () => {
  const seededUrls = new Set(['https://example.com/a']);
  const result = resolveHypothesisFollowupState({
    followupResult: {
      hypothesisFollowupRoundsExecuted: 2,
      hypothesisFollowupSeededUrls: seededUrls,
    },
  });
  assert.equal(result.hypothesisFollowupRoundsExecuted, 2);
  assert.equal(result.hypothesisFollowupSeededUrls, seededUrls);
});
test('resolveHypothesisFollowupState preserves undefined values when phase result fields are missing', () => {
  const result = resolveHypothesisFollowupState({
    followupResult: {},
  });
  assert.equal(result.hypothesisFollowupRoundsExecuted, undefined);
  assert.equal(result.hypothesisFollowupSeededUrls, undefined);
});

test('emitRunCompletedEvent emits run_completed telemetry payload', () => {
  const calls = [];
  const logger = {
    info(eventName, payload) {
      calls.push({ eventName, payload });
    },
  };
  const runCompletedPayload = { runId: 'run-1', productId: 'mouse-1' };
  emitRunCompletedEvent({
    logger,
    runCompletedPayload,
  });
  assert.deepEqual(calls, [
    { eventName: 'run_completed', payload: runCompletedPayload },
  ]);
});

test('buildRunResultPayload builds canonical runProduct return envelope', () => {
  const payload = buildRunResultPayload({
    job: { id: 1 },
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [] },
    summary: { validated: true },
    runId: 'run_123',
    productId: 'mouse-product',
    exportInfo: { artifacts: 3 },
    finalExport: { ok: true },
    learning: { accepted: 1 },
    learningGateResult: { gateResults: [] },
    categoryBrain: { keys: ['a'] },
  });
  assert.deepEqual(payload.job, { id: 1 });
  assert.deepEqual(payload.normalized, { fields: { dpi: 32000 } });
  assert.deepEqual(payload.provenance, { dpi: [] });
  assert.deepEqual(payload.summary, { validated: true });
  assert.equal(payload.runId, 'run_123');
  assert.equal(payload.productId, 'mouse-product');
  assert.deepEqual(payload.exportInfo, { artifacts: 3 });
  assert.deepEqual(payload.finalExport, { ok: true });
  assert.deepEqual(payload.learning, { accepted: 1 });
  assert.deepEqual(payload.learningGateResult, { gateResults: [] });
  assert.deepEqual(payload.categoryBrain, { keys: ['a'] });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { emitFinalizationEvents } from '../src/features/indexing/orchestration/index.js';

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

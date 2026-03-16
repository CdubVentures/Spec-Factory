import test from 'node:test';
import assert from 'node:assert/strict';
import { runFinalizationTelemetryPhase } from '../src/features/indexing/orchestration/index.js';

test('runFinalizationTelemetryPhase builds payloads then emits finalization telemetry', () => {
  const callOrder = [];
  const logger = { info() {} };
  const finalizationEventPayloads = { key: 'value' };

  const result = runFinalizationTelemetryPhase({
    logger,
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    needSet: { needset_size: 3 },
    needSetRunKey: 'needset/run.json',
    phase07PrimeSources: { summary: { fields_attempted: 1 } },
    phase07RunKey: 'phase07/run.json',
    phase08Extraction: { summary: { batch_count: 2 } },
    phase08RunKey: 'phase08/run.json',
    indexingSchemaPackets: { sourceCollection: { source_packet_count: 5 } },
    sourcePacketsRunKey: 'schema/source/run.json',
    itemPacketRunKey: 'schema/item/run.json',
    runMetaPacketRunKey: 'schema/meta/run.json',
    buildFinalizationEventPayloadsFn: (args) => {
      callOrder.push('buildFinalizationEventPayloads');
      assert.deepEqual(args, {
        productId: 'mouse-1',
        runId: 'run-1',
        category: 'mouse',
        needSet: { needset_size: 3 },
        needSetRunKey: 'needset/run.json',
        phase07PrimeSources: { summary: { fields_attempted: 1 } },
        phase07RunKey: 'phase07/run.json',
        phase08Extraction: { summary: { batch_count: 2 } },
        phase08RunKey: 'phase08/run.json',
        indexingSchemaPackets: { sourceCollection: { source_packet_count: 5 } },
        sourcePacketsRunKey: 'schema/source/run.json',
        itemPacketRunKey: 'schema/item/run.json',
        runMetaPacketRunKey: 'schema/meta/run.json',
      });
      return finalizationEventPayloads;
    },
    emitFinalizationEventsFn: ({ logger: emittedLogger, finalizationEventPayloads: emittedPayloads }) => {
      callOrder.push('emitFinalizationEvents');
      assert.equal(emittedLogger, logger);
      assert.equal(emittedPayloads, finalizationEventPayloads);
    },
  });

  assert.deepEqual(callOrder, [
    'buildFinalizationEventPayloads',
    'emitFinalizationEvents',
  ]);
  assert.deepEqual(result, { finalizationEventPayloads });
});

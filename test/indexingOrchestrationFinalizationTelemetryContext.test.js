import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalizationTelemetryContext } from '../src/features/indexing/orchestration/index.js';

test('buildFinalizationTelemetryContext maps runProduct finalization telemetry inputs to phase contract keys', () => {
  const buildFinalizationEventPayloads = () => ({});
  const emitFinalizationEvents = () => {};

  const context = buildFinalizationTelemetryContext({
    logger: { info() {} },
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
    buildFinalizationEventPayloads,
    emitFinalizationEvents,
  });

  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.category, 'mouse');
  assert.equal(context.buildFinalizationEventPayloadsFn, buildFinalizationEventPayloads);
  assert.equal(context.emitFinalizationEventsFn, emitFinalizationEvents);
});

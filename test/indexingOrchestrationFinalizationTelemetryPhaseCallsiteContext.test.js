import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalizationTelemetryPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildFinalizationTelemetryPhaseCallsiteContext maps runProduct finalization telemetry inputs to context keys', () => {
  const context = buildFinalizationTelemetryPhaseCallsiteContext({
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
    buildFinalizationEventPayloads: () => ({}),
    emitFinalizationEvents: () => {},
  });

  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.category, 'mouse');
  assert.equal(context.needSetRunKey, 'needset/run.json');
  assert.equal(context.phase07RunKey, 'phase07/run.json');
  assert.equal(context.phase08RunKey, 'phase08/run.json');
  assert.equal(context.sourcePacketsRunKey, 'schema/source/run.json');
  assert.equal(context.itemPacketRunKey, 'schema/item/run.json');
  assert.equal(context.runMetaPacketRunKey, 'schema/meta/run.json');
  assert.equal(typeof context.buildFinalizationEventPayloads, 'function');
  assert.equal(typeof context.emitFinalizationEvents, 'function');
});

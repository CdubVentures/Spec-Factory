import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisArtifactKeyContext } from '../src/features/indexing/orchestration/index.js';

test('buildAnalysisArtifactKeyContext builds run/latest analysis keys and stamps summary pointers', () => {
  const calls = {
    resolveOutputKey: 0,
  };
  const summary = {
    needset: { existing: true },
    phase07: { existing: true },
    phase08: { existing: true },
  };

  const storage = {
    resolveOutputKey: (...parts) => {
      calls.resolveOutputKey += 1;
      return parts.join('/');
    },
  };

  const result = buildAnalysisArtifactKeyContext({
    storage,
    category: 'mouse',
    productId: 'mouse-product',
    runBase: 'specs/outputs/mouse/mouse-product/runs/run_123',
    summary,
  });

  assert.equal(calls.resolveOutputKey, 1);
  assert.equal(result.latestBase, 'mouse/mouse-product/latest');
  assert.equal(result.needSetRunKey.endsWith('/analysis/needset.json'), true);
  assert.equal(result.needSetLatestKey.endsWith('/latest/needset.json'), true);
  assert.equal(result.phase07RunKey.endsWith('/analysis/phase07_retrieval.json'), true);
  assert.equal(result.phase07LatestKey.endsWith('/latest/phase07_retrieval.json'), true);
  assert.equal(result.phase08RunKey.endsWith('/analysis/phase08_extraction.json'), true);
  assert.equal(result.phase08LatestKey.endsWith('/latest/phase08_extraction.json'), true);
  assert.equal(result.sourcePacketsRunKey.endsWith('/analysis/source_indexing_extraction_packets.json'), true);
  assert.equal(result.sourcePacketsLatestKey.endsWith('/latest/source_indexing_extraction_packets.json'), true);
  assert.equal(result.itemPacketRunKey.endsWith('/analysis/item_indexing_extraction_packet.json'), true);
  assert.equal(result.itemPacketLatestKey.endsWith('/latest/item_indexing_extraction_packet.json'), true);
  assert.equal(result.runMetaPacketRunKey.endsWith('/analysis/run_meta_packet.json'), true);
  assert.equal(result.runMetaPacketLatestKey.endsWith('/latest/run_meta_packet.json'), true);

  assert.equal(summary.needset.existing, true);
  assert.equal(summary.needset.key, result.needSetRunKey);
  assert.equal(summary.needset.latest_key, result.needSetLatestKey);
  assert.equal(summary.phase07.existing, true);
  assert.equal(summary.phase07.key, result.phase07RunKey);
  assert.equal(summary.phase07.latest_key, result.phase07LatestKey);
  assert.equal(summary.phase08.existing, true);
  assert.equal(summary.phase08.key, result.phase08RunKey);
  assert.equal(summary.phase08.latest_key, result.phase08LatestKey);
});

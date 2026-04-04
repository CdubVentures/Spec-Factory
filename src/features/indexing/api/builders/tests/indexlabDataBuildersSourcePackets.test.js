import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
  readIndexLabRunSourceIndexingPackets,
  resolveIndexLabRunDirectory,
} from '../indexlabDataBuilders.js';

test('readIndexLabRunSourceIndexingPackets: local live run reads packet collection from output-root run artifacts', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-source-packets-local-output-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const requestedRunId = 'live-watch-run-token';
  const canonicalRunId = '20260309-live-run-canonical';
  const category = 'mouse';
  const productId = 'mouse-test-brand-model';
  const runDir = path.join(indexLabRoot, requestedRunId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), JSON.stringify({
    run_id: canonicalRunId,
    category,
    product_id: productId,
    status: 'completed',
    run_base: `specs/outputs/${category}/${productId}/runs/${canonicalRunId}`,
    latest_base: `specs/outputs/${category}/${productId}/latest`,
  }), 'utf8');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), '', 'utf8');

  const expectedPacketCollection = {
    record_kind: 'source_indexing_extraction_packet_collection',
    run_id: requestedRunId,
    packets: [
      {
        canonical_url: 'https://support.example.com/specs/mouse-pro',
        field_key_map: {
          weight: { contexts: [] },
        },
      },
    ],
  };
  const packetPath = path.join(
    outputRoot,
    'specs',
    'outputs',
    category,
    productId,
    'runs',
    canonicalRunId,
    'analysis',
    'source_indexing_extraction_packets.json',
  );
  await fs.mkdir(path.dirname(packetPath), { recursive: true });
  await fs.writeFile(packetPath, `${JSON.stringify(expectedPacketCollection)}\n`, 'utf8');

  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot,
    storage: {
      resolveOutputKey: (...parts) => ['specs', 'outputs', ...parts.map((part) => String(part || '').trim()).filter(Boolean)].join('/'),
      readJsonOrNull: async () => null,
    },
    config: {},
    getSpecDbReady: () => false,
    isProcessRunning: () => false,
  });

  try {
    const result = await readIndexLabRunSourceIndexingPackets(requestedRunId);
    // WHY: Disk fallback resolves output-root artifacts via run_base when SQL is unavailable.
    assert.ok(result && typeof result === 'object', 'expected non-null packet collection');
    assert.equal(result.record_kind, 'source_indexing_extraction_packet_collection');
    assert.equal(result.run_id, requestedRunId);
    assert.ok(Array.isArray(result.packets), 'packets should be an array');
    assert.equal(result.packets.length, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

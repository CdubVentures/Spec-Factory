import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
  readIndexLabRunSourceIndexingPackets,
  resolveIndexLabRunDirectory,
} from '../src/features/indexing/api/builders/indexlabDataBuilders.js';

function createArchivedS3StorageStub(files = {}) {
  const normalized = new Map(
    Object.entries(files).map(([key, value]) => [String(key), Buffer.from(JSON.stringify(value), 'utf8')]),
  );
  return {
    async listKeys(prefix) {
      const token = String(prefix || '');
      return [...normalized.keys()].filter((key) => key.startsWith(token)).sort();
    },
    async readJsonOrNull(key) {
      if (!normalized.has(key)) return null;
      return JSON.parse(normalized.get(key).toString('utf8'));
    },
    async readTextOrNull(key) {
      if (!normalized.has(key)) return null;
      return normalized.get(key).toString('utf8');
    },
    async readBuffer(key) {
      if (!normalized.has(key)) {
        const error = new Error('not_found');
        error.code = 'ENOENT';
        throw error;
      }
      return Buffer.from(normalized.get(key));
    },
    async objectExists(key) {
      return normalized.has(key);
    },
  };
}

test('readIndexLabRunSourceIndexingPackets: archived s3 cache latest_snapshot file is readable after indexlab hydration', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-source-packets-cache-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-source-packets-cache';
  const category = 'mouse';
  const productId = 'mouse-test-brand-model';
  const s3Prefix = 'spec-factory-runs';
  const archiveBase = `${s3Prefix}/${category}/${productId}/${runId}/indexlab`;
  const archiveStorage = createArchivedS3StorageStub({
    [`${archiveBase}/run.json`]: {
      run_id: runId,
      category,
      product_id: productId,
      status: 'completed',
      started_at: '2026-02-22T00:00:00.000Z',
      ended_at: '2026-02-22T00:01:00.000Z',
    },
    [`${archiveBase}/run_events.ndjson`]: '',
  });

  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot,
    storage: {
      resolveOutputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
      readJsonOrNull: async () => null,
    },
    config: {},
    getSpecDbReady: () => false,
    isProcessRunning: () => false,
    runDataStorageState: {
      enabled: true,
      destinationType: 's3',
      localDirectory: '',
      s3Bucket: 'test-bucket',
      s3Prefix,
    },
    runDataArchiveStorage: archiveStorage,
  });

  try {
    await resolveIndexLabRunDirectory(runId);

    const expectedPacketCollection = {
      record_kind: 'source_indexing_extraction_packet_collection',
      run_id: runId,
      packets: [
        {
          canonical_url: 'https://support.example.com/specs/mouse-pro',
          field_key_map: {
            weight: { contexts: [] },
          },
        },
      ],
    };
    const cachedPacketPath = path.join(
      outputRoot,
      '_runtime',
      'archived_runs',
      's3',
      runId,
      'latest_snapshot',
      'source_indexing_extraction_packets.json',
    );
    await fs.mkdir(path.dirname(cachedPacketPath), { recursive: true });
    await fs.writeFile(cachedPacketPath, `${JSON.stringify(expectedPacketCollection)}\n`, 'utf8');

    const result = await readIndexLabRunSourceIndexingPackets(runId);
    assert.deepEqual(result, expectedPacketCollection);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

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
    runDataStorageState: {
      enabled: false,
      destinationType: 'local',
      localDirectory: '',
    },
    runDataArchiveStorage: null,
  });

  try {
    const result = await readIndexLabRunSourceIndexingPackets(requestedRunId);
    assert.deepEqual(result, expectedPacketCollection);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
  listIndexLabRuns
} from '../indexlabDataBuilders.js';

function storageStub() {
  return {
    resolveOutputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    resolveInputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    readJsonOrNull: async () => null
  };
}

function createArchivedS3StorageStub(files = {}) {
  const normalized = new Map(
    Object.entries(files).map(([key, value]) => [String(key), Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')]),
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

async function writeRun({
  indexLabRoot,
  runId,
  startedAt,
  withNeedset,
  withSearchProfile
}) {
  const runDir = path.join(indexLabRoot, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify({
    run_id: runId,
    category: 'mouse',
    product_id: `mouse-${runId}`,
    status: 'completed',
    started_at: startedAt,
    ended_at: startedAt,
    counters: {
      pages_checked: 0,
      fetched_ok: 0,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 0,
      indexed_docs: 0,
      fields_filled: 0
    }
  })}\n`, 'utf8');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), '', 'utf8');
  if (withNeedset) {
    await fs.writeFile(path.join(runDir, 'needset.json'), `${JSON.stringify({
      run_id: runId,
      total_fields: 0,
      needset_size: 0,
      needs: []
    })}\n`, 'utf8');
  }
  if (withSearchProfile) {
    await fs.writeFile(path.join(runDir, 'search_profile.json'), `${JSON.stringify({
      run_id: runId,
      status: 'pending',
      query_rows: [],
      queries: []
    })}\n`, 'utf8');
  }
}

test('listIndexLabRuns includes artifact readiness flags for needset and search profile', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-run-ready-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  await writeRun({
    indexLabRoot,
    runId: 'run-ready',
    startedAt: '2026-02-21T00:00:00.000Z',
    withNeedset: true,
    withSearchProfile: true
  });
  await writeRun({
    indexLabRoot,
    runId: 'run-missing',
    startedAt: '2026-02-20T00:00:00.000Z',
    withNeedset: false,
    withSearchProfile: false
  });

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: storageStub(),
      config: {},
      getSpecDbReady: () => false,
      isProcessRunning: () => false
    });

    const rows = await listIndexLabRuns({ limit: 10 });
    const ready = rows.find((row) => row.run_id === 'run-ready');
    const missing = rows.find((row) => row.run_id === 'run-missing');

    assert.ok(ready);
    assert.ok(missing);

    assert.equal(ready.has_needset, true);
    assert.equal(ready.has_search_profile, true);
    assert.equal(missing.has_needset, false);
    assert.equal(missing.has_search_profile, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('listIndexLabRuns includes relocated local runs after source indexlab directories are removed', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-run-relocated-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  const archiveRoot = path.join(tempRoot, 'archive');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-relocated';
  const category = 'mouse';
  const productId = 'mouse-run-relocated';
  const archivedIndexLabRoot = path.join(archiveRoot, category, productId, runId, 'indexlab');
  await fs.mkdir(archivedIndexLabRoot, { recursive: true });
  await fs.writeFile(path.join(archivedIndexLabRoot, 'run.json'), `${JSON.stringify({
    run_id: runId,
    category,
    product_id: productId,
    status: 'completed',
    started_at: '2026-02-22T00:00:00.000Z',
    ended_at: '2026-02-22T00:01:00.000Z',
    counters: {
      pages_checked: 1,
      fetched_ok: 1,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 1,
      indexed_docs: 1,
      fields_filled: 3,
    },
  })}\n`, 'utf8');
  await fs.writeFile(path.join(archivedIndexLabRoot, 'run_events.ndjson'), '', 'utf8');
  await fs.writeFile(path.join(archivedIndexLabRoot, 'needset.json'), `${JSON.stringify({
    run_id: runId,
    total_fields: 0,
    needset_size: 0,
    needs: [],
  })}\n`, 'utf8');

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: storageStub(),
      config: {},
      getSpecDbReady: () => false,
      isProcessRunning: () => false,
      runDataStorageState: {
        enabled: true,
        destinationType: 'local',
        localDirectory: archiveRoot,
      },
    });

    const rows = await listIndexLabRuns({ limit: 10 });
    const relocated = rows.find((row) => row.run_id === runId);

    assert.ok(relocated);
    assert.equal(relocated.category, category);
    assert.equal(relocated.product_id, productId);
    assert.equal(relocated.has_needset, true);
    assert.equal(relocated.storage_origin, 'local');
    assert.match(String(relocated.picker_label || ''), /Mouse/i);
    assert.equal(
      String(relocated.run_dir || '').includes(path.join(category, productId, runId, 'indexlab')),
      true,
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('listIndexLabRuns includes relocated s3 runs after source indexlab directories are removed', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-run-s3-relocated-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-relocated-s3';
  const category = 'mouse';
  const productId = 'mouse-run-relocated-s3';
  const s3Prefix = 'spec-factory-runs';
  const archiveBase = `${s3Prefix}/${category}/${productId}/${runId}/indexlab`;
  const localRunOutputRoot = path.join(outputRoot, 'runs', category, productId, runId);
  await fs.mkdir(localRunOutputRoot, { recursive: true });
  await fs.writeFile(path.join(localRunOutputRoot, 'summary.json'), JSON.stringify({ run_id: runId }), 'utf8');
  const archiveStorage = createArchivedS3StorageStub({
    [`${archiveBase}/run.json`]: JSON.stringify({
      run_id: runId,
      category,
      product_id: productId,
      status: 'completed',
      started_at: '2026-02-22T00:00:00.000Z',
      ended_at: '2026-02-22T00:01:00.000Z',
      counters: {
        pages_checked: 1,
        fetched_ok: 1,
        fetched_404: 0,
        fetched_blocked: 0,
        fetched_error: 0,
        parse_completed: 1,
        indexed_docs: 1,
        fields_filled: 3,
      },
    }),
    [`${archiveBase}/run_events.ndjson`]: '',
    [`${archiveBase}/needset.json`]: JSON.stringify({
      run_id: runId,
      total_fields: 0,
      needset_size: 0,
      needs: [],
    }),
  });

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: storageStub(),
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

    const rows = await listIndexLabRuns({ limit: 10 });
    const relocated = rows.find((row) => row.run_id === runId);

    assert.ok(relocated);
    assert.equal(relocated.category, category);
    assert.equal(relocated.product_id, productId);
    assert.equal(relocated.has_needset, true);
    assert.equal(relocated.storage_origin, 's3');
    assert.match(String(relocated.picker_label || ''), /Mouse/i);
    assert.equal(path.basename(String(relocated.run_dir || '')), 'indexlab');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('listIndexLabRuns applies category filtering before limit trimming so recent category runs are not hidden by other categories', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-run-category-limit-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  await writeRun({
    indexLabRoot,
    runId: 'run-keyboard-newest',
    startedAt: '2026-03-04T00:00:00.000Z',
    withNeedset: true,
    withSearchProfile: true,
  });
  await fs.writeFile(path.join(indexLabRoot, 'run-keyboard-newest', 'run.json'), `${JSON.stringify({
    run_id: 'run-keyboard-newest',
    category: 'keyboard',
    product_id: 'keyboard-wooting-80he',
    status: 'completed',
    started_at: '2026-03-04T00:00:00.000Z',
    ended_at: '2026-03-04T00:05:00.000Z',
    counters: {
      pages_checked: 0,
      fetched_ok: 0,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 0,
      indexed_docs: 0,
      fields_filled: 0,
    },
  })}\n`, 'utf8');
  await writeRun({
    indexLabRoot,
    runId: 'run-mouse-newest',
    startedAt: '2026-03-03T00:00:00.000Z',
    withNeedset: true,
    withSearchProfile: true,
  });
  await fs.writeFile(path.join(indexLabRoot, 'run-mouse-newest', 'run.json'), `${JSON.stringify({
    run_id: 'run-mouse-newest',
    category: 'mouse',
    product_id: 'mouse-razer-viper-v3-pro',
    status: 'completed',
    started_at: '2026-03-03T00:00:00.000Z',
    ended_at: '2026-03-03T00:05:00.000Z',
    counters: {
      pages_checked: 0,
      fetched_ok: 0,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 0,
      indexed_docs: 0,
      fields_filled: 0,
    },
  })}\n`, 'utf8');
  await writeRun({
    indexLabRoot,
    runId: 'run-keyboard-second',
    startedAt: '2026-03-02T00:00:00.000Z',
    withNeedset: true,
    withSearchProfile: true,
  });
  await fs.writeFile(path.join(indexLabRoot, 'run-keyboard-second', 'run.json'), `${JSON.stringify({
    run_id: 'run-keyboard-second',
    category: 'keyboard',
    product_id: 'keyboard-logitech-g915',
    status: 'completed',
    started_at: '2026-03-02T00:00:00.000Z',
    ended_at: '2026-03-02T00:05:00.000Z',
    counters: {
      pages_checked: 0,
      fetched_ok: 0,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 0,
      indexed_docs: 0,
      fields_filled: 0,
    },
  })}\n`, 'utf8');
  await writeRun({
    indexLabRoot,
    runId: 'run-mouse-second',
    startedAt: '2026-03-01T00:00:00.000Z',
    withNeedset: true,
    withSearchProfile: true,
  });
  await fs.writeFile(path.join(indexLabRoot, 'run-mouse-second', 'run.json'), `${JSON.stringify({
    run_id: 'run-mouse-second',
    category: 'mouse',
    product_id: 'mouse-logitech-g-pro-x-superlight-2',
    status: 'completed',
    started_at: '2026-03-01T00:00:00.000Z',
    ended_at: '2026-03-01T00:05:00.000Z',
    counters: {
      pages_checked: 0,
      fetched_ok: 0,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 0,
      indexed_docs: 0,
      fields_filled: 0,
    },
  })}\n`, 'utf8');

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: storageStub(),
      config: {},
      getSpecDbReady: () => false,
      isProcessRunning: () => false,
    });

    const rows = await listIndexLabRuns({ limit: 2, category: 'mouse' });
    assert.deepEqual(
      rows.map((row) => row.run_id),
      ['run-mouse-newest', 'run-mouse-second'],
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});


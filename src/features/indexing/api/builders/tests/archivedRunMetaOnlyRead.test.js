import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initArchivedRunLocationHelpers,
  readArchivedS3RunMetaOnly,
  buildArchivedS3CacheRoot,
} from '../archivedRunLocationHelpers.js';

// ---------------------------------------------------------------------------
// S3 storage stub
// ---------------------------------------------------------------------------

function createS3Stub(files = {}) {
  const normalized = new Map(
    Object.entries(files).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
  );
  const calls = { listKeys: 0, readTextOrNull: 0 };
  return {
    calls,
    storage: {
      async listKeys(prefix) {
        calls.listKeys += 1;
        return [...normalized.keys()].filter((k) => k.startsWith(prefix));
      },
      async readTextOrNull(key) {
        calls.readTextOrNull += 1;
        return normalized.get(key) ?? null;
      },
      async readBuffer(key) {
        const text = normalized.get(key);
        if (text == null) throw Object.assign(new Error('not_found'), { code: 'ENOENT' });
        return Buffer.from(text, 'utf8');
      },
      async readJsonOrNull(key) {
        const text = normalized.get(key);
        if (text == null) return null;
        return JSON.parse(text);
      },
      async objectExists(key) {
        return normalized.has(key);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('readArchivedS3RunMetaOnly', () => {
  test('returns parsed run.json when S3 has the key', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-only-'));
    try {
      const runMeta = { run_id: 'run-123', status: 'completed', category: 'keyboard', counters: { pages: 5 } };
      const s3Stub = createS3Stub({
        'archive/keyboard/kb-product/run-123/indexlab/run.json': runMeta,
      });
      initArchivedRunLocationHelpers({
        outputRoot: tempRoot,
        runDataArchiveStorage: s3Stub.storage,
        runDataStorageState: { enabled: true, destinationType: 's3', s3Prefix: 'archive' },
      });

      const location = { type: 's3', keyBase: 'archive/keyboard/kb-product/run-123', runId: 'run-123' };
      const result = await readArchivedS3RunMetaOnly(location, 'run-123');

      assert.deepEqual(result, runMeta);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('enriches parsed metadata with artifact readiness from single-object probes', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-only-'));
    try {
      const runMeta = { run_id: 'run-artifacts', status: 'completed', category: 'keyboard', counters: { pages: 5 } };
      const s3Stub = createS3Stub({
        'archive/keyboard/kb-product/run-artifacts/indexlab/run.json': runMeta,
        'archive/keyboard/kb-product/run-artifacts/indexlab/needset.json': { ok: true },
        'archive/keyboard/kb-product/run-artifacts/indexlab/search_profile.json': { ok: true },
      });
      initArchivedRunLocationHelpers({
        outputRoot: tempRoot,
        runDataArchiveStorage: s3Stub.storage,
        runDataStorageState: { enabled: true, destinationType: 's3', s3Prefix: 'archive' },
      });

      const location = { type: 's3', keyBase: 'archive/keyboard/kb-product/run-artifacts', runId: 'run-artifacts' };
      const result = await readArchivedS3RunMetaOnly(location, 'run-artifacts');

      assert.deepEqual(result, {
        ...runMeta,
        artifacts: {
          has_needset: true,
          has_search_profile: true,
        },
      });
      assert.equal(s3Stub.calls.listKeys, 0, 'artifact enrichment must not call listKeys');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('returns null when S3 key is missing', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-only-'));
    try {
      const s3Stub = createS3Stub({});
      initArchivedRunLocationHelpers({
        outputRoot: tempRoot,
        runDataArchiveStorage: s3Stub.storage,
        runDataStorageState: { enabled: true, destinationType: 's3', s3Prefix: 'archive' },
      });

      const location = { type: 's3', keyBase: 'archive/keyboard/kb-product/run-missing', runId: 'run-missing' };
      const result = await readArchivedS3RunMetaOnly(location, 'run-missing');

      assert.equal(result, null);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('caches locally — second call does not hit S3', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-only-'));
    try {
      const runMeta = { run_id: 'run-cached', status: 'completed', counters: { pages: 3 } };
      const s3Stub = createS3Stub({
        'archive/mouse/ms-prod/run-cached/indexlab/run.json': runMeta,
      });
      initArchivedRunLocationHelpers({
        outputRoot: tempRoot,
        runDataArchiveStorage: s3Stub.storage,
        runDataStorageState: { enabled: true, destinationType: 's3', s3Prefix: 'archive' },
      });

      const location = { type: 's3', keyBase: 'archive/mouse/ms-prod/run-cached', runId: 'run-cached' };
      const first = await readArchivedS3RunMetaOnly(location, 'run-cached');
      const s3CallsAfterFirst = s3Stub.calls.readTextOrNull;

      const second = await readArchivedS3RunMetaOnly(location, 'run-cached');

      assert.deepEqual(first, runMeta);
      assert.deepEqual(second, runMeta);
      assert.equal(s3Stub.calls.readTextOrNull, s3CallsAfterFirst, 'second call must not hit S3');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('does NOT call listKeys (single-file read only)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-only-'));
    try {
      const runMeta = { run_id: 'run-nolist', status: 'completed' };
      const s3Stub = createS3Stub({
        'archive/keyboard/kb-prod/run-nolist/indexlab/run.json': runMeta,
      });
      initArchivedRunLocationHelpers({
        outputRoot: tempRoot,
        runDataArchiveStorage: s3Stub.storage,
        runDataStorageState: { enabled: true, destinationType: 's3', s3Prefix: 'archive' },
      });

      const location = { type: 's3', keyBase: 'archive/keyboard/kb-prod/run-nolist', runId: 'run-nolist' };
      await readArchivedS3RunMetaOnly(location, 'run-nolist');

      assert.equal(s3Stub.calls.listKeys, 0, 'listKeys must never be called');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('handles non-object run.json content (returns null)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'meta-only-'));
    try {
      const s3Stub = createS3Stub({
        'archive/keyboard/kb-prod/run-bad/indexlab/run.json': '"just a string"',
      });
      initArchivedRunLocationHelpers({
        outputRoot: tempRoot,
        runDataArchiveStorage: s3Stub.storage,
        runDataStorageState: { enabled: true, destinationType: 's3', s3Prefix: 'archive' },
      });

      const location = { type: 's3', keyBase: 'archive/keyboard/kb-prod/run-bad', runId: 'run-bad' };
      const result = await readArchivedS3RunMetaOnly(location, 'run-bad');

      assert.equal(result, null);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});

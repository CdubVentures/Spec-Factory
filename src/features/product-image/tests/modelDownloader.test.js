/**
 * modelDownloader contract tests.
 *
 * Tests use _fetchOverride DI seam — no real HuggingFace downloads.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureModelReady } from '../modelDownloader.js';

const TMP = path.join(os.tmpdir(), `model-dl-test-${Date.now()}`);

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

before(() => fs.mkdirSync(TMP, { recursive: true }));
after(() => cleanup(TMP));

describe('ensureModelReady', () => {
  it('returns ready when model file already exists', async () => {
    const dir = path.join(TMP, 'exists');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'model_int8.onnx'), 'fake-model-data');

    const result = await ensureModelReady({ modelDir: dir });

    assert.equal(result.ready, true);
    assert.ok(result.path.endsWith('model_int8.onnx'));
  });

  it('downloads model when missing and fetch succeeds', async () => {
    const dir = path.join(TMP, 'download-ok');

    const result = await ensureModelReady({
      modelDir: dir,
      _fetchOverride: async (url, destPath) => {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, 'downloaded-model-bytes');
      },
    });

    assert.equal(result.ready, true);
    assert.ok(fs.existsSync(path.join(dir, 'model_int8.onnx')));
  });

  it('returns not ready when no token and no fetch override', async () => {
    const dir = path.join(TMP, 'no-token');

    const result = await ensureModelReady({
      modelDir: dir,
      _tokenOverride: '',
    });

    assert.equal(result.ready, false);
    assert.ok(result.error);
    assert.ok(result.error.includes('manual') || result.error.includes('download') || result.error.includes('HF_TOKEN'));
  });

  it('cleans up partial download on fetch failure', async () => {
    const dir = path.join(TMP, 'fetch-fail');

    const result = await ensureModelReady({
      modelDir: dir,
      _fetchOverride: async (url, destPath) => {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        // Write partial data then throw
        fs.writeFileSync(destPath + '.tmp', 'partial-data');
        throw new Error('network error');
      },
    });

    assert.equal(result.ready, false);
    assert.ok(result.error);
    // No orphaned .tmp or .onnx files
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      assert.equal(files.filter(f => f.endsWith('.onnx') || f.endsWith('.tmp')).length, 0,
        'no orphaned model or temp files after failed download');
    }
  });

  it('creates modelDir recursively if missing', async () => {
    const dir = path.join(TMP, 'nested', 'deep', 'models');

    const result = await ensureModelReady({
      modelDir: dir,
      _fetchOverride: async (url, destPath) => {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, 'model-bytes');
      },
    });

    assert.equal(result.ready, true);
    assert.ok(fs.existsSync(dir));
  });
});

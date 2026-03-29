import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeCrawlCheckpoint } from '../writeCrawlCheckpoint.js';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-'));
}

const SAMPLE_CHECKPOINT = {
  schema_version: 1,
  checkpoint_type: 'crawl',
  created_at: '2026-03-29T00:00:00.000Z',
  run: { run_id: 'run-001', category: 'mouse', product_id: 'mouse-test', s3_key: '', duration_ms: 5000 },
  fetch_plan: { total_queued: 3, seed_count: 1, learning_seed_count: 0, approved_count: 2, blocked_count: 0 },
  counters: { urls_crawled: 2, urls_successful: 2, urls_blocked: 0, urls_failed: 0, urls_timeout_rescued: 0 },
  artifacts: { html_dir: 'html', screenshot_dir: 'screenshots', video_dir: 'video' },
  sources: [{ url: 'https://example.com', success: true, content_hash: 'abc123' }],
};

describe('writeCrawlCheckpoint', () => {
  test('writes run.json to {outRoot}/{runId}/', () => {
    const outRoot = makeTmpDir();
    const result = writeCrawlCheckpoint({
      checkpoint: SAMPLE_CHECKPOINT,
      outRoot,
      runId: 'run-001',
    });

    const expected = path.join(outRoot, 'run-001', 'run.json');
    assert.equal(result.checkpointPath, expected);
    assert.ok(fs.existsSync(expected));

    fs.rmSync(outRoot, { recursive: true });
  });

  test('creates directory recursively', () => {
    const base = makeTmpDir();
    const outRoot = path.join(base, 'deep', 'nested');
    writeCrawlCheckpoint({ checkpoint: SAMPLE_CHECKPOINT, outRoot, runId: 'run-002' });

    assert.ok(fs.existsSync(path.join(outRoot, 'run-002', 'run.json')));

    fs.rmSync(base, { recursive: true });
  });

  test('file content is pretty-printed JSON that parses back to checkpoint', () => {
    const outRoot = makeTmpDir();
    const { checkpointPath } = writeCrawlCheckpoint({
      checkpoint: SAMPLE_CHECKPOINT,
      outRoot,
      runId: 'run-003',
    });

    const raw = fs.readFileSync(checkpointPath, 'utf8');
    assert.ok(raw.includes('\n'), 'should be pretty-printed');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.schema_version, 1);
    assert.equal(parsed.checkpoint_type, 'crawl');
    assert.equal(parsed.run.run_id, 'run-001');
    assert.equal(parsed.sources.length, 1);

    fs.rmSync(outRoot, { recursive: true });
  });

  test('calls upsertRunArtifact with correct args when provided', () => {
    const outRoot = makeTmpDir();
    const calls = [];
    writeCrawlCheckpoint({
      checkpoint: SAMPLE_CHECKPOINT,
      outRoot,
      runId: 'run-004',
      category: 'mouse',
      upsertRunArtifact: (row) => calls.push(row),
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].run_id, 'run-004');
    assert.equal(calls[0].artifact_type, 'run_checkpoint');
    assert.equal(calls[0].category, 'mouse');
    assert.equal(typeof calls[0].payload, 'object');
    assert.equal(calls[0].payload.urls_crawled, 2);

    fs.rmSync(outRoot, { recursive: true });
  });

  test('SQL failure swallowed — file still written', () => {
    const outRoot = makeTmpDir();
    const { checkpointPath } = writeCrawlCheckpoint({
      checkpoint: SAMPLE_CHECKPOINT,
      outRoot,
      runId: 'run-005',
      category: 'mouse',
      upsertRunArtifact: () => { throw new Error('SQL boom'); },
    });

    assert.ok(fs.existsSync(checkpointPath), 'file should exist despite SQL error');

    fs.rmSync(outRoot, { recursive: true });
  });

  test('no throw when upsertRunArtifact is not provided', () => {
    const outRoot = makeTmpDir();
    assert.doesNotThrow(() => {
      writeCrawlCheckpoint({ checkpoint: SAMPLE_CHECKPOINT, outRoot, runId: 'run-006' });
    });

    fs.rmSync(outRoot, { recursive: true });
  });
});

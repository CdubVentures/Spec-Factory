import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeProductCheckpoint } from '../writeProductCheckpoint.js';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'product-cp-'));
}

function sampleProduct(overrides = {}) {
  return {
    schema_version: 1,
    checkpoint_type: 'product',
    product_id: 'mouse-test',
    category: 'mouse',
    identity: { brand: 'Test', model: 'Model', variant: '', sku: '', title: '' },
    latest_run_id: 'run-001',
    runs_completed: 1,
    sources: [
      { url: 'https://example.com', final_url: 'https://example.com', host: 'example.com', content_hash: 'aaa111', html_file: 'aaa111aaa111.html.gz', screenshot_count: 1, status: 200, first_seen_run_id: 'run-001', last_seen_run_id: 'run-001' },
    ],
    fields: {},
    provenance: {},
    updated_at: '2026-03-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('writeProductCheckpoint — first run', () => {
  test('creates product.json when none exists', () => {
    const outRoot = makeTmpDir();
    const result = writeProductCheckpoint({ productCheckpoint: sampleProduct(), productRoot: path.join(outRoot, 'products'), runId: 'run-001' });
    assert.ok(fs.existsSync(result.productPath));
    assert.equal(result.productPath, path.join(outRoot, 'products', 'mouse-test', 'product.json'));
    fs.rmSync(outRoot, { recursive: true });
  });

  test('runs_completed is 1 on first write', () => {
    const outRoot = makeTmpDir();
    writeProductCheckpoint({ productCheckpoint: sampleProduct(), productRoot: path.join(outRoot, 'products'), runId: 'run-001' });
    const written = JSON.parse(fs.readFileSync(path.join(outRoot, 'products', 'mouse-test', 'product.json'), 'utf8'));
    assert.equal(written.runs_completed, 1);
    fs.rmSync(outRoot, { recursive: true });
  });
});

describe('writeProductCheckpoint — merge on second run', () => {
  test('reads existing and merges sources, increments runs_completed', () => {
    const outRoot = makeTmpDir();
    writeProductCheckpoint({ productCheckpoint: sampleProduct(), productRoot: path.join(outRoot, 'products'), runId: 'run-001' });

    const secondRun = sampleProduct({
      latest_run_id: 'run-002',
      sources: [
        { url: 'https://new.com', final_url: 'https://new.com', host: 'new.com', content_hash: 'bbb222', html_file: 'bbb222bbb222.html.gz', screenshot_count: 2, status: 200, first_seen_run_id: 'run-002', last_seen_run_id: 'run-002' },
      ],
    });
    const result = writeProductCheckpoint({ productCheckpoint: secondRun, productRoot: path.join(outRoot, 'products'), runId: 'run-002' });

    const written = JSON.parse(fs.readFileSync(result.productPath, 'utf8'));
    assert.equal(written.runs_completed, 2);
    assert.equal(written.latest_run_id, 'run-002');
    assert.equal(written.sources.length, 2);

    fs.rmSync(outRoot, { recursive: true });
  });

  test('dedup: same content_hash updates last_seen, keeps first_seen', () => {
    const outRoot = makeTmpDir();
    writeProductCheckpoint({ productCheckpoint: sampleProduct(), productRoot: path.join(outRoot, 'products'), runId: 'run-001' });

    const secondRun = sampleProduct({
      latest_run_id: 'run-002',
      sources: [
        { url: 'https://example.com', final_url: 'https://example.com', host: 'example.com', content_hash: 'aaa111', html_file: 'aaa111aaa111.html.gz', screenshot_count: 1, status: 200, first_seen_run_id: 'run-002', last_seen_run_id: 'run-002' },
      ],
    });
    writeProductCheckpoint({ productCheckpoint: secondRun, productRoot: path.join(outRoot, 'products'), runId: 'run-002' });

    const written = JSON.parse(fs.readFileSync(path.join(outRoot, 'products', 'mouse-test', 'product.json'), 'utf8'));
    assert.equal(written.sources.length, 1);
    assert.equal(written.sources[0].first_seen_run_id, 'run-001');
    assert.equal(written.sources[0].last_seen_run_id, 'run-002');

    fs.rmSync(outRoot, { recursive: true });
  });
});

describe('writeProductCheckpoint — edge cases', () => {
  test('corrupt existing product.json treated as first run', () => {
    const outRoot = makeTmpDir();
    const corruptDir = path.join(outRoot, 'products', 'mouse-test');
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(path.join(corruptDir, 'product.json'), 'NOT JSON', 'utf8');

    const result = writeProductCheckpoint({ productCheckpoint: sampleProduct(), productRoot: path.join(outRoot, 'products'), runId: 'run-001' });
    const written = JSON.parse(fs.readFileSync(result.productPath, 'utf8'));
    assert.equal(written.runs_completed, 1);

    fs.rmSync(outRoot, { recursive: true });
  });

  test('returns merge stats', () => {
    const outRoot = makeTmpDir();
    const result = writeProductCheckpoint({ productCheckpoint: sampleProduct(), productRoot: path.join(outRoot, 'products'), runId: 'run-001' });
    assert.equal(typeof result.sourcesAdded, 'number');
    assert.equal(typeof result.sourcesUpdated, 'number');

    fs.rmSync(outRoot, { recursive: true });
  });

  test('file is pretty-printed JSON', () => {
    const outRoot = makeTmpDir();
    writeProductCheckpoint({ productCheckpoint: sampleProduct(), productRoot: path.join(outRoot, 'products'), runId: 'run-001' });
    const raw = fs.readFileSync(path.join(outRoot, 'products', 'mouse-test', 'product.json'), 'utf8');
    assert.ok(raw.includes('\n'));

    fs.rmSync(outRoot, { recursive: true });
  });
});

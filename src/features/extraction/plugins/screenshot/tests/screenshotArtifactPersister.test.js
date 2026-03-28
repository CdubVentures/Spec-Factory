import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { persistScreenshotArtifacts } from '../screenshotArtifactPersister.js';

// WHY: Tests for the screenshot artifact persister. Verifies filesystem writes,
// filename generation stability, error resilience, and edge cases.

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-persist-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('persistScreenshotArtifacts', () => {
  it('persists a single full-page screenshot and returns metadata', () => {
    const screenshots = [
      { kind: 'page', format: 'jpeg', bytes: Buffer.from('fake-jpeg-data'), width: 1280, height: 3000, captured_at: '2026-03-27T10:00:00Z' },
    ];

    const result = persistScreenshotArtifacts({
      screenshots,
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://rtings.com/mouse',
    });

    assert.equal(result.length, 1);
    assert.ok(result[0].filename.includes('fetch-1'));
    assert.ok(result[0].filename.endsWith('.jpg'));
    assert.ok(result[0].filename.includes('page'));
    assert.equal(result[0].width, 1280);
    assert.equal(result[0].height, 3000);
    assert.equal(result[0].bytes, Buffer.from('fake-jpeg-data').length);
    assert.equal(result[0].format, 'jpeg');
    assert.equal(result[0].kind, 'page');

    // File actually exists on disk
    const filePath = path.join(tmpDir, result[0].filename);
    assert.ok(fs.existsSync(filePath), `file should exist: ${filePath}`);
    assert.deepEqual(fs.readFileSync(filePath), Buffer.from('fake-jpeg-data'));
  });

  it('persists multiple screenshots (page + crops)', () => {
    const screenshots = [
      { kind: 'page', format: 'jpeg', bytes: Buffer.alloc(50000), width: 1280, height: 3000 },
      { kind: 'crop', format: 'jpeg', bytes: Buffer.alloc(8000), width: 400, height: 300, selector: '.hero' },
      { kind: 'crop', format: 'png', bytes: Buffer.alloc(12000), width: 600, height: 400, selector: 'table' },
    ];

    const result = persistScreenshotArtifacts({
      screenshots,
      screenshotDir: tmpDir,
      workerId: 'fetch-2',
      url: 'https://shi.com/product',
    });

    assert.equal(result.length, 3);
    assert.ok(result[0].filename.includes('page'));
    assert.ok(result[1].filename.includes('crop'));
    assert.ok(result[2].filename.endsWith('.png'));

    // All files exist
    for (const r of result) {
      assert.ok(fs.existsSync(path.join(tmpDir, r.filename)));
    }
  });

  it('returns empty array for empty screenshots', () => {
    const result = persistScreenshotArtifacts({
      screenshots: [],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });

    assert.deepEqual(result, []);
  });

  it('creates screenshotDir if it does not exist', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deep', 'screenshots');
    assert.ok(!fs.existsSync(nestedDir));

    persistScreenshotArtifacts({
      screenshots: [{ kind: 'page', format: 'jpeg', bytes: Buffer.alloc(100), width: 100, height: 100 }],
      screenshotDir: nestedDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });

    assert.ok(fs.existsSync(nestedDir));
  });

  it('skips screenshots with null or empty bytes', () => {
    const screenshots = [
      { kind: 'page', format: 'jpeg', bytes: null, width: 100, height: 100 },
      { kind: 'crop', format: 'jpeg', bytes: Buffer.alloc(0), width: 100, height: 100 },
      { kind: 'page', format: 'jpeg', bytes: Buffer.alloc(500), width: 100, height: 100 },
    ];

    const result = persistScreenshotArtifacts({
      screenshots,
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });

    assert.equal(result.length, 1, 'only the valid screenshot should be persisted');
  });

  it('produces stable filenames for the same inputs', () => {
    const args = {
      screenshots: [{ kind: 'page', format: 'jpeg', bytes: Buffer.alloc(100), width: 100, height: 100 }],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://rtings.com/mouse',
    };

    const result1 = persistScreenshotArtifacts(args);
    const result2 = persistScreenshotArtifacts(args);

    assert.equal(result1[0].filename, result2[0].filename);
  });

  it('produces different filenames for different URLs', () => {
    const base = { kind: 'page', format: 'jpeg', bytes: Buffer.alloc(100), width: 100, height: 100 };

    const r1 = persistScreenshotArtifacts({
      screenshots: [base],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });
    const r2 = persistScreenshotArtifacts({
      screenshots: [base],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://b.com',
    });

    assert.notEqual(r1[0].filename, r2[0].filename);
  });

  it('defaults format to jpeg when missing', () => {
    const screenshots = [
      { kind: 'page', bytes: Buffer.alloc(100), width: 100, height: 100 },
    ];

    const result = persistScreenshotArtifacts({
      screenshots,
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });

    assert.ok(result[0].filename.endsWith('.jpg'));
    assert.equal(result[0].format, 'jpeg');
  });
});

// --- Content-hash + SQL indexing (Step 1-2: evolved persister) ---

describe('persistScreenshotArtifacts — content_hash', () => {
  it('returns content_hash for each persisted screenshot', () => {
    const result = persistScreenshotArtifacts({
      screenshots: [{ kind: 'page', format: 'jpeg', bytes: Buffer.from('hash-test'), width: 100, height: 100 }],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });
    assert.equal(result.length, 1);
    assert.ok(result[0].content_hash, 'should have content_hash');
    assert.equal(typeof result[0].content_hash, 'string');
    assert.equal(result[0].content_hash.length, 64, 'SHA-256 hex is 64 chars');
  });

  it('produces deterministic content_hash for same bytes', () => {
    const bytes = Buffer.from('deterministic-test-data');
    const r1 = persistScreenshotArtifacts({
      screenshots: [{ kind: 'page', format: 'jpeg', bytes, width: 100, height: 100 }],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });
    const r2 = persistScreenshotArtifacts({
      screenshots: [{ kind: 'page', format: 'jpeg', bytes, width: 100, height: 100 }],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });
    assert.equal(r1[0].content_hash, r2[0].content_hash);
  });

  it('produces different content_hash for different bytes', () => {
    const r1 = persistScreenshotArtifacts({
      screenshots: [{ kind: 'page', format: 'jpeg', bytes: Buffer.from('data-A'), width: 100, height: 100 }],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });
    const r2 = persistScreenshotArtifacts({
      screenshots: [{ kind: 'page', format: 'jpeg', bytes: Buffer.from('data-B'), width: 100, height: 100 }],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });
    assert.notEqual(r1[0].content_hash, r2[0].content_hash);
  });
});

describe('persistScreenshotArtifacts — SQL indexing', () => {
  it('calls insertScreenshot with correct row when provided', () => {
    const calls = [];
    const insertScreenshot = (row) => calls.push(row);

    const result = persistScreenshotArtifacts({
      screenshots: [{ kind: 'page', format: 'jpeg', bytes: Buffer.from('sql-test'), width: 1920, height: 1080, captured_at: '2026-03-27T12:00:00Z' }],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://example.com/product',
      insertScreenshot,
      runContext: { category: 'mouse', productId: 'mouse-test', runId: 'run-001', host: 'example.com' },
    });

    assert.equal(calls.length, 1);
    const row = calls[0];
    assert.equal(row.category, 'mouse');
    assert.equal(row.product_id, 'mouse-test');
    assert.equal(row.run_id, 'run-001');
    assert.equal(row.source_url, 'https://example.com/product');
    assert.equal(row.host, 'example.com');
    assert.equal(row.selector, 'fullpage');
    assert.equal(row.format, 'jpg');
    assert.equal(row.width, 1920);
    assert.equal(row.height, 1080);
    assert.equal(row.size_bytes, Buffer.from('sql-test').length);
    assert.ok(row.screenshot_id, 'should have screenshot_id');
    assert.ok(row.content_hash, 'should have content_hash');
    assert.ok(row.file_path, 'should have file_path');
    assert.ok(row.captured_at, 'should have captured_at');
  });

  it('does not call insertScreenshot when not provided', () => {
    const result = persistScreenshotArtifacts({
      screenshots: [{ kind: 'page', format: 'jpeg', bytes: Buffer.from('no-sql'), width: 100, height: 100 }],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
    });
    assert.equal(result.length, 1);
    // No crash — insertScreenshot was undefined
  });

  it('does not call insertScreenshot when runContext is missing', () => {
    const calls = [];
    const result = persistScreenshotArtifacts({
      screenshots: [{ kind: 'page', format: 'jpeg', bytes: Buffer.from('no-ctx'), width: 100, height: 100 }],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
      insertScreenshot: (row) => calls.push(row),
      // runContext deliberately omitted
    });
    assert.equal(calls.length, 0, 'should not call insertScreenshot without runContext');
    assert.equal(result.length, 1);
  });

  it('catches insertScreenshot errors without stopping other screenshots', () => {
    let callCount = 0;
    const insertScreenshot = () => {
      callCount++;
      if (callCount === 1) throw new Error('SQL failure');
    };

    const result = persistScreenshotArtifacts({
      screenshots: [
        { kind: 'page', format: 'jpeg', bytes: Buffer.from('shot-1'), width: 100, height: 100 },
        { kind: 'crop', format: 'jpeg', bytes: Buffer.from('shot-2'), width: 200, height: 200 },
      ],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
      insertScreenshot,
      runContext: { category: 'mouse', productId: 'p1', runId: 'r1', host: 'a.com' },
    });

    assert.equal(result.length, 2, 'both screenshots should persist to disk');
    assert.equal(callCount, 2, 'insertScreenshot called for both');
  });

  it('maps selector from screenshot metadata or defaults to fullpage', () => {
    const calls = [];
    persistScreenshotArtifacts({
      screenshots: [
        { kind: 'page', format: 'jpeg', bytes: Buffer.from('a'), width: 100, height: 100 },
        { kind: 'crop', format: 'jpeg', bytes: Buffer.from('b'), width: 100, height: 100, selector: '.hero-image' },
      ],
      screenshotDir: tmpDir,
      workerId: 'fetch-1',
      url: 'https://a.com',
      insertScreenshot: (row) => calls.push(row),
      runContext: { category: 'mouse', productId: 'p1', runId: 'r1', host: 'a.com' },
    });

    assert.equal(calls[0].selector, 'fullpage');
    assert.equal(calls[1].selector, '.hero-image');
  });
});

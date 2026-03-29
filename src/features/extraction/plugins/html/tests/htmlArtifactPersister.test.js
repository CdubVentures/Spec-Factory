import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gunzipSync } from 'node:zlib';
import { persistHtmlArtifact } from '../htmlArtifactPersister.js';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'html-persist-'));
}

const SAMPLE_HTML = '<html><head><title>Test</title></head><body><p>Hello world</p></body></html>';

describe('persistHtmlArtifact', () => {
  test('writes gzipped HTML and returns metadata with content_hash, filename, size_bytes, file_path', () => {
    const htmlDir = makeTmpDir();
    const result = persistHtmlArtifact({
      html: SAMPLE_HTML,
      htmlDir,
      workerId: 'fetch-1',
      url: 'https://example.com/page',
      finalUrl: 'https://example.com/page',
      status: 200,
      title: 'Test',
    });

    assert.ok(result);
    assert.equal(typeof result.filename, 'string');
    assert.equal(typeof result.content_hash, 'string');
    assert.equal(result.content_hash.length, 64);
    assert.match(result.content_hash, /^[0-9a-f]{64}$/);
    assert.equal(typeof result.size_bytes, 'number');
    assert.ok(result.size_bytes > 0);
    assert.equal(typeof result.file_path, 'string');
    assert.ok(fs.existsSync(result.file_path));

    fs.rmSync(htmlDir, { recursive: true });
  });

  test('filename is content-addressed: {hash12}.html.gz', () => {
    const htmlDir = makeTmpDir();
    const result = persistHtmlArtifact({
      html: SAMPLE_HTML, htmlDir, workerId: 'fetch-1',
      url: 'https://example.com', finalUrl: 'https://example.com', status: 200, title: '',
    });

    assert.ok(result);
    assert.equal(result.filename, `${result.content_hash.slice(0, 12)}.html.gz`);

    fs.rmSync(htmlDir, { recursive: true });
  });

  test('creates htmlDir recursively if absent', () => {
    const base = makeTmpDir();
    const nested = path.join(base, 'deep', 'nested', 'dir');
    const result = persistHtmlArtifact({
      html: SAMPLE_HTML, htmlDir: nested, workerId: 'fetch-1',
      url: 'https://example.com', finalUrl: 'https://example.com', status: 200, title: '',
    });

    assert.ok(result);
    assert.ok(fs.existsSync(nested));
    assert.ok(fs.existsSync(result.file_path));

    fs.rmSync(base, { recursive: true });
  });

  test('returns null for empty HTML', () => {
    assert.equal(persistHtmlArtifact({
      html: '', htmlDir: makeTmpDir(), workerId: 'fetch-1',
      url: 'https://example.com', finalUrl: 'https://example.com', status: 200, title: '',
    }), null);
  });

  test('returns null for null HTML', () => {
    assert.equal(persistHtmlArtifact({
      html: null, htmlDir: makeTmpDir(), workerId: 'fetch-1',
      url: 'https://example.com', finalUrl: 'https://example.com', status: 200, title: '',
    }), null);
  });

  test('returns null for whitespace-only HTML', () => {
    assert.equal(persistHtmlArtifact({
      html: '   \n\t  ', htmlDir: makeTmpDir(), workerId: 'fetch-1',
      url: 'https://example.com', finalUrl: 'https://example.com', status: 200, title: '',
    }), null);
  });

  test('dedup: skips disk write if file already exists, returns same metadata', () => {
    const htmlDir = makeTmpDir();
    const first = persistHtmlArtifact({
      html: SAMPLE_HTML, htmlDir, workerId: 'fetch-1',
      url: 'https://example.com', finalUrl: 'https://example.com', status: 200, title: '',
    });
    const stat1 = fs.statSync(first.file_path);

    const second = persistHtmlArtifact({
      html: SAMPLE_HTML, htmlDir, workerId: 'fetch-2',
      url: 'https://other.com', finalUrl: 'https://other.com', status: 200, title: '',
    });
    const stat2 = fs.statSync(second.file_path);

    assert.equal(first.content_hash, second.content_hash);
    assert.equal(first.filename, second.filename);
    assert.equal(stat1.mtimeMs, stat2.mtimeMs, 'file should not be rewritten');

    fs.rmSync(htmlDir, { recursive: true });
  });

  test('file on disk decompresses to original HTML', () => {
    const htmlDir = makeTmpDir();
    const result = persistHtmlArtifact({
      html: SAMPLE_HTML, htmlDir, workerId: 'fetch-1',
      url: 'https://example.com', finalUrl: 'https://example.com', status: 200, title: '',
    });

    const compressed = fs.readFileSync(result.file_path);
    const decompressed = gunzipSync(compressed).toString('utf8');
    assert.equal(decompressed, SAMPLE_HTML);

    fs.rmSync(htmlDir, { recursive: true });
  });
});

describe('persistHtmlArtifact — SQL indexing', () => {
  test('calls insertCrawlSource with correct row shape when provided', () => {
    const htmlDir = makeTmpDir();
    const calls = [];
    const insertCrawlSource = (row) => calls.push(row);

    persistHtmlArtifact({
      html: SAMPLE_HTML, htmlDir, workerId: 'fetch-1',
      url: 'https://example.com/page', finalUrl: 'https://example.com/final',
      status: 200, title: 'Test Page',
      insertCrawlSource,
      runContext: { category: 'mouse', productId: 'mouse-test', runId: 'run-001', host: 'example.com' },
    });

    assert.equal(calls.length, 1);
    const row = calls[0];
    assert.equal(row.category, 'mouse');
    assert.equal(row.product_id, 'mouse-test');
    assert.equal(row.run_id, 'run-001');
    assert.equal(row.source_url, 'https://example.com/page');
    assert.equal(row.final_url, 'https://example.com/final');
    assert.equal(row.host, 'example.com');
    assert.equal(row.http_status, 200);
    assert.equal(typeof row.content_hash, 'string');
    assert.equal(row.content_hash.length, 64);
    assert.equal(typeof row.size_bytes, 'number');
    assert.ok(row.size_bytes > 0);
    assert.equal(typeof row.file_path, 'string');
    assert.equal(typeof row.crawled_at, 'string');

    fs.rmSync(htmlDir, { recursive: true });
  });

  test('does not call insertCrawlSource when callback is not provided', () => {
    const htmlDir = makeTmpDir();
    const result = persistHtmlArtifact({
      html: SAMPLE_HTML, htmlDir, workerId: 'fetch-1',
      url: 'https://example.com', finalUrl: 'https://example.com', status: 200, title: '',
      runContext: { category: 'mouse', productId: 'test', runId: 'r1', host: 'example.com' },
    });
    assert.ok(result);
    fs.rmSync(htmlDir, { recursive: true });
  });

  test('does not call insertCrawlSource when runContext is missing', () => {
    const htmlDir = makeTmpDir();
    const calls = [];
    const insertCrawlSource = (row) => calls.push(row);

    persistHtmlArtifact({
      html: SAMPLE_HTML, htmlDir, workerId: 'fetch-1',
      url: 'https://example.com', finalUrl: 'https://example.com', status: 200, title: '',
      insertCrawlSource,
    });

    assert.equal(calls.length, 0);
    fs.rmSync(htmlDir, { recursive: true });
  });

  test('catches insertCrawlSource errors without crashing', () => {
    const htmlDir = makeTmpDir();
    const insertCrawlSource = () => { throw new Error('SQL boom'); };

    const result = persistHtmlArtifact({
      html: SAMPLE_HTML, htmlDir, workerId: 'fetch-1',
      url: 'https://example.com', finalUrl: 'https://example.com', status: 200, title: '',
      insertCrawlSource,
      runContext: { category: 'mouse', productId: 'test', runId: 'r1', host: 'example.com' },
    });

    assert.ok(result, 'should still return metadata despite SQL error');
    assert.ok(fs.existsSync(result.file_path), 'file should still be written');

    fs.rmSync(htmlDir, { recursive: true });
  });
});

import { describe, it, before, after, beforeEach } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { persistCrawl4aiArtifact } from '../crawl4aiArtifactPersister.js';

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl4ai-persister-'));
});

after(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

beforeEach(() => {
  // Per-test clean slate inside tmpRoot.
  fs.rmSync(path.join(tmpRoot, 'current'), { recursive: true, force: true });
});

function dir() { return path.join(tmpRoot, 'current'); }

describe('persistCrawl4aiArtifact', () => {
  it('writes <hash12>.json under extractionsDir/crawl4ai/ with the documented shape', () => {
    const result = {
      ok: true,
      markdown: '# Hello',
      tables: [{ heading: 'Specs', rows: [{ key: 'Weight', value: '54g' }] }],
      lists: [{ heading: 'Pros', items: ['Light'] }],
      metrics: { duration_ms: 120, word_count: 10, table_count: 1 },
    };
    const out = persistCrawl4aiArtifact({
      result,
      extractionsDir: dir(),
      contentHash: 'abcdef123456789012345678',
      url: 'https://x/test',
      finalUrl: 'https://x/test?utm=1',
    });
    ok(out, 'returns metadata');
    strictEqual(out.filename, 'abcdef123456.json');
    ok(fs.existsSync(out.file_path), 'file exists');

    const parsed = JSON.parse(fs.readFileSync(out.file_path, 'utf8'));
    strictEqual(parsed.schema_version, 2); // v2 adds json_ld / microdata / opengraph
    strictEqual(parsed.plugin, 'crawl4ai');
    strictEqual(parsed.url, 'https://x/test');
    strictEqual(parsed.final_url, 'https://x/test?utm=1');
    strictEqual(parsed.content_hash, 'abcdef123456789012345678');
    strictEqual(parsed.markdown, '# Hello');
    deepStrictEqual(parsed.tables, [{ heading: 'Specs', rows: [{ key: 'Weight', value: '54g' }] }]);
    deepStrictEqual(parsed.lists, [{ heading: 'Pros', items: ['Light'] }]);
    deepStrictEqual(parsed.metrics, {
      duration_ms: 120, word_count: 10, table_count: 1,
      json_ld_count: 0, microdata_count: 0, has_product_jsonld: false,
    });
    ok(typeof parsed.captured_at === 'string' && parsed.captured_at.length > 0);
  });

  it('is idempotent — rewriting same content_hash overwrites same file', () => {
    const hash = 'deadbeefcafe0000000000000000000000000000000000000000000000000000';
    const call = (md) => persistCrawl4aiArtifact({
      result: { ok: true, markdown: md, tables: [], lists: [], metrics: { duration_ms: 0, word_count: 0, table_count: 0 } },
      extractionsDir: dir(),
      contentHash: hash,
      url: 'https://x',
      finalUrl: 'https://x',
    });
    const first = call('# v1');
    const second = call('# v2');
    strictEqual(first.filename, second.filename);
    strictEqual(first.file_path, second.file_path);
    const parsed = JSON.parse(fs.readFileSync(second.file_path, 'utf8'));
    strictEqual(parsed.markdown, '# v2');
  });

  it('derives table_count from tables.length when metrics.table_count is missing', () => {
    const out = persistCrawl4aiArtifact({
      result: {
        ok: true,
        markdown: 'x',
        tables: [{}, {}, {}],
        lists: [],
        metrics: { duration_ms: 50, word_count: 1 },
      },
      extractionsDir: dir(),
      contentHash: 'aa11bb22cc33dd44',
      url: 'https://x',
    });
    strictEqual(out.table_count, 3);
  });

  it('returns null when result.ok is false', () => {
    const out = persistCrawl4aiArtifact({
      result: { ok: false, error: 'boom' },
      extractionsDir: dir(),
      contentHash: 'abc123abc123',
      url: 'https://x',
    });
    strictEqual(out, null);
    ok(!fs.existsSync(path.join(dir(), 'crawl4ai')), 'no dir created on failure');
  });

  it('returns null when contentHash or extractionsDir is missing', () => {
    const good = { ok: true, markdown: 'x', tables: [], lists: [], metrics: {} };
    strictEqual(persistCrawl4aiArtifact({ result: good, extractionsDir: dir(), contentHash: '', url: 'x' }), null);
    strictEqual(persistCrawl4aiArtifact({ result: good, extractionsDir: '', contentHash: 'abc', url: 'x' }), null);
  });

  it('writes empty-tables/empty-lists file without error', () => {
    const out = persistCrawl4aiArtifact({
      result: { ok: true, markdown: '', tables: [], lists: [], metrics: { duration_ms: 1 } },
      extractionsDir: dir(),
      contentHash: 'ffeeddccbbaa9988',
      url: 'https://x',
    });
    ok(out, 'writes file');
    const parsed = JSON.parse(fs.readFileSync(out.file_path, 'utf8'));
    deepStrictEqual(parsed.tables, []);
    deepStrictEqual(parsed.lists, []);
    strictEqual(parsed.metrics.table_count, 0);
  });

  it('final_url falls back to url when finalUrl is omitted', () => {
    const out = persistCrawl4aiArtifact({
      result: { ok: true, markdown: 'y', tables: [], lists: [], metrics: {} },
      extractionsDir: dir(),
      contentHash: 'aaaaaaaaaaaa',
      url: 'https://example/fallback',
    });
    const parsed = JSON.parse(fs.readFileSync(out.file_path, 'utf8'));
    strictEqual(parsed.final_url, 'https://example/fallback');
  });
});

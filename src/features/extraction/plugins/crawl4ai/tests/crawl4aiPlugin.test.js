import { describe, it, before, after, beforeEach } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { crawl4aiPlugin } from '../crawl4aiPlugin.js';

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl4ai-plugin-'));
});

after(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

beforeEach(() => {
  fs.rmSync(path.join(tmpRoot, 'current'), { recursive: true, force: true });
});

function ctx(overrides = {}) {
  const extractionsDir = path.join(tmpRoot, 'current', 'extractions');
  return {
    html: '<html><body>hi</body></html>',
    url: 'https://example.com/a',
    finalUrl: 'https://example.com/a',
    settings: { crawl4aiEnabled: true, crawl4aiTableExtractEnabled: true },
    crawl4aiClient: overrides.client ?? makeFakeClient(),
    extractionsDir,
    logger: { info() {}, warn() {}, error() {} },
    ...overrides.ctx,
  };
}

function makeFakeClient(response) {
  const calls = [];
  return {
    _calls: calls,
    async extract(req) {
      calls.push(req);
      if (typeof response === 'function') return response(req);
      return response ?? {
        id: req.id || 'req-1',
        ok: true,
        markdown: '# T',
        tables: [{ heading: 'S', rows: [{ key: 'k', value: 'v' }] }],
        lists: [],
        metrics: { duration_ms: 50, word_count: 5, table_count: 1 },
      };
    },
  };
}

describe('crawl4aiPlugin contract', () => {
  it('has the required EXTRACTION_PLUGIN_REGISTRY shape', () => {
    strictEqual(crawl4aiPlugin.name, 'crawl4ai');
    strictEqual(crawl4aiPlugin.phase, 'transform');
    strictEqual(crawl4aiPlugin.concurrent, true);
    strictEqual(typeof crawl4aiPlugin.onExtract, 'function');
    strictEqual(typeof crawl4aiPlugin.summarize, 'function');
  });
});

describe('crawl4aiPlugin.onExtract', () => {
  it('returns skipped when crawl4aiEnabled is false', async () => {
    const result = await crawl4aiPlugin.onExtract(ctx({ ctx: { settings: { crawl4aiEnabled: false } } }));
    strictEqual(result.status, 'skipped');
    strictEqual(result.reason, 'disabled');
  });

  it('returns skipped when no client is injected', async () => {
    const c = ctx();
    delete c.crawl4aiClient;
    const result = await crawl4aiPlugin.onExtract(c);
    strictEqual(result.status, 'skipped');
    strictEqual(result.reason, 'no_client');
  });

  it('returns skipped when html is empty', async () => {
    const result = await crawl4aiPlugin.onExtract(ctx({ ctx: { html: '' } }));
    strictEqual(result.status, 'skipped');
    strictEqual(result.reason, 'no_html');
  });

  it('returns skipped when extractionsDir is missing', async () => {
    const result = await crawl4aiPlugin.onExtract(ctx({ ctx: { extractionsDir: '' } }));
    strictEqual(result.status, 'skipped');
    strictEqual(result.reason, 'no_extractions_dir');
  });

  it('happy path — writes artifact and returns ok with metrics', async () => {
    const c = ctx();
    const result = await crawl4aiPlugin.onExtract(c);
    strictEqual(result.status, 'ok');
    strictEqual(typeof result.path, 'string');
    strictEqual(typeof result.filename, 'string');
    ok(fs.existsSync(result.path), 'artifact file exists');
    strictEqual(result.metrics.table_count, 1);
    strictEqual(result.metrics.word_count, 5);
  });

  it('sends correct features when crawl4aiTableExtractEnabled is false', async () => {
    const fake = makeFakeClient();
    const c = ctx({ client: fake, ctx: { settings: { crawl4aiEnabled: true, crawl4aiTableExtractEnabled: false } } });
    await crawl4aiPlugin.onExtract(c);
    strictEqual(fake._calls.length, 1);
    deepStrictEqual(fake._calls[0].features, ['markdown', 'lists']);
  });

  it('sends tables in features by default', async () => {
    const fake = makeFakeClient();
    await crawl4aiPlugin.onExtract(ctx({ client: fake }));
    deepStrictEqual(fake._calls[0].features, ['markdown', 'lists', 'tables']);
  });

  it('returns failed with reason when client throws', async () => {
    const fake = {
      extract: async () => { throw new Error('sidecar_timeout'); },
    };
    const result = await crawl4aiPlugin.onExtract(ctx({ client: fake }));
    strictEqual(result.status, 'failed');
    strictEqual(result.reason, 'sidecar_timeout');
  });

  it('returns failed when client returns ok=false', async () => {
    const fake = makeFakeClient({ id: 'req-1', ok: false, error: 'python_crash' });
    const result = await crawl4aiPlugin.onExtract(ctx({ client: fake }));
    strictEqual(result.status, 'failed');
    strictEqual(result.reason, 'python_crash');
  });
});

describe('crawl4aiPlugin.summarize', () => {
  it('returns status + table_count + word_count + path', () => {
    const s = crawl4aiPlugin.summarize({
      status: 'ok',
      path: '/tmp/x.json',
      metrics: { table_count: 3, word_count: 100 },
    });
    deepStrictEqual(s, { status: 'ok', table_count: 3, word_count: 100, path: '/tmp/x.json' });
  });

  it('handles missing result fields gracefully', () => {
    const s = crawl4aiPlugin.summarize(undefined);
    deepStrictEqual(s, { status: 'unknown', table_count: 0, word_count: 0, path: null });
  });
});

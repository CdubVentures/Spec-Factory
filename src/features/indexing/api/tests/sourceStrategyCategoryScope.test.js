import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerSourceStrategyRoutes } from '../sourceStrategyRoutes.js';

function makeTempRoot() {
  const tmpDir = path.join('test', '_tmp_src_strat_scope_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function seedSourcesFile(root, category) {
  const dir = path.join(root, category);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify({
    category,
    version: '1.0.0',
    approved: { manufacturer: [], lab: ['rtings.com'], database: [], retailer: [] },
    denylist: [],
    sources: {
      rtings_com: {
        display_name: 'RTINGS',
        tier: 'tier2_lab',
        authority: 'instrumented',
        base_url: 'https://www.rtings.com',
        content_types: ['review'],
        doc_kinds: ['review'],
        crawl_config: { method: 'playwright', rate_limit_ms: 3000, timeout_ms: 20000, robots_txt_compliant: true },
        field_coverage: { high: ['weight'], medium: [], low: [] },
        discovery: { method: 'search_first', source_type: 'lab_review', search_pattern: '', priority: 90, enabled: true, notes: '' },
      },
    },
  }));
}

function makeCtx(root, overrides = {}) {
  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: { categoryAuthorityRoot: root },
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    broadcastWs: () => {},
    ...overrides,
  };
}

test('source strategy routes require category query param', async () => {
  const tmpDir = makeTempRoot();
  try {
    const handler = registerSourceStrategyRoutes(makeCtx(tmpDir, {
      readJsonBody: async () => ({ host: 'example.com' }),
    }));

    const getResult = await handler(['source-strategy'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(getResult.status, 400);
    assert.equal(getResult.body.error, 'category_required');

    const postResult = await handler(['source-strategy'], new URLSearchParams(), 'POST', {}, {});
    assert.equal(postResult.status, 400);
    assert.equal(postResult.body.error, 'category_required');

    const putResult = await handler(['source-strategy', 'rtings_com'], new URLSearchParams(), 'PUT', {}, {});
    assert.equal(putResult.status, 400);
    assert.equal(putResult.body.error, 'category_required');

    const deleteResult = await handler(['source-strategy', 'rtings_com'], new URLSearchParams(), 'DELETE', {}, {});
    assert.equal(deleteResult.status, 400);
    assert.equal(deleteResult.body.error, 'category_required');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('source strategy routes resolve and use explicit category', async () => {
  const tmpDir = makeTempRoot();
  try {
    seedSourcesFile(tmpDir, 'keyboard');
    const handler = registerSourceStrategyRoutes(makeCtx(tmpDir));

    const result = await handler(
      ['source-strategy'],
      new URLSearchParams('category=Keyboard'),
      'GET',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.body));
    assert.ok(result.body.length >= 1);
    assert.equal(result.body[0].sourceId, 'rtings_com');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

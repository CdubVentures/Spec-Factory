import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerSourceStrategyRoutes } from '../src/features/indexing/api/sourceStrategyRoutes.js';

function makeTempRoot() {
  const tmpDir = path.join('test', '_tmp_src_strat_dc_' + Date.now());
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
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: { categoryAuthorityRoot: root },
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    broadcastWs: () => {},
  };
  return { ...ctx, ...overrides };
}

test('source strategy POST emits typed data-change contract', async () => {
  const tmpDir = makeTempRoot();
  try {
    seedSourcesFile(tmpDir, 'mouse');
    const emitted = [];
    const handler = registerSourceStrategyRoutes(makeCtx(tmpDir, {
      readJsonBody: async () => ({ host: 'example.com' }),
      broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    }));

    const result = await handler(
      ['source-strategy'],
      new URLSearchParams('category=mouse'),
      'POST',
      {},
      {},
    );

    assert.equal(result.status, 201);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].channel, 'data-change');
    assert.equal(emitted[0].payload.type, 'data-change');
    assert.equal(emitted[0].payload.event, 'source-strategy-created');
    assert.equal(emitted[0].payload.category, 'mouse');
    assert.deepEqual(emitted[0].payload.domains, ['source-strategy']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('source strategy PUT emits typed data-change contract', async () => {
  const tmpDir = makeTempRoot();
  try {
    seedSourcesFile(tmpDir, 'keyboard');
    const emitted = [];
    const handler = registerSourceStrategyRoutes(makeCtx(tmpDir, {
      readJsonBody: async () => ({ display_name: 'Updated RTINGS' }),
      broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    }));

    const result = await handler(
      ['source-strategy', 'rtings_com'],
      new URLSearchParams('category=keyboard'),
      'PUT',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].channel, 'data-change');
    assert.equal(emitted[0].payload.type, 'data-change');
    assert.equal(emitted[0].payload.event, 'source-strategy-updated');
    assert.equal(emitted[0].payload.category, 'keyboard');
    assert.deepEqual(emitted[0].payload.domains, ['source-strategy']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('source strategy DELETE emits typed data-change contract', async () => {
  const tmpDir = makeTempRoot();
  try {
    seedSourcesFile(tmpDir, 'mouse');
    const emitted = [];
    const handler = registerSourceStrategyRoutes(makeCtx(tmpDir, {
      broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    }));

    const result = await handler(
      ['source-strategy', 'rtings_com'],
      new URLSearchParams('category=mouse'),
      'DELETE',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].channel, 'data-change');
    assert.equal(emitted[0].payload.type, 'data-change');
    assert.equal(emitted[0].payload.event, 'source-strategy-deleted');
    assert.equal(emitted[0].payload.category, 'mouse');
    assert.deepEqual(emitted[0].payload.domains, ['source-strategy']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

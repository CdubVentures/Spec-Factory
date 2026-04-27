import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpecDb } from '../../../../db/specDb.js';
import { registerSourceStrategyRoutes } from '../sourceStrategyRoutes.js';

function makeSource(displayName, host, priority = 50) {
  return {
    display_name: displayName,
    tier: 'tier2_lab',
    authority: 'instrumented',
    base_url: `https://${host}`,
    content_types: ['review'],
    doc_kinds: ['review'],
    crawl_config: {
      method: 'playwright',
      rate_limit_ms: 3000,
      timeout_ms: 20000,
      robots_txt_compliant: true,
    },
    field_coverage: { high: ['weight'], medium: [], low: [] },
    discovery: {
      method: 'search_first',
      source_type: 'lab_review',
      search_pattern: '',
      priority,
      enabled: true,
      notes: '',
    },
  };
}

function makeDoc(category, sourceId, source) {
  return {
    category,
    version: '1.0.0',
    approved: { lab: [], database: [], retailer: [] },
    denylist: [],
    sources: { [sourceId]: source },
  };
}

async function writeSourcesJson(root, category, data) {
  const dir = path.join(root, category);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'sources.json'), JSON.stringify(data, null, 2), 'utf8');
}

function makeCtx({ root, specDb, body = {}, emitted = [] }) {
  return {
    jsonRes: (_res, status, responseBody) => ({ status, body: responseBody }),
    readJsonBody: async () => body,
    config: { categoryAuthorityRoot: root },
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    getSpecDb: () => specDb,
  };
}

test('source strategy GET uses SQL runtime source before stale JSON', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'source-strategy-sql-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  t.after(() => specDb.close());
  specDb.replaceSourceStrategyDocument(makeDoc('mouse', 'sql_lab', makeSource('SQL Lab', 'sql-lab.example', 90)));
  await writeSourcesJson(root, 'mouse', makeDoc('mouse', 'json_lab', makeSource('JSON Lab', 'json-lab.example', 10)));

  const handler = registerSourceStrategyRoutes(makeCtx({ root, specDb }));
  const result = await handler(['source-strategy'], new URLSearchParams('category=mouse'), 'GET', {}, {});

  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].sourceId, 'sql_lab');
  assert.equal(result.body[0].display_name, 'SQL Lab');
});

test('source strategy GET rebuilds SQL from JSON when SQL is empty', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'source-strategy-rebuild-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  t.after(() => specDb.close());
  await writeSourcesJson(root, 'mouse', makeDoc('mouse', 'json_lab', makeSource('JSON Lab', 'json-lab.example', 80)));

  const handler = registerSourceStrategyRoutes(makeCtx({ root, specDb }));
  const result = await handler(['source-strategy'], new URLSearchParams('category=mouse'), 'GET', {}, {});

  assert.equal(result.status, 200);
  assert.equal(result.body[0].sourceId, 'json_lab');
  assert.equal(specDb.getSourceStrategyDocument()?.sources?.json_lab?.display_name, 'JSON Lab');
});

test('source strategy POST writes SQL and mirrors JSON', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'source-strategy-post-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  t.after(() => specDb.close());

  const handler = registerSourceStrategyRoutes(makeCtx({
    root,
    specDb,
    body: { host: 'sql-new.example', display_name: 'SQL New' },
  }));
  const result = await handler(['source-strategy'], new URLSearchParams('category=mouse'), 'POST', {}, {});

  assert.equal(result.status, 201);
  const sqlDoc = specDb.getSourceStrategyDocument();
  assert.equal(sqlDoc.sources.sqlnewexample.display_name, 'SQL New');
  const mirror = JSON.parse(await fs.readFile(path.join(root, 'mouse', 'sources.json'), 'utf8'));
  assert.equal(mirror.sources.sqlnewexample.display_name, 'SQL New');
});

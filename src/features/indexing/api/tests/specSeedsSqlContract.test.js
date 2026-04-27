import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpecDb } from '../../../../db/specDb.js';
import { registerSpecSeedsRoutes } from '../specSeedsRoutes.js';

async function writeSpecSeedsJson(root, category, seeds) {
  const dir = path.join(root, category);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec_seeds.json'), JSON.stringify(seeds, null, 2), 'utf8');
}

function makeCtx({ root, specDb, body = null, emitted = [] }) {
  return {
    jsonRes: (_res, status, responseBody) => ({ status, body: responseBody }),
    readJsonBody: async () => body,
    config: { categoryAuthorityRoot: root },
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    getSpecDb: () => specDb,
  };
}

test('spec seeds GET uses SQL runtime source before stale JSON', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-seeds-sql-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  t.after(() => specDb.close());
  specDb.replaceSpecSeedTemplates(['{product} sql specs']);
  await writeSpecSeedsJson(root, 'mouse', ['{product} json specs']);

  const handler = registerSpecSeedsRoutes(makeCtx({ root, specDb }));
  const result = await handler(['spec-seeds'], new URLSearchParams('category=mouse'), 'GET', {}, {});

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.seeds, ['{product} sql specs']);
});

test('spec seeds GET rebuilds SQL from JSON when SQL is empty', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-seeds-rebuild-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  t.after(() => specDb.close());
  await writeSpecSeedsJson(root, 'mouse', ['{product} json specs']);

  const handler = registerSpecSeedsRoutes(makeCtx({ root, specDb }));
  const result = await handler(['spec-seeds'], new URLSearchParams('category=mouse'), 'GET', {}, {});

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.seeds, ['{product} json specs']);
  assert.deepEqual(specDb.listSpecSeedTemplates(), ['{product} json specs']);
});

test('spec seeds PUT writes SQL and mirrors JSON', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-seeds-put-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  t.after(() => specDb.close());
  const seeds = ['{product} specifications', '{brand} {model} datasheet'];

  const handler = registerSpecSeedsRoutes(makeCtx({
    root,
    specDb,
    body: { seeds },
  }));
  const result = await handler(['spec-seeds'], new URLSearchParams('category=mouse'), 'PUT', {}, {});

  assert.equal(result.status, 200);
  assert.deepEqual(specDb.listSpecSeedTemplates(), seeds);
  const mirror = JSON.parse(await fs.readFile(path.join(root, 'mouse', 'spec_seeds.json'), 'utf8'));
  assert.deepEqual(mirror, seeds);
});

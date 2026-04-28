import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rebuildKeyFinderFromJson, writeKeyFinder } from '../keyStore.js';
import { SpecDb } from '../../../db/specDb.js';

function makeSpecDbStub() {
  const upserts = [];
  const insertRuns = [];
  return {
    category: 'mouse',
    getFinderStore: () => ({
      upsert: (row) => upserts.push(row),
      insertRun: (row) => insertRuns.push(row),
    }),
    _upserts: upserts,
    _insertRuns: insertRuns,
  };
}

test('rebuildKeyFinderFromJson strips legacy unk sentinels before SQL projection', (t) => {
  const root = path.join(os.tmpdir(), `kf-rebuild-${Date.now()}`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productId = 'mouse-legacy-unk';
  writeKeyFinder({
    productId,
    productRoot: root,
    data: {
      product_id: productId,
      category: 'mouse',
      selected: { keys: { sensor_model: { value: 'UNK', confidence: 0, unknown_reason: 'not disclosed' } } },
      last_ran_at: '2026-04-20T00:00:00Z',
      run_count: 1,
      runs: [{
        run_number: 1,
        ran_at: '2026-04-20T00:00:00Z',
        model: 'gpt-5.4',
        fallback_used: false,
        selected: { keys: { sensor_model: { value: 'UNK', confidence: 0, unknown_reason: 'not disclosed' } } },
        prompt: { system: 'sys', user: 'usr' },
        response: {
          primary_field_key: 'sensor_model',
          results: { sensor_model: { value: 'UNK', confidence: 0, unknown_reason: 'not disclosed' } },
        },
      }],
    },
  });

  const specDb = makeSpecDbStub();
  const stats = rebuildKeyFinderFromJson({ specDb, productRoot: root });

  assert.equal(stats.runs_seeded, 1);
  const run = specDb._insertRuns[0];
  assert.equal(run.selected.keys.sensor_model.value, null);
  assert.equal(run.response.results.sensor_model.value, null);
  assert.equal(run.response.results.sensor_model.unknown_reason, 'not disclosed');
});

test('rebuildKeyFinderFromJson is idempotent against existing SQL run projection', (t) => {
  const root = path.join(os.tmpdir(), `kf-rebuild-idempotent-${Date.now()}`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  t.after(() => specDb.close());
  const productId = 'mouse-reseed-existing';

  writeKeyFinder({
    productId,
    productRoot: root,
    data: {
      product_id: productId,
      category: 'mouse',
      selected: { keys: { polling_rate: { value: 8000, confidence: 92, unknown_reason: '' } } },
      last_ran_at: '2026-04-20T00:00:00Z',
      run_count: 1,
      runs: [{
        run_number: 1,
        ran_at: '2026-04-20T00:00:00Z',
        model: 'gpt-5.4',
        fallback_used: false,
        selected: { keys: { polling_rate: { value: 8000, confidence: 92, unknown_reason: '' } } },
        prompt: { system: 'sys', user: 'usr' },
        response: {
          primary_field_key: 'polling_rate',
          results: { polling_rate: { value: 8000, confidence: 92, unknown_reason: '' } },
          discovery_log: {
            urls_checked: ['https://example.test/polling'],
            queries_run: ['alienware pro polling rate'],
            notes: [],
          },
        },
      }],
    },
  });

  rebuildKeyFinderFromJson({ specDb, productRoot: root });
  rebuildKeyFinderFromJson({ specDb, productRoot: root });

  const runs = specDb.getFinderStore('keyFinder').listRuns(productId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].run_number, 1);
  assert.deepEqual(runs[0].response.discovery_log.urls_checked, ['https://example.test/polling']);
  assert.deepEqual(runs[0].response.discovery_log.queries_run, ['alienware pro polling rate']);
});

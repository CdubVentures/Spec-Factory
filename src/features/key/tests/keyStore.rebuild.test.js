import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rebuildKeyFinderFromJson, writeKeyFinder } from '../keyStore.js';

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

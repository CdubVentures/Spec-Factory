import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { stripVariantFromFieldProducerHistory } from '../variantCleanup.js';

const MODULE = {
  id: 'releaseDateFinder',
  filePrefix: 'release_date',
  moduleClass: 'variantFieldProducer',
};

function makeTempRoot() {
  const root = path.join(os.tmpdir(), `variant-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function writeFinderDoc({ root, productId, doc }) {
  const dir = path.join(root, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'release_date.json'), JSON.stringify(doc, null, 2), 'utf8');
}

function readFinderDoc(root, productId) {
  return JSON.parse(fs.readFileSync(path.join(root, productId, 'release_date.json'), 'utf8'));
}

function candidate(variantId, variantKey, value) {
  return {
    variant_id: variantId,
    variant_key: variantKey,
    value,
    confidence: 90,
  };
}

function run({ runNumber, candidates, response = {} }) {
  return {
    run_number: runNumber,
    ran_at: `2026-04-${String(runNumber).padStart(2, '0')}T00:00:00Z`,
    model: 'test',
    fallback_used: false,
    selected: { candidates },
    prompt: { user: `prompt-${runNumber}` },
    response: {
      candidates,
      ...response,
    },
  };
}

function makeSqlStore({ runs, summary, failRemove = false }) {
  const state = {
    runs: runs.map((row) => structuredClone(row)),
    summary: structuredClone(summary),
    removedRuns: [],
    updatedRuns: [],
    summaryUpdates: [],
  };

  return {
    get: (productId) => (state.summary?.product_id === productId ? structuredClone(state.summary) : null),
    listRuns: () => state.runs.map((row) => structuredClone(row)),
    removeRun: (productId, runNumber) => {
      if (failRemove) throw new Error('SQL remove failed');
      state.removedRuns.push({ productId, runNumber });
      state.runs = state.runs.filter((row) => row.run_number !== runNumber);
    },
    updateRunJson: (productId, runNumber, payload) => {
      state.updatedRuns.push({ productId, runNumber, payload: structuredClone(payload) });
      state.runs = state.runs.map((row) => (
        row.run_number === runNumber
          ? { ...row, selected: payload.selected, response: payload.response }
          : row
      ));
    },
    updateSummaryField: (productId, field, value) => {
      state.summaryUpdates.push({ productId, field, value });
      state.summary[field] = field === 'candidates' ? JSON.parse(value) : value;
    },
    updateBookkeeping: (productId, value) => {
      state.summary.latest_ran_at = value.latest_ran_at;
      state.summary.run_count = value.run_count;
    },
    _state: state,
  };
}

function makeSpecDb(sqlStore) {
  return {
    getFinderStore: () => sqlStore,
  };
}

describe('stripVariantFromFieldProducerHistory', () => {
  it('uses SQL run history before stale JSON and mirrors the SQL cleanup afterward', (t) => {
    const root = makeTempRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const productId = 'mouse-001';
    writeFinderDoc({
      root,
      productId,
      doc: {
        product_id: productId,
        category: 'mouse',
        selected: { candidates: [candidate('v_target', 'color:black', 'old-json')] },
        runs: [run({ runNumber: 1, candidates: [candidate('v_target', 'color:black', 'old-json')] })],
        run_count: 1,
        next_run_number: 2,
        last_ran_at: '2026-04-01T00:00:00Z',
      },
    });

    const keepCandidate = candidate('v_keep', 'color:white', '2026-07-01');
    const targetCandidate = candidate('v_target', 'color:black', '2026-06-15');
    const sqlStore = makeSqlStore({
      summary: {
        category: 'mouse',
        product_id: productId,
        candidates: [targetCandidate, keepCandidate],
        candidate_count: 2,
        cooldown_until: '2026-05-01T00:00:00Z',
        latest_ran_at: '2026-04-08T00:00:00Z',
        run_count: 2,
      },
      runs: [
        run({
          runNumber: 7,
          candidates: [targetCandidate],
          response: { variant_id: 'v_target', variant_key: 'color:black' },
        }),
        run({
          runNumber: 8,
          candidates: [targetCandidate, keepCandidate],
        }),
      ],
    });

    const result = stripVariantFromFieldProducerHistory({
      specDb: makeSpecDb(sqlStore),
      productId,
      variantId: 'v_target',
      module: MODULE,
      productRoot: root,
    });

    assert.deepEqual(result, { changed: true, runsTouched: 1, runsDeleted: 1 });
    assert.deepEqual(sqlStore._state.removedRuns.map((call) => call.runNumber), [7]);
    assert.deepEqual(sqlStore._state.updatedRuns.map((call) => call.runNumber), [8]);
    assert.equal(sqlStore._state.summary.candidate_count, 1);
    assert.equal(sqlStore._state.summary.candidates[0].variant_id, 'v_keep');
    assert.equal(sqlStore._state.summary.run_count, 1);
    assert.equal(sqlStore._state.summary.latest_ran_at, '2026-04-08T00:00:00Z');
    assert.equal(sqlStore._state.summary.cooldown_until, '2026-05-01T00:00:00Z');

    const mirrored = readFinderDoc(root, productId);
    assert.deepEqual(mirrored.runs.map((row) => row.run_number), [8]);
    assert.equal(mirrored.runs[0].selected.candidates.length, 1);
    assert.equal(mirrored.runs[0].selected.candidates[0].variant_id, 'v_keep');
    assert.equal(mirrored.selected.candidates.length, 1);
    assert.equal(mirrored.selected.candidates[0].variant_id, 'v_keep');
    assert.equal(mirrored.run_count, 1);
    assert.equal(mirrored.next_run_number, 9);
  });

  it('does not mutate the JSON mirror when SQL cleanup fails', (t) => {
    const root = makeTempRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const productId = 'mouse-001';
    const original = {
      product_id: productId,
      category: 'mouse',
      selected: { candidates: [candidate('v_target', 'color:black', '2026-06-15')] },
      runs: [
        run({
          runNumber: 7,
          candidates: [candidate('v_target', 'color:black', '2026-06-15')],
          response: { variant_id: 'v_target', variant_key: 'color:black' },
        }),
      ],
      run_count: 1,
      next_run_number: 8,
      last_ran_at: '2026-04-07T00:00:00Z',
    };
    writeFinderDoc({ root, productId, doc: original });

    const sqlStore = makeSqlStore({
      summary: {
        category: 'mouse',
        product_id: productId,
        candidates: original.selected.candidates,
        candidate_count: 1,
        latest_ran_at: '2026-04-07T00:00:00Z',
        run_count: 1,
      },
      runs: original.runs,
      failRemove: true,
    });

    assert.throws(
      () => stripVariantFromFieldProducerHistory({
        specDb: makeSpecDb(sqlStore),
        productId,
        variantId: 'v_target',
        module: MODULE,
        productRoot: root,
      }),
      /SQL remove failed/,
    );

    assert.deepEqual(readFinderDoc(root, productId), original);
  });

  it('refreshes a stale JSON mirror even when SQL already has no deleted variant', (t) => {
    const root = makeTempRoot();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const productId = 'mouse-001';
    writeFinderDoc({
      root,
      productId,
      doc: {
        product_id: productId,
        category: 'mouse',
        selected: { candidates: [candidate('v_target', 'color:black', 'old-json')] },
        runs: [run({ runNumber: 1, candidates: [candidate('v_target', 'color:black', 'old-json')] })],
        run_count: 1,
        next_run_number: 2,
        last_ran_at: '2026-04-01T00:00:00Z',
      },
    });

    const keepCandidate = candidate('v_keep', 'color:white', '2026-07-01');
    const sqlStore = makeSqlStore({
      summary: {
        category: 'mouse',
        product_id: productId,
        candidates: [keepCandidate],
        candidate_count: 1,
        latest_ran_at: '2026-04-02T00:00:00Z',
        run_count: 1,
      },
      runs: [run({ runNumber: 2, candidates: [keepCandidate] })],
    });

    const result = stripVariantFromFieldProducerHistory({
      specDb: makeSpecDb(sqlStore),
      productId,
      variantId: 'v_target',
      module: MODULE,
      productRoot: root,
    });

    assert.deepEqual(result, { changed: true, runsTouched: 0, runsDeleted: 0 });
    assert.deepEqual(sqlStore._state.removedRuns, []);
    assert.deepEqual(sqlStore._state.updatedRuns, []);

    const mirrored = readFinderDoc(root, productId);
    assert.deepEqual(mirrored.runs.map((row) => row.run_number), [2]);
    assert.equal(mirrored.selected.candidates.length, 1);
    assert.equal(mirrored.selected.candidates[0].variant_id, 'v_keep');
    assert.equal(mirrored.run_count, 1);
    assert.equal(mirrored.next_run_number, 3);
  });
});

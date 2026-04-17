/**
 * PIF Rebuild Contract — tests for rebuildProductImageFinderFromJson.
 *
 * Verifies the "deleted-DB rebuild" contract: if the SQLite file is
 * deleted, the rebuild function re-seeds the product_image_finder
 * table from the per-product JSON files.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { rebuildProductImageFinderFromJson } from '../productImageStore.js';
import { writeProductImages } from '../productImageStore.js';

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pif-rebuild-'));
}

function makeImage(view, variantKey, filename, evalFields = {}) {
  return {
    view,
    filename,
    url: `https://example.com/${filename}`,
    variant_id: 'v_abc12345',
    variant_key: variantKey,
    variant_label: variantKey.split(':')[1] || variantKey,
    variant_type: 'color',
    quality_pass: true,
    ...evalFields,
  };
}

function seedDoc(productRoot, productId, doc) {
  writeProductImages({ productId, productRoot, data: doc });
}

function makeFakeFinderStore() {
  const upserted = [];
  const runs = [];
  return {
    upserted,
    runs,
    upsert(row) { upserted.push(row); },
    insertRun(row) { runs.push(row); },
  };
}

function makeFakeSpecDb(category) {
  const stores = {};
  return {
    category,
    getFinderStore(moduleId) {
      if (!stores[moduleId]) stores[moduleId] = makeFakeFinderStore();
      return stores[moduleId];
    },
    _stores: stores,
  };
}

describe('rebuildProductImageFinderFromJson', () => {
  it('returns zero stats for empty product root', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb('mouse');

    const stats = rebuildProductImageFinderFromJson({ specDb, productRoot: root });

    assert.strictEqual(stats.found, 0);
    assert.strictEqual(stats.seeded, 0);
    assert.strictEqual(stats.skipped, 0);
    assert.strictEqual(stats.runs_seeded, 0);
  });

  it('returns zero stats for nonexistent product root', () => {
    const specDb = makeFakeSpecDb('mouse');
    const stats = rebuildProductImageFinderFromJson({
      specDb,
      productRoot: path.join(os.tmpdir(), 'nonexistent-pif-rebuild-' + Date.now()),
    });

    assert.strictEqual(stats.found, 0);
    assert.strictEqual(stats.seeded, 0);
  });

  it('seeds summary row from product JSON', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb('mouse');
    const productId = 'prod_test1';

    seedDoc(root, productId, {
      product_id: productId,
      category: 'mouse',
      cooldown_until: '2025-06-01',
      last_ran_at: '2025-05-15',
      run_count: 2,
      carousel_slots: { 'color:black': { top: 'top-black.png' } },
      selected: {
        images: [
          makeImage('top', 'color:black', 'top-black.png'),
          makeImage('bottom', 'color:black', 'bottom-black.png'),
        ],
      },
      runs: [],
    });

    const stats = rebuildProductImageFinderFromJson({ specDb, productRoot: root });

    assert.strictEqual(stats.found, 1);
    assert.strictEqual(stats.seeded, 1);
    assert.strictEqual(stats.skipped, 0);

    const store = specDb._stores.productImageFinder;
    assert.strictEqual(store.upserted.length, 1);

    const row = store.upserted[0];
    assert.strictEqual(row.product_id, productId);
    assert.strictEqual(row.category, 'mouse');
    assert.strictEqual(row.image_count, 2);
    assert.strictEqual(row.cooldown_until, '2025-06-01');
    assert.strictEqual(row.latest_ran_at, '2025-05-15');
    assert.strictEqual(row.run_count, 2);

    // carousel_slots projected as JSON string
    const slots = JSON.parse(row.carousel_slots);
    assert.deepStrictEqual(slots, { 'color:black': { top: 'top-black.png' } });
  });

  it('seeds eval_state from selected images with eval fields', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb('mouse');
    const productId = 'prod_eval_test';

    seedDoc(root, productId, {
      product_id: productId,
      category: 'mouse',
      selected: {
        images: [
          makeImage('top', 'color:black', 'top-black.png', {
            eval_best: true,
            eval_flags: [],
            eval_reasoning: 'Winner',
            eval_source: 'https://example.com/top-black.png',
          }),
          makeImage('hero', 'color:black', 'hero-black.png', {
            hero: true,
            hero_rank: 1,
          }),
          makeImage('bottom', 'color:black', 'bottom-black.png'),
        ],
      },
      runs: [],
    });

    rebuildProductImageFinderFromJson({ specDb, productRoot: root });

    const row = specDb._stores.productImageFinder.upserted[0];
    const evalState = JSON.parse(row.eval_state);

    assert.deepStrictEqual(evalState['top-black.png'], {
      eval_best: true,
      eval_flags: [],
      eval_reasoning: 'Winner',
      eval_source: 'https://example.com/top-black.png',
    });
    assert.deepStrictEqual(evalState['hero-black.png'], {
      hero: true,
      hero_rank: 1,
    });
    assert.strictEqual(evalState['bottom-black.png'], undefined, 'no eval fields → not in eval_state');
  });

  it('seeds evaluations array from JSON into SQL column', () => {
    // WHY: CLAUDE.md Dual-State mandate — evaluations must be projected to SQL
    // so the runtime GET handler reads from SQL, not JSON. Rebuild is the
    // "deleted-DB → rehydrate from JSON" contract.
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb('mouse');
    const productId = 'prod_evaluations_rebuild';

    seedDoc(root, productId, {
      product_id: productId,
      category: 'mouse',
      selected: { images: [] },
      evaluations: [
        { variant_key: 'color:black', variant_id: 'v_aa', type: 'view', view: 'top', model: 'gpt-5.4', reasoning: 'crisp angle' },
        { variant_key: 'color:black', variant_id: 'v_aa', type: 'hero', model: 'gpt-5.4', reasoning: 'best hero' },
      ],
      runs: [],
    });

    rebuildProductImageFinderFromJson({ specDb, productRoot: root });

    const row = specDb._stores.productImageFinder.upserted[0];
    assert.ok(row.evaluations, 'evaluations column seeded');
    const evaluations = typeof row.evaluations === 'string' ? JSON.parse(row.evaluations) : row.evaluations;
    assert.equal(evaluations.length, 2);
    assert.equal(evaluations[0].variant_key, 'color:black');
    assert.equal(evaluations[0].type, 'view');
    assert.equal(evaluations[1].type, 'hero');
  });

  it('seeds empty evaluations array when JSON has none', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb('mouse');
    const productId = 'prod_empty_evaluations';

    seedDoc(root, productId, {
      product_id: productId,
      category: 'mouse',
      selected: { images: [] },
      runs: [],
      // no evaluations key
    });

    rebuildProductImageFinderFromJson({ specDb, productRoot: root });

    const row = specDb._stores.productImageFinder.upserted[0];
    const evaluations = typeof row.evaluations === 'string' ? JSON.parse(row.evaluations) : row.evaluations;
    assert.deepEqual(evaluations, []);
  });

  it('seeds run history', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb('mouse');
    const productId = 'prod_runs';

    seedDoc(root, productId, {
      product_id: productId,
      category: 'mouse',
      selected: { images: [makeImage('top', 'color:black', 'top-black.png')] },
      runs: [
        {
          run_number: 1,
          ran_at: '2025-05-10',
          model: 'gpt-4o',
          fallback_used: false,
          cooldown_until: '',
          selected: { images: [makeImage('top', 'color:black', 'top-black.png')] },
          prompt: { system: 'test', user: 'test' },
          response: { images: [] },
        },
        {
          run_number: 2,
          ran_at: '2025-05-15',
          model: 'claude-sonnet',
          fallback_used: true,
          cooldown_until: '2025-06-15',
          selected: { images: [] },
          prompt: {},
          response: {},
        },
      ],
    });

    const stats = rebuildProductImageFinderFromJson({ specDb, productRoot: root });

    assert.strictEqual(stats.runs_seeded, 2);

    const store = specDb._stores.productImageFinder;
    assert.strictEqual(store.runs.length, 2);
    assert.strictEqual(store.runs[0].run_number, 1);
    assert.strictEqual(store.runs[0].model, 'gpt-4o');
    assert.strictEqual(store.runs[1].run_number, 2);
    assert.strictEqual(store.runs[1].fallback_used, true);
  });

  it('skips products with wrong category', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb('mouse');
    const productId = 'prod_keyboard';

    seedDoc(root, productId, {
      product_id: productId,
      category: 'keyboard',
      selected: { images: [makeImage('top', 'color:black', 'top-black.png')] },
      runs: [],
    });

    const stats = rebuildProductImageFinderFromJson({ specDb, productRoot: root });

    assert.strictEqual(stats.found, 1);
    assert.strictEqual(stats.skipped, 1);
    assert.strictEqual(stats.seeded, 0);
    assert.strictEqual(specDb._stores.productImageFinder, undefined);
  });

  it('skips directories with no JSON file', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb('mouse');

    // Create empty product dir (no JSON)
    fs.mkdirSync(path.join(root, 'prod_empty'), { recursive: true });

    const stats = rebuildProductImageFinderFromJson({ specDb, productRoot: root });

    assert.strictEqual(stats.found, 1);
    assert.strictEqual(stats.skipped, 1);
    assert.strictEqual(stats.seeded, 0);
  });
});

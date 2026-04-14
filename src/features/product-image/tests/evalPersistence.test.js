/**
 * Eval Persistence — dual-write contract tests.
 *
 * Verifies that evaluations and carousel_slots survive all JSON
 * recalculation paths: deleteRun, deleteRuns, merge (new run),
 * and direct recalculateFromRuns calls.
 *
 * These are the fields that live alongside `runs` on the doc but
 * are NOT derived from runs — they must be carried forward.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  mergeProductImageDiscovery,
  readProductImages,
  writeProductImages,
  deleteProductImageFinderRun,
  deleteProductImageFinderRuns,
  recalculateProductImagesFromRuns,
} from '../productImageStore.js';

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eval-persist-'));
}

function makeImage(view, variantKey, filename) {
  return {
    view,
    filename,
    url: `https://example.com/${filename}`,
    variant_id: 'v_abc12345',
    variant_key: variantKey,
    variant_label: variantKey.split(':')[1] || variantKey,
    variant_type: 'color',
    quality_pass: true,
  };
}

function mergeRun(productRoot, productId, images) {
  return mergeProductImageDiscovery({
    productId,
    productRoot,
    newDiscovery: { category: 'mouse', cooldown_until: '', last_ran_at: new Date().toISOString() },
    run: {
      model: 'test',
      fallback_used: false,
      selected: { images },
      prompt: { system: '', user: '' },
      response: { images },
    },
  });
}

function seedDocWithEvals(productRoot, productId) {
  // Create a doc with 2 runs + evaluations + carousel_slots
  mergeRun(productRoot, productId, [makeImage('top', 'color:black', 'top-black.png')]);
  mergeRun(productRoot, productId, [makeImage('left', 'color:black', 'left-black.png')]);

  // Manually add evaluations + carousel_slots (as imageEvaluator.js would)
  const doc = readProductImages({ productId, productRoot });
  doc.evaluations = [
    { eval_number: 1, type: 'view', view: 'top', variant_key: 'color:black', model: 'gpt-4o', ran_at: '2025-01-01T00:00:00Z', duration_ms: 100, prompt: {}, response: {}, result: { rankings: [] } },
    { eval_number: 2, type: 'hero', view: null, variant_key: 'color:black', model: 'gpt-4o', ran_at: '2025-01-01T01:00:00Z', duration_ms: 200, prompt: {}, response: {}, result: { heroes: [] } },
  ];
  doc.carousel_slots = {
    'color:black': { top: 'top-black.png', hero_1: null },
  };
  // Also add eval fields to selected images (as mergeEvaluation would)
  if (doc.selected?.images?.[0]) {
    doc.selected.images[0].eval_best = true;
    doc.selected.images[0].eval_reasoning = 'best top';
  }
  writeProductImages({ productId, productRoot, data: doc });
  return doc;
}

/* ── deleteRun preserves evaluations + carousel_slots ────────────── */

describe('deleteRun — preserves evaluations and carousel_slots', () => {
  it('evaluations array survives single run deletion', () => {
    const root = makeTmpRoot();
    const pid = 'del-run-evals';
    seedDocWithEvals(root, pid);

    deleteProductImageFinderRun({ productId: pid, productRoot: root, runNumber: 1 });
    const doc = readProductImages({ productId: pid, productRoot: root });

    assert.ok(Array.isArray(doc.evaluations), 'evaluations must exist');
    assert.equal(doc.evaluations.length, 2, 'both eval records preserved');
    assert.equal(doc.evaluations[0].eval_number, 1);
    assert.equal(doc.evaluations[1].type, 'hero');
  });

  it('carousel_slots survive single run deletion', () => {
    const root = makeTmpRoot();
    const pid = 'del-run-slots';
    seedDocWithEvals(root, pid);

    deleteProductImageFinderRun({ productId: pid, productRoot: root, runNumber: 1 });
    const doc = readProductImages({ productId: pid, productRoot: root });

    assert.ok(doc.carousel_slots, 'carousel_slots must exist');
    assert.equal(doc.carousel_slots['color:black']?.top, 'top-black.png');
  });
});

/* ── deleteRuns preserves evaluations + carousel_slots ───────────── */

describe('deleteRuns — preserves evaluations and carousel_slots', () => {
  it('evaluations survive batch run deletion', () => {
    const root = makeTmpRoot();
    const pid = 'del-batch-evals';
    seedDocWithEvals(root, pid);

    deleteProductImageFinderRuns({ productId: pid, productRoot: root, runNumbers: [1] });
    const doc = readProductImages({ productId: pid, productRoot: root });

    assert.ok(Array.isArray(doc.evaluations), 'evaluations must exist');
    assert.equal(doc.evaluations.length, 2);
  });

  it('carousel_slots survive batch run deletion', () => {
    const root = makeTmpRoot();
    const pid = 'del-batch-slots';
    seedDocWithEvals(root, pid);

    deleteProductImageFinderRuns({ productId: pid, productRoot: root, runNumbers: [1] });
    const doc = readProductImages({ productId: pid, productRoot: root });

    assert.ok(doc.carousel_slots, 'carousel_slots must exist');
    assert.equal(doc.carousel_slots['color:black']?.top, 'top-black.png');
  });
});

/* ── merge (new run) preserves evaluations + carousel_slots ──────── */

describe('merge — preserves evaluations and carousel_slots on new run', () => {
  it('evaluations survive when a new run is merged', () => {
    const root = makeTmpRoot();
    const pid = 'merge-evals';
    seedDocWithEvals(root, pid);

    mergeRun(root, pid, [makeImage('angle', 'color:black', 'angle-black.png')]);
    const doc = readProductImages({ productId: pid, productRoot: root });

    assert.ok(Array.isArray(doc.evaluations), 'evaluations must exist after merge');
    assert.equal(doc.evaluations.length, 2);
    assert.equal(doc.evaluations[0].eval_number, 1);
  });

  it('carousel_slots survive when a new run is merged', () => {
    const root = makeTmpRoot();
    const pid = 'merge-slots';
    seedDocWithEvals(root, pid);

    mergeRun(root, pid, [makeImage('angle', 'color:black', 'angle-black.png')]);
    const doc = readProductImages({ productId: pid, productRoot: root });

    assert.ok(doc.carousel_slots, 'carousel_slots must exist after merge');
    assert.equal(doc.carousel_slots['color:black']?.top, 'top-black.png');
  });
});

/* ── recalculateFromRuns preserves extra fields when given existing doc ─ */

describe('recalculateFromRuns — preserves extra fields', () => {
  it('evaluations survive recalculation', () => {
    const root = makeTmpRoot();
    const pid = 'recalc-evals';
    const original = seedDocWithEvals(root, pid);

    const recalculated = recalculateProductImagesFromRuns(original.runs, pid, 'mouse', original);
    assert.ok(Array.isArray(recalculated.evaluations), 'evaluations must exist');
    assert.equal(recalculated.evaluations.length, 2);
  });

  it('carousel_slots survive recalculation', () => {
    const root = makeTmpRoot();
    const pid = 'recalc-slots';
    const original = seedDocWithEvals(root, pid);

    const recalculated = recalculateProductImagesFromRuns(original.runs, pid, 'mouse', original);
    assert.ok(recalculated.carousel_slots, 'carousel_slots must exist');
    assert.equal(recalculated.carousel_slots['color:black']?.top, 'top-black.png');
  });

  it('works without existing doc (backward compat)', () => {
    const root = makeTmpRoot();
    const pid = 'recalc-no-doc';
    mergeRun(root, pid, [makeImage('top', 'color:black', 'top-black.png')]);
    const doc = readProductImages({ productId: pid, productRoot: root });

    // Call without existingDoc — should not crash, evaluations just absent
    const recalculated = recalculateProductImagesFromRuns(doc.runs, pid, 'mouse');
    assert.ok(!recalculated.evaluations || recalculated.evaluations.length === 0);
  });
});

/* ── eval fields on selected.images survive recalculation ────────── */

describe('eval fields on images — survive recalculation', () => {
  it('eval_best on selected.images survives deleteRun', () => {
    const root = makeTmpRoot();
    const pid = 'eval-fields-del';
    seedDocWithEvals(root, pid);

    deleteProductImageFinderRun({ productId: pid, productRoot: root, runNumber: 2 });
    const doc = readProductImages({ productId: pid, productRoot: root });

    const topImg = doc.selected?.images?.find(i => i.view === 'top');
    assert.ok(topImg, 'top image must exist');
    assert.equal(topImg.eval_best, true, 'eval_best preserved after run deletion');
    assert.equal(topImg.eval_reasoning, 'best top', 'eval_reasoning preserved');
  });
});

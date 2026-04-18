/**
 * releaseDateStore — latest-wins-per-variant accumulation tests.
 *
 * recalculateSelected must keep exactly one candidate per variant_id
 * (or variant_key when no id), using the newest non-rejected run.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  mergeReleaseDateDiscovery,
  readReleaseDates,
  recalculateReleaseDatesFromRuns,
  deleteReleaseDateFinderRun,
  deleteReleaseDateFinderAll,
} from '../releaseDateStore.js';

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rdf-store-'));
}

function makeCandidate({ variantId, variantKey, value, confidence = 85, sources = [], ranAt }) {
  return {
    variant_id: variantId,
    variant_key: variantKey,
    variant_label: variantKey.split(':')[1] || variantKey,
    variant_type: variantKey.startsWith('edition:') ? 'edition' : 'color',
    value,
    confidence,
    unknown_reason: '',
    sources,
    ran_at: ranAt || new Date().toISOString(),
  };
}

function mergeRun(productRoot, productId, candidates, { runStatus } = {}) {
  return mergeReleaseDateDiscovery({
    productId,
    productRoot,
    newDiscovery: { category: 'mouse', last_ran_at: new Date().toISOString() },
    run: {
      model: 'test',
      fallback_used: false,
      selected: { candidates },
      prompt: { system: '', user: '' },
      response: { candidates },
      ...(runStatus ? { status: runStatus } : {}),
    },
  });
}

describe('releaseDateStore: latest-wins-per-variant accumulation', () => {
  it('single run persists one candidate', () => {
    const root = makeTmpRoot();
    const after = mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    assert.equal(after.selected.candidates.length, 1);
    assert.equal(after.selected.candidates[0].value, '2024-03-15');
  });

  it('second run on same variant replaces first (latest wins)', () => {
    const root = makeTmpRoot();
    mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15', confidence: 70 }),
    ]);
    const after = mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-20', confidence: 95 }),
    ]);

    const blacks = after.selected.candidates.filter(c => c.variant_key === 'color:black');
    assert.equal(blacks.length, 1);
    assert.equal(blacks[0].value, '2024-03-20');
    assert.equal(blacks[0].confidence, 95);
  });

  it('different variants independently preserved', () => {
    const root = makeTmpRoot();
    mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
      makeCandidate({ variantId: 'v_white', variantKey: 'color:white', value: '2024-06-01' }),
    ]);
    const after = mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-20' }),
    ]);

    assert.equal(after.selected.candidates.length, 2);
    const byKey = Object.fromEntries(after.selected.candidates.map(c => [c.variant_key, c]));
    assert.equal(byKey['color:black'].value, '2024-03-20');
    assert.equal(byKey['color:white'].value, '2024-06-01');
  });

  it('rejected runs excluded from accumulation', () => {
    const root = makeTmpRoot();
    mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2099-01-01' }),
    ], { runStatus: 'rejected' });

    const doc = readReleaseDates({ productId: 'p1', productRoot: root });
    assert.equal(doc.selected.candidates.length, 1);
    assert.equal(doc.selected.candidates[0].value, '2024-03-15');
  });

  it('falls back to variant_key when variant_id is missing', () => {
    const root = makeTmpRoot();
    mergeRun(root, 'p1', [
      makeCandidate({ variantId: null, variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    const after = mergeRun(root, 'p1', [
      makeCandidate({ variantId: null, variantKey: 'color:black', value: '2024-03-20' }),
    ]);
    assert.equal(after.selected.candidates.length, 1);
    assert.equal(after.selected.candidates[0].value, '2024-03-20');
  });

  it('recalculateFromRuns produces same result as sequential merges', () => {
    const root = makeTmpRoot();
    mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-20' }),
      makeCandidate({ variantId: 'v_white', variantKey: 'color:white', value: '2024-06-01' }),
    ]);

    const doc = readReleaseDates({ productId: 'p1', productRoot: root });
    const recalced = recalculateReleaseDatesFromRuns(doc.runs, 'p1', 'mouse');
    assert.equal(recalced.selected.candidates.length, 2);
    const byKey = Object.fromEntries(recalced.selected.candidates.map(c => [c.variant_key, c]));
    assert.equal(byKey['color:black'].value, '2024-03-20');
    assert.equal(byKey['color:white'].value, '2024-06-01');
  });

  it('editions and colors coexist', () => {
    const root = makeTmpRoot();
    const after = mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
      makeCandidate({ variantId: 'v_ed1', variantKey: 'edition:cod-bo6', value: '2024-11-05' }),
    ]);

    assert.equal(after.selected.candidates.length, 2);
    const edition = after.selected.candidates.find(c => c.variant_type === 'edition');
    assert.ok(edition);
    assert.equal(edition.value, '2024-11-05');
  });

  it('deleteRun removes a specific run and recalculates', () => {
    const root = makeTmpRoot();
    mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    const after = mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-20' }),
    ]);

    const firstRunNumber = after.runs[0].run_number;
    const updated = deleteReleaseDateFinderRun({ productId: 'p1', productRoot: root, runNumber: firstRunNumber });
    assert.ok(updated);
    assert.equal(updated.runs.length, 1);
    assert.equal(updated.selected.candidates[0].value, '2024-03-20');
  });

  it('deleteAll wipes run history but preserves the file', () => {
    const root = makeTmpRoot();
    mergeRun(root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    deleteReleaseDateFinderAll({ productId: 'p1', productRoot: root });
    const doc = readReleaseDates({ productId: 'p1', productRoot: root });
    assert.ok(doc);
    assert.equal(doc.runs.length, 0);
    assert.equal(doc.selected.candidates.length, 0);
    assert.equal(doc.run_count, 0);
  });

  it('candidate without variant_id and variant_key is dropped by recalculation', () => {
    const root = makeTmpRoot();
    const after = mergeRun(root, 'p1', [
      { value: '2024-03-15', confidence: 90, sources: [] },
    ]);
    assert.equal(after.selected.candidates.length, 0, 'candidate without variant scope must be dropped');
  });
});

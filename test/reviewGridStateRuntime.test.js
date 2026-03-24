import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createReviewGridStateRuntime } from '../src/api/reviewGridStateRuntime.js';
import {
  resolveExplicitPositiveId,
  resolveGridFieldStateForMutation,
} from '../src/features/review/api/mutationResolvers.js';
import { SpecDb } from '../src/db/specDb.js';

function makePreparedStatement({ get = () => null, all = () => [], run = () => ({ changes: 0 }) } = {}) {
  return { get, all, run };
}

test('resolveKeyReviewForLaneMutation seeds missing grid review state from item field state', () => {
  const captured = [];
  const runtime = createReviewGridStateRuntime({
    resolveExplicitPositiveId: () => ({ provided: false, id: null, raw: null }),
    resolveGridFieldStateForMutation: () => ({
      row: {
        id: 41,
        product_id: 'mouse-1',
        field_key: 'dpi',
        value: '3200',
        accepted_candidate_id: 'cand-1',
        confidence: 0.91,
        needs_ai_review: 0,
        ai_review_complete: 1,
        overridden: 0,
      },
    }),
  });
  const specDb = {
    getKeyReviewState: () => null,
    getItemFieldStateById: () => null,
    getItemFieldStateByProductAndField: () => null,
    getKeyReviewStateById: (id) => id === 77 ? ({
      id: 77,
      category: 'mouse',
      target_kind: 'grid_key',
      item_identifier: 'mouse-1',
      field_key: 'dpi',
      item_field_state_id: 41,
    }) : null,
    upsertKeyReviewState: (payload) => {
      captured.push(payload);
      return 77;
    },
    db: {
      prepare: () => makePreparedStatement(),
    },
  };

  const result = runtime.resolveKeyReviewForLaneMutation(specDb, 'mouse', {
    itemFieldStateId: 41,
  });

  assert.equal(result.error, null);
  assert.equal(result.stateRow?.id, 77);
  assert.deepEqual(captured, [{
    category: 'mouse',
    targetKind: 'grid_key',
    itemIdentifier: 'mouse-1',
    fieldKey: 'dpi',
    itemFieldStateId: 41,
    selectedValue: '3200',
    selectedCandidateId: 'cand-1',
    confidenceScore: 0.91,
    aiConfirmPrimaryStatus: 'confirmed',
    userAcceptPrimaryStatus: null,
  }]);
});

test('resolveKeyReviewForLaneMutation preserves missing-id error contract from field-state resolution', () => {
  const runtime = createReviewGridStateRuntime({
    resolveExplicitPositiveId: () => ({ provided: false, id: null, raw: null }),
    resolveGridFieldStateForMutation: () => ({
      error: 'item_field_state_id_required',
      errorMessage: 'itemFieldStateId is required.',
    }),
  });

  const result = runtime.resolveKeyReviewForLaneMutation({}, 'mouse', {});

  assert.deepEqual(result, {
    stateRow: null,
    error: 'id_or_item_field_state_id_required',
    errorMessage: 'Provide key_review_state id or itemFieldStateId for this lane mutation.',
  });
});

test('purgeTestModeCategoryState is a no-op outside _test_ categories', () => {
  let prepareCalled = false;
  const runtime = createReviewGridStateRuntime({
    resolveExplicitPositiveId: () => ({ provided: false, id: null, raw: null }),
    resolveGridFieldStateForMutation: () => ({ row: null }),
  });
  const specDb = {
    db: {
      prepare: () => {
        prepareCalled = true;
        return makePreparedStatement();
      },
      transaction: (fn) => fn,
    },
  };

  const result = runtime.purgeTestModeCategoryState(specDb, 'mouse');

  assert.deepEqual(result, {
    clearedKeyReview: 0,
    clearedSources: 0,
    clearedCandidates: 0,
    clearedFieldState: 0,
    clearedComponentData: 0,
    clearedEnumData: 0,
    clearedCatalogState: 0,
    clearedArtifacts: 0,
  });
  assert.equal(prepareCalled, false);
});

/* ------------------------------------------------------------------ */
/*  Characterization tests — real SpecDb, locks down production paths  */
/* ------------------------------------------------------------------ */

const CATEGORY = '_test_grid_runtime';

async function createTempSpecDb() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'grid-runtime-'));
  const dbPath = path.join(tempRoot, 'spec.sqlite');
  const specDb = new SpecDb({ dbPath, category: CATEGORY });
  return { tempRoot, specDb };
}

async function cleanupTempSpecDb(tempRoot, specDb) {
  try { specDb?.close?.(); } catch { /* best-effort */ }
  await fs.rm(tempRoot, { recursive: true, force: true });
}

function seedItemFieldState(specDb, {
  productId = 'mouse-1',
  fieldKey = 'dpi',
  value = '16000',
  confidence = 0.9,
  source = 'pipeline',
  acceptedCandidateId = null,
  needsAiReview = true,
  aiReviewComplete = false,
  overridden = false,
} = {}) {
  specDb.upsertItemFieldState({
    productId, fieldKey, value, confidence, source,
    acceptedCandidateId, overridden, needsAiReview, aiReviewComplete,
  });
  return specDb.db.prepare(
    'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ? LIMIT 1'
  ).get(CATEGORY, productId, fieldKey);
}

function makeRuntime() {
  return createReviewGridStateRuntime({
    resolveExplicitPositiveId,
    resolveGridFieldStateForMutation,
  });
}

/* --- ensureGridKeyReviewState --- */

describe('ensureGridKeyReviewState — characterization', () => {
  it('returns existing key_review_state row when one matches', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      const ifs = seedItemFieldState(specDb);
      const id = specDb.upsertKeyReviewState({
        category: CATEGORY,
        targetKind: 'grid_key',
        itemIdentifier: 'mouse-1',
        fieldKey: 'dpi',
        itemFieldStateId: ifs.id,
        selectedValue: '16000',
      });
      const existing = specDb.db.prepare('SELECT * FROM key_review_state WHERE id = ?').get(id);

      const result = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'mouse-1', 'dpi', ifs.id);

      assert.equal(result.id, existing.id);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('creates key_review_state when none exists, using itemFieldStateId lookup', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      const ifs = seedItemFieldState(specDb);

      const result = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'mouse-1', 'dpi', ifs.id);

      assert.ok(result);
      assert.equal(result.target_kind, 'grid_key');
      assert.equal(result.item_identifier, 'mouse-1');
      assert.equal(result.field_key, 'dpi');
      assert.equal(result.item_field_state_id, ifs.id);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('creates key_review_state using product+field fallback when itemFieldStateId is null', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { productId: 'mouse-2', fieldKey: 'weight' });

      const result = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'mouse-2', 'weight', null);

      assert.ok(result);
      assert.equal(result.target_kind, 'grid_key');
      assert.equal(result.item_identifier, 'mouse-2');
      assert.equal(result.field_key, 'weight');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('uses seed data (value, flags) when creating key_review_state from existing item_field_state', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      // WHY: In production, the seed is always the resolved fieldStateRow (a real row).
      // The seed provides value/confidence/flags for the new key_review_state.
      // We verify those seed values propagate into the created row.
      seedItemFieldState(specDb, {
        productId: 'mouse-3', fieldKey: 'sensor', value: 'PMW3360',
        confidence: 0.8, needsAiReview: true, aiReviewComplete: false,
        acceptedCandidateId: 'cand-9',
      });

      const result = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'mouse-3', 'sensor');

      assert.ok(result);
      assert.equal(result.selected_value, 'PMW3360');
      assert.equal(result.selected_candidate_id, 'cand-9');
      assert.equal(result.ai_confirm_primary_status, 'pending');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null when all lookups fail and no seed', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();

      const result = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'no-such', 'no-field');

      assert.equal(result, null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('derives aiConfirmPrimaryStatus and userAcceptPrimaryStatus from field state flags', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      // needs_ai_review=1, ai_review_complete=0 → pending
      seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', needsAiReview: true, aiReviewComplete: false });
      const r1 = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'p1', 'f1');
      assert.equal(r1.ai_confirm_primary_status, 'pending');
      assert.equal(r1.user_accept_primary_status, null);

      // ai_review_complete=1 → confirmed
      seedItemFieldState(specDb, { productId: 'p2', fieldKey: 'f2', needsAiReview: false, aiReviewComplete: true });
      const r2 = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'p2', 'f2');
      assert.equal(r2.ai_confirm_primary_status, 'confirmed');

      // overridden → userAcceptPrimaryStatus = 'accepted'
      seedItemFieldState(specDb, { productId: 'p3', fieldKey: 'f3', overridden: true, needsAiReview: false, aiReviewComplete: true });
      const r3 = runtime.ensureGridKeyReviewState(specDb, CATEGORY, 'p3', 'f3');
      assert.equal(r3.user_accept_primary_status, 'accepted');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

/* --- resolveKeyReviewForLaneMutation (new real-DB tests) --- */

describe('resolveKeyReviewForLaneMutation — characterization', () => {
  it('resolves by explicit positive id', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      const ifs = seedItemFieldState(specDb);
      const id = specDb.upsertKeyReviewState({
        category: CATEGORY,
        targetKind: 'grid_key',
        itemIdentifier: 'mouse-1',
        fieldKey: 'dpi',
        itemFieldStateId: ifs.id,
      });

      const result = runtime.resolveKeyReviewForLaneMutation(specDb, CATEGORY, { id });

      assert.equal(result.error, null);
      assert.equal(result.stateRow.id, id);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns not_found error for valid but missing id', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();

      const result = runtime.resolveKeyReviewForLaneMutation(specDb, CATEGORY, { id: 99999 });

      assert.equal(result.error, 'key_review_state_id_not_found');
      assert.equal(result.stateRow, null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns specdb_not_ready when specDb is null', () => {
    const runtime = makeRuntime();

    const result = runtime.resolveKeyReviewForLaneMutation(null, CATEGORY, {});

    assert.equal(result.error, 'specdb_not_ready');
  });
});

/* --- markPrimaryLaneReviewedInItemState --- */

describe('markPrimaryLaneReviewedInItemState — characterization', () => {
  it('sets needs_ai_review=0 and ai_review_complete=1 for matching item_field_state', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { needsAiReview: true, aiReviewComplete: false });

      runtime.markPrimaryLaneReviewedInItemState(specDb, CATEGORY, {
        target_kind: 'grid_key',
        item_identifier: 'mouse-1',
        field_key: 'dpi',
      });

      const row = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'mouse-1', 'dpi');
      assert.equal(row.needs_ai_review, 0);
      assert.equal(row.ai_review_complete, 1);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('is a no-op when target_kind is not grid_key', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { needsAiReview: true, aiReviewComplete: false });

      runtime.markPrimaryLaneReviewedInItemState(specDb, CATEGORY, {
        target_kind: 'component_key',
        item_identifier: 'mouse-1',
        field_key: 'dpi',
      });

      const row = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'mouse-1', 'dpi');
      assert.equal(row.needs_ai_review, 1);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('is a no-op when item_identifier is missing', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { needsAiReview: true, aiReviewComplete: false });

      runtime.markPrimaryLaneReviewedInItemState(specDb, CATEGORY, {
        target_kind: 'grid_key',
        item_identifier: '',
        field_key: 'dpi',
      });

      const row = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'mouse-1', 'dpi');
      assert.equal(row.needs_ai_review, 1);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

/* --- syncItemFieldStateFromPrimaryLaneAccept --- */

describe('syncItemFieldStateFromPrimaryLaneAccept — characterization', () => {
  it('upserts item_field_state from keyReviewState selected value', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { value: 'old-value' });
      const ifs = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'mouse-1', 'dpi');

      const krs = {
        target_kind: 'grid_key',
        item_identifier: 'mouse-1',
        field_key: 'dpi',
        selected_candidate_id: null,
        selected_value: 'new-value',
        confidence_score: 0.95,
        ai_confirm_primary_status: 'confirmed',
      };
      runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, krs);

      const updated = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'mouse-1', 'dpi');
      assert.equal(updated.value, 'new-value');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('is a no-op when target_kind is not grid_key', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { value: 'original' });

      runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, {
        target_kind: 'enum_key',
        item_identifier: 'mouse-1',
        field_key: 'dpi',
        selected_value: 'changed',
      });

      const row = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'mouse-1', 'dpi');
      assert.equal(row.value, 'original');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('skips when selected value is not meaningful and no current row exists', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      // no item_field_state seeded for this product/field

      runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, {
        target_kind: 'grid_key',
        item_identifier: 'no-product',
        field_key: 'no-field',
        selected_value: 'unknown',
        selected_candidate_id: null,
      });

      const row = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'no-product', 'no-field');
      assert.equal(row, undefined);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('falls back to current value when selected_value is empty', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { value: 'existing-value', confidence: 0.8 });

      runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, {
        target_kind: 'grid_key',
        item_identifier: 'mouse-1',
        field_key: 'dpi',
        selected_value: null,
        selected_candidate_id: null,
        confidence_score: 0.99,
        ai_confirm_primary_status: 'confirmed',
      });

      const row = specDb.db.prepare(
        'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ?'
      ).get(CATEGORY, 'mouse-1', 'dpi');
      assert.equal(row.value, 'existing-value');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('does not throw when syncItemListLinkForFieldValue fails', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb, { value: '16000' });

      // This should not throw even though list link sync may find no matching list values
      runtime.syncItemFieldStateFromPrimaryLaneAccept(specDb, CATEGORY, {
        target_kind: 'grid_key',
        item_identifier: 'mouse-1',
        field_key: 'dpi',
        selected_value: '16000',
        selected_candidate_id: null,
        confidence_score: 0.9,
        ai_confirm_primary_status: 'confirmed',
      });
      assert.ok(true, 'did not throw');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

/* --- syncPrimaryLaneAcceptFromItemSelection --- */

describe('syncPrimaryLaneAcceptFromItemSelection — characterization', () => {
  it('ensures key_review_state and updates selected candidate/value/score', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb);

      const result = runtime.syncPrimaryLaneAcceptFromItemSelection({
        specDb,
        category: CATEGORY,
        productId: 'mouse-1',
        fieldKey: 'dpi',
        selectedCandidateId: 'cand-42',
        selectedValue: '25600',
        confidenceScore: 0.98,
        reason: 'test accept',
      });

      assert.ok(result);
      assert.equal(result.selected_candidate_id, 'cand-42');
      assert.equal(result.selected_value, '25600');
      assert.equal(result.user_accept_primary_status, 'accepted');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('creates audit trail entry', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      seedItemFieldState(specDb);

      const result = runtime.syncPrimaryLaneAcceptFromItemSelection({
        specDb,
        category: CATEGORY,
        productId: 'mouse-1',
        fieldKey: 'dpi',
        selectedCandidateId: null,
        selectedValue: 'manual',
        reason: 'User override',
      });

      const audits = specDb.db.prepare(
        'SELECT * FROM key_review_audit WHERE key_review_state_id = ?'
      ).all(result.id);
      assert.ok(audits.length >= 1);
      assert.equal(audits[0].event_type, 'user_accept');
      assert.equal(audits[0].new_value, 'accepted');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null when ensureGridKeyReviewState returns null', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const runtime = makeRuntime();
      // No item_field_state seeded — ensureGridKeyReviewState will return null

      const result = runtime.syncPrimaryLaneAcceptFromItemSelection({
        specDb,
        category: CATEGORY,
        productId: 'nonexistent',
        fieldKey: 'nope',
      });

      assert.equal(result, null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null when specDb is falsy', () => {
    const runtime = makeRuntime();

    const result = runtime.syncPrimaryLaneAcceptFromItemSelection({
      specDb: null,
      category: CATEGORY,
      productId: 'mouse-1',
      fieldKey: 'dpi',
    });

    assert.equal(result, null);
  });
});

/* ------------------------------------------------------------------ */
/*  Phase 1: Store method tests                                        */
/* ------------------------------------------------------------------ */

describe('store methods — getKeyReviewStateById', () => {
  it('returns row by id', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const ifs = seedItemFieldState(specDb);
      const id = specDb.upsertKeyReviewState({
        category: CATEGORY, targetKind: 'grid_key',
        itemIdentifier: 'mouse-1', fieldKey: 'dpi', itemFieldStateId: ifs.id,
      });

      const row = specDb.getKeyReviewStateById(id);
      assert.ok(row);
      assert.equal(row.id, Number(id));
      assert.equal(row.target_kind, 'grid_key');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null for missing id', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      assert.equal(specDb.getKeyReviewStateById(99999), null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null for invalid id', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      assert.equal(specDb.getKeyReviewStateById(null), null);
      assert.equal(specDb.getKeyReviewStateById('abc'), null);
      assert.equal(specDb.getKeyReviewStateById(-1), null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

describe('store methods — updateKeyReviewSelectedCandidate', () => {
  it('updates selected candidate, value, and score', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const ifs = seedItemFieldState(specDb);
      const id = specDb.upsertKeyReviewState({
        category: CATEGORY, targetKind: 'grid_key',
        itemIdentifier: 'mouse-1', fieldKey: 'dpi', itemFieldStateId: ifs.id,
      });

      specDb.updateKeyReviewSelectedCandidate({
        id, selectedCandidateId: 'cand-1', selectedValue: '25600', confidenceScore: 0.95,
      });

      const row = specDb.getKeyReviewStateById(id);
      assert.equal(row.selected_candidate_id, 'cand-1');
      assert.equal(row.selected_value, '25600');
      assert.equal(row.confidence_score, 0.95);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('preserves confidence_score when null via COALESCE', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      const ifs = seedItemFieldState(specDb);
      const id = specDb.upsertKeyReviewState({
        category: CATEGORY, targetKind: 'grid_key',
        itemIdentifier: 'mouse-1', fieldKey: 'dpi', itemFieldStateId: ifs.id,
        confidenceScore: 0.8,
      });

      specDb.updateKeyReviewSelectedCandidate({
        id, selectedCandidateId: 'cand-2', selectedValue: 'new', confidenceScore: null,
      });

      const row = specDb.getKeyReviewStateById(id);
      assert.equal(row.confidence_score, 0.8);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

describe('store methods — getItemFieldStateByProductAndField', () => {
  it('returns row by product and field', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', value: 'v1' });

      const row = specDb.getItemFieldStateByProductAndField('p1', 'f1');
      assert.ok(row);
      assert.equal(row.product_id, 'p1');
      assert.equal(row.field_key, 'f1');
      assert.equal(row.value, 'v1');
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null when not found', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      assert.equal(specDb.getItemFieldStateByProductAndField('no', 'no'), null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('returns null for empty inputs', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      assert.equal(specDb.getItemFieldStateByProductAndField('', 'f1'), null);
      assert.equal(specDb.getItemFieldStateByProductAndField('p1', ''), null);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

describe('store methods — markItemFieldStateReviewComplete', () => {
  it('sets needs_ai_review=0 and ai_review_complete=1', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', needsAiReview: true, aiReviewComplete: false });

      specDb.markItemFieldStateReviewComplete('p1', 'f1');

      const row = specDb.getItemFieldStateByProductAndField('p1', 'f1');
      assert.equal(Boolean(row.needs_ai_review), false);
      assert.equal(Boolean(row.ai_review_complete), true);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });

  it('is a no-op for empty inputs', async () => {
    const { tempRoot, specDb } = await createTempSpecDb();
    try {
      seedItemFieldState(specDb, { productId: 'p1', fieldKey: 'f1', needsAiReview: true, aiReviewComplete: false });

      specDb.markItemFieldStateReviewComplete('', 'f1');
      specDb.markItemFieldStateReviewComplete('p1', '');

      const row = specDb.getItemFieldStateByProductAndField('p1', 'f1');
      assert.equal(Boolean(row.needs_ai_review), true);
    } finally {
      await cleanupTempSpecDb(tempRoot, specDb);
    }
  });
});

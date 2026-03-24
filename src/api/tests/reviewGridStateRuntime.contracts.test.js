import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReviewGridStateRuntime,
  makePreparedStatement,
} from './helpers/reviewGridStateRuntimeHarness.js';

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

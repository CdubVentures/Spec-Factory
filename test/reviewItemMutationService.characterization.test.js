import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveGridLaneStateForMutation,
  resolveGridLaneCandidate,
  resolvePrimaryConfirmItemFieldStateId,
  updateKeyReviewSelectedCandidate,
  resolveItemLaneCandidateMutationRequest,
  setItemFieldNeedsAiReview,
  applyPrimaryItemConfirmLane,
  applyLaneCandidateSelection,
  applyLaneDecisionStatusAndAudit,
  resolveItemFieldMutationRequest,
  applyItemManualOverrideAndSync,
  resolveItemOverrideMode,
} from '../src/features/review/api/itemMutationRoutes.js';

// --- resolveGridLaneStateForMutation ---

test('resolveGridLaneStateForMutation returns error when resolver returns error', () => {
  const result = resolveGridLaneStateForMutation({
    specDb: {},
    category: 'mouse',
    body: {},
    resolveKeyReviewForLaneMutation: () => ({ error: 'bad_input', errorMessage: 'Missing id' }),
  });
  assert.equal(result.stateCtx, null);
  assert.equal(result.stateRow, null);
  assert.equal(result.error.status, 400);
  assert.equal(result.error.payload.error, 'bad_input');
});

test('resolveGridLaneStateForMutation returns 404 when stateRow is missing', () => {
  const result = resolveGridLaneStateForMutation({
    specDb: {},
    category: 'mouse',
    body: {},
    resolveKeyReviewForLaneMutation: () => ({ stateRow: null }),
  });
  assert.equal(result.error.status, 404);
  assert.equal(result.error.payload.error, 'key_review_state_not_found');
});

test('resolveGridLaneStateForMutation returns error when target_kind is not grid_key', () => {
  const result = resolveGridLaneStateForMutation({
    specDb: {},
    category: 'mouse',
    body: {},
    resolveKeyReviewForLaneMutation: () => ({ stateRow: { target_kind: 'component_key' } }),
  });
  assert.equal(result.error.status, 400);
  assert.equal(result.error.payload.error, 'lane_context_mismatch');
});

test('resolveGridLaneStateForMutation succeeds for grid_key target', () => {
  const stateRow = { target_kind: 'grid_key', id: 1 };
  const stateCtx = { stateRow };
  const result = resolveGridLaneStateForMutation({
    specDb: {},
    category: 'mouse',
    body: {},
    resolveKeyReviewForLaneMutation: () => stateCtx,
  });
  assert.equal(result.error, null);
  assert.deepEqual(result.stateRow, stateRow);
});

// --- resolveGridLaneCandidate ---

test('resolveGridLaneCandidate returns 404 when candidate not found', () => {
  const result = resolveGridLaneCandidate({
    specDb: { getCandidateById: () => null },
    candidateId: 'missing-id',
    stateRow: { item_identifier: 'p1', field_key: 'weight' },
  });
  assert.equal(result.error.status, 404);
  assert.equal(result.error.payload.error, 'candidate_not_found');
  assert.equal(result.candidateRow, null);
});

test('resolveGridLaneCandidate returns mismatch error when candidate belongs to different product/field', () => {
  const result = resolveGridLaneCandidate({
    specDb: { getCandidateById: () => ({ product_id: 'p2', field_key: 'dpi', candidate_id: 'c1' }) },
    candidateId: 'c1',
    stateRow: { item_identifier: 'p1', field_key: 'weight' },
  });
  assert.equal(result.error.status, 400);
  assert.equal(result.error.payload.error, 'candidate_context_mismatch');
});

test('resolveGridLaneCandidate succeeds when candidate matches', () => {
  const candidateRow = { product_id: 'p1', field_key: 'weight', candidate_id: 'c1', value: '49' };
  const result = resolveGridLaneCandidate({
    specDb: { getCandidateById: () => candidateRow },
    candidateId: 'c1',
    stateRow: { item_identifier: 'p1', field_key: 'weight' },
  });
  assert.equal(result.error, null);
  assert.equal(result.persistedCandidateId, 'c1');
  assert.deepEqual(result.candidateRow, candidateRow);
});

// --- resolvePrimaryConfirmItemFieldStateId ---

test('resolvePrimaryConfirmItemFieldStateId resolves from stateRow first', () => {
  const result = resolvePrimaryConfirmItemFieldStateId({
    stateRow: { item_field_state_id: 42 },
    stateCtx: { fieldStateRow: { id: 99 } },
    body: { itemFieldStateId: 100 },
  });
  assert.equal(result, 42);
});

test('resolvePrimaryConfirmItemFieldStateId falls back to stateCtx', () => {
  const result = resolvePrimaryConfirmItemFieldStateId({
    stateRow: {},
    stateCtx: { fieldStateRow: { id: 99 } },
    body: {},
  });
  assert.equal(result, 99);
});

test('resolvePrimaryConfirmItemFieldStateId falls back to body', () => {
  const result = resolvePrimaryConfirmItemFieldStateId({
    stateRow: {},
    stateCtx: {},
    body: { item_field_state_id: 55 },
  });
  assert.equal(result, 55);
});

test('resolvePrimaryConfirmItemFieldStateId returns NaN for empty inputs', () => {
  const result = resolvePrimaryConfirmItemFieldStateId({
    stateRow: {},
    stateCtx: {},
    body: {},
  });
  assert.equal(Number.isNaN(result), true);
});

// --- updateKeyReviewSelectedCandidate ---

test('updateKeyReviewSelectedCandidate calls prepare+run with correct args', () => {
  const calls = [];
  const specDb = {
    db: {
      prepare: (sql) => ({
        run: (...args) => { calls.push({ sql: sql.trim(), args }); },
      }),
    },
  };
  updateKeyReviewSelectedCandidate({
    specDb,
    stateId: 10,
    candidateId: 'c1',
    selectedValue: '49g',
    selectedScore: 0.95,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['c1', '49g', 0.95, 10]);
});

// --- resolveItemLaneCandidateMutationRequest ---

test('resolveItemLaneCandidateMutationRequest rejects invalid lane', async () => {
  const result = await resolveItemLaneCandidateMutationRequest({
    req: {},
    category: 'mouse',
    readJsonBody: async () => ({ lane: 'invalid' }),
    getSpecDb: () => ({}),
    resolveKeyReviewForLaneMutation: () => ({}),
    candidateRequiredMessage: 'candidate required',
  });
  assert.equal(result.error.status, 400);
  assert.match(result.error.payload.error, /lane/);
});

test('resolveItemLaneCandidateMutationRequest rejects missing candidateId', async () => {
  const result = await resolveItemLaneCandidateMutationRequest({
    req: {},
    category: 'mouse',
    readJsonBody: async () => ({ lane: 'primary' }),
    getSpecDb: () => ({ getCandidateById: () => null }),
    resolveKeyReviewForLaneMutation: () => ({ stateRow: { target_kind: 'grid_key', item_identifier: 'p1', field_key: 'w' } }),
    candidateRequiredMessage: 'candidate required',
  });
  assert.equal(result.error.status, 400);
  assert.equal(result.error.payload.error, 'candidate_id_required');
});

test('resolveItemLaneCandidateMutationRequest succeeds with valid inputs', async () => {
  const stateRow = { target_kind: 'grid_key', item_identifier: 'p1', field_key: 'weight' };
  const candidateRow = { product_id: 'p1', field_key: 'weight', candidate_id: 'c1', value: '49' };
  const result = await resolveItemLaneCandidateMutationRequest({
    req: {},
    category: 'mouse',
    readJsonBody: async () => ({ lane: 'primary', candidateId: 'c1' }),
    getSpecDb: () => ({ getCandidateById: () => candidateRow }),
    resolveKeyReviewForLaneMutation: () => ({ stateRow }),
    candidateRequiredMessage: 'candidate required',
  });
  assert.equal(result.error, null);
  assert.equal(result.lane, 'primary');
  assert.equal(result.candidateId, 'c1');
  assert.deepEqual(result.candidateRow, candidateRow);
});

// --- setItemFieldNeedsAiReview ---

test('setItemFieldNeedsAiReview calls UPDATE on item_field_state', () => {
  const calls = [];
  const specDb = {
    db: {
      prepare: (sql) => ({
        run: (...args) => { calls.push({ sql: sql.trim(), args }); },
      }),
    },
  };
  setItemFieldNeedsAiReview(specDb, 'mouse', 42);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['mouse', 42]);
});

test('setItemFieldNeedsAiReview swallows errors', () => {
  const specDb = {
    db: {
      prepare: () => ({ run: () => { throw new Error('boom'); } }),
    },
  };
  assert.doesNotThrow(() => setItemFieldNeedsAiReview(specDb, 'mouse', 1));
});

// --- applyLaneCandidateSelection ---

test('applyLaneCandidateSelection returns error for non-meaningful value', () => {
  const result = applyLaneCandidateSelection({
    specDb: {
      db: { prepare: () => ({ run: () => {} }) },
    },
    stateRow: { id: 1 },
    candidateId: 'c1',
    candidateRow: { value: 'unk', score: 0.1 },
    isMeaningfulValue: (v) => v !== 'unk',
    unknownValueMessage: 'Cannot accept unknown value',
  });
  assert.equal(result.error.status, 400);
  assert.equal(result.error.payload.error, 'unknown_value_not_actionable');
});

test('applyLaneCandidateSelection succeeds for meaningful value', () => {
  const result = applyLaneCandidateSelection({
    specDb: {
      db: { prepare: () => ({ run: () => {} }) },
    },
    stateRow: { id: 1 },
    candidateId: 'c1',
    candidateRow: { value: '49', score: 0.95 },
    isMeaningfulValue: () => true,
    unknownValueMessage: 'N/A',
  });
  assert.equal(result.error, null);
  assert.equal(result.selectedValue, '49');
  assert.equal(result.selectedScore, 0.95);
});

// --- applyLaneDecisionStatusAndAudit ---

test('applyLaneDecisionStatusAndAudit confirm lane calls updateKeyReviewAiConfirm + insertKeyReviewAudit', () => {
  const calls = {};
  const stateRow = { id: 5, ai_confirm_shared_status: 'pending' };
  const specDb = {
    updateKeyReviewAiConfirm: (args) => { calls.confirm = args; },
    insertKeyReviewAudit: (args) => { calls.audit = args; },
    db: { prepare: () => ({ get: () => ({ ...stateRow, ai_confirm_shared_status: 'confirmed' }) }) },
  };
  const result = applyLaneDecisionStatusAndAudit({
    specDb,
    stateRow,
    lane: 'shared',
    decision: 'confirm',
  });
  assert.equal(calls.confirm.lane, 'shared');
  assert.equal(calls.confirm.status, 'confirmed');
  assert.equal(calls.audit.eventType, 'ai_confirm');
  assert.equal(calls.audit.newValue, 'confirmed');
  assert.ok(result.updated);
  assert.ok(result.now);
});

test('applyLaneDecisionStatusAndAudit accept lane calls updateKeyReviewUserAccept', () => {
  const calls = {};
  const stateRow = { id: 5 };
  const specDb = {
    updateKeyReviewUserAccept: (args) => { calls.accept = args; },
    insertKeyReviewAudit: (args) => { calls.audit = args; },
    db: { prepare: () => ({ get: () => stateRow }) },
  };
  const result = applyLaneDecisionStatusAndAudit({
    specDb,
    stateRow,
    lane: 'primary',
    decision: 'accept',
    candidateId: 'c1',
  });
  assert.equal(calls.accept.lane, 'primary');
  assert.equal(calls.accept.status, 'accepted');
  assert.equal(calls.audit.eventType, 'user_accept');
  assert.match(calls.audit.reason, /candidate c1/);
});

// --- resolveItemFieldMutationRequest ---

test('resolveItemFieldMutationRequest returns error when resolveGridFieldStateForMutation reports error', () => {
  const result = resolveItemFieldMutationRequest({
    getSpecDb: () => ({}),
    resolveGridFieldStateForMutation: () => ({ error: 'missing_field', errorMessage: 'No field' }),
    category: 'mouse',
    body: {},
    missingSlotMessage: 'slot required',
  });
  assert.equal(result.error.status, 400);
  assert.equal(result.error.payload.error, 'missing_field');
});

test('resolveItemFieldMutationRequest returns error when productId or field is empty', () => {
  const result = resolveItemFieldMutationRequest({
    getSpecDb: () => ({}),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: '', field_key: '' } }),
    category: 'mouse',
    body: {},
    missingSlotMessage: 'slot required',
  });
  assert.equal(result.error.status, 400);
  assert.equal(result.error.payload.error, 'item_field_state_id_required');
});

test('resolveItemFieldMutationRequest succeeds with valid field state', () => {
  const result = resolveItemFieldMutationRequest({
    getSpecDb: () => ({ db: {} }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'p1', field_key: 'weight' } }),
    category: 'mouse',
    body: {},
    missingSlotMessage: 'slot required',
  });
  assert.equal(result.error, null);
  assert.equal(result.productId, 'p1');
  assert.equal(result.field, 'weight');
});

// --- applyItemManualOverrideAndSync ---

test('applyItemManualOverrideAndSync calls setManualOverride and syncPrimaryLaneAcceptFromItemSelection', async () => {
  const calls = {};
  const result = await applyItemManualOverrideAndSync({
    storage: {},
    config: {},
    setManualOverride: async (args) => { calls.manual = args; return { value: '50g' }; },
    syncPrimaryLaneAcceptFromItemSelection: (args) => { calls.sync = args; },
    specDb: {},
    category: 'mouse',
    productId: 'p1',
    field: 'weight',
    value: '50g',
    reviewer: 'user',
    reason: 'correction',
    evidence: { url: 'test' },
    syncReason: 'manual override',
  });
  assert.ok(calls.manual);
  assert.equal(calls.manual.value, '50g');
  assert.ok(calls.sync);
  assert.equal(calls.sync.selectedValue, '50g');
  assert.equal(result.value, '50g');
});

test('applyItemManualOverrideAndSync skips sync when specDb is null', async () => {
  const calls = {};
  await applyItemManualOverrideAndSync({
    storage: {},
    config: {},
    setManualOverride: async () => ({ value: 'x' }),
    syncPrimaryLaneAcceptFromItemSelection: () => { calls.sync = true; },
    specDb: null,
    category: 'mouse',
    productId: 'p1',
    field: 'weight',
    value: 'x',
    reviewer: 'user',
    reason: 'test',
    evidence: {},
    syncReason: 'test',
  });
  assert.equal(calls.sync, undefined);
});

// --- resolveItemOverrideMode ---

test('resolveItemOverrideMode returns override for matching route', () => {
  assert.equal(
    resolveItemOverrideMode(['review', 'mouse', 'override'], 'POST'),
    'override',
  );
});

test('resolveItemOverrideMode returns manual-override for matching route', () => {
  assert.equal(
    resolveItemOverrideMode(['review', 'mouse', 'manual-override'], 'POST'),
    'manual-override',
  );
});

test('resolveItemOverrideMode returns null for non-matching route', () => {
  assert.equal(
    resolveItemOverrideMode(['review', 'mouse', 'accept'], 'POST'),
    null,
  );
});

// --- applyPrimaryItemConfirmLane ---

test('applyPrimaryItemConfirmLane confirms when no pending candidates remain', () => {
  const calls = {};
  const stateRow = { id: 1 };
  const specDb = {
    upsertReview: (args) => { calls.review = args; },
    updateKeyReviewAiConfirm: (args) => { calls.confirm = args; },
    db: { prepare: () => ({ get: () => ({ ...stateRow, ai_confirm_primary_status: 'confirmed' }) }) },
  };
  const result = applyPrimaryItemConfirmLane({
    specDb,
    category: 'mouse',
    stateRow,
    stateProductId: 'p1',
    stateFieldKey: 'weight',
    stateItemFieldStateId: 42,
    persistedCandidateId: 'c1',
    candidateScore: 0.95,
    candidateConfidence: 0.98,
    getPendingItemPrimaryCandidateIds: () => [],
    markPrimaryLaneReviewedInItemState: (db, cat, row) => { calls.markPrimary = { cat, row }; },
  });
  assert.equal(result.nextPrimaryStatus, 'confirmed');
  assert.deepEqual(result.pendingCandidateIds, []);
  assert.ok(calls.review);
  assert.equal(calls.confirm.status, 'confirmed');
  assert.ok(calls.markPrimary);
});

test('applyPrimaryItemConfirmLane stays pending when candidates remain', () => {
  const calls = {};
  const stateRow = { id: 1 };
  const specDb = {
    upsertReview: () => {},
    updateKeyReviewAiConfirm: (args) => { calls.confirm = args; },
    db: {
      prepare: (sql) => ({
        get: () => stateRow,
        run: () => {},
      }),
    },
  };
  const result = applyPrimaryItemConfirmLane({
    specDb,
    category: 'mouse',
    stateRow,
    stateProductId: 'p1',
    stateFieldKey: 'weight',
    stateItemFieldStateId: 42,
    persistedCandidateId: 'c1',
    candidateScore: 0.95,
    candidateConfidence: null,
    getPendingItemPrimaryCandidateIds: () => ['c2', 'c3'],
    markPrimaryLaneReviewedInItemState: () => {},
  });
  assert.equal(result.nextPrimaryStatus, 'pending');
  assert.deepEqual(result.pendingCandidateIds, ['c2', 'c3']);
  assert.equal(calls.confirm.status, 'pending');
});

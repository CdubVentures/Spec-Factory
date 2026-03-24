import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { handleReviewItemMutationRoute } from '../itemMutationRoutes.js';

/* ------------------------------------------------------------------ */
/*  WHY: Characterization tests for the handler dispatch layer.         */
/*  These test route matching, input validation, error wrapping, and    */
/*  the dispatch-to-service boundary. Deep specDb interactions are      */
/*  covered by the 31 service characterization tests in                 */
/*  reviewItemMutationService.characterization.test.js.                 */
/* ------------------------------------------------------------------ */

function makeItemFieldStateRow() {
  return { id: 1, product_id: 'mouse-foo-bar', field_key: 'weight', category: 'mouse', value: '85g' };
}

function makeItemCtx(overrides = {}) {
  const calls = { jsonRes: [], broadcastWs: [], setOverride: [], setManual: [], syncPrimary: [] };
  const ctx = {
    storage: {}, config: {},
    readJsonBody: async () => ({}),
    jsonRes: (_res, status, body) => { calls.jsonRes.push({ status, body }); return { status, body }; },
    getSpecDb: () => ({
      isSeeded: () => true,
      category: 'mouse',
    }),
    resolveGridFieldStateForMutation: () => ({ row: makeItemFieldStateRow() }),
    setOverrideFromCandidate: async (args) => { calls.setOverride.push(args); return { candidate_id: 'ref_c1', value: '85g' }; },
    setManualOverride: async (args) => { calls.setManual.push(args); return { value: args.value }; },
    syncPrimaryLaneAcceptFromItemSelection: (args) => { calls.syncPrimary.push(args); },
    resolveKeyReviewForLaneMutation: () => ({ stateRow: null, error: 'not_implemented_in_test' }),
    getPendingItemPrimaryCandidateIds: () => [],
    markPrimaryLaneReviewedInItemState: () => {},
    syncItemFieldStateFromPrimaryLaneAccept: () => {},
    isMeaningfulValue: (v) => v != null && String(v).trim() !== '',
    propagateSharedLaneDecision: async () => {},
    broadcastWs: (...args) => { calls.broadcastWs.push(args); },
    ...overrides,
  };
  return { ctx, calls };
}

/* ------------------------------------------------------------------ */
/*  Route matching                                                      */
/* ------------------------------------------------------------------ */

describe('item route handler — route matching', () => {
  it('returns false for non-review paths', async () => {
    const { ctx } = makeItemCtx();
    strictEqual(await handleReviewItemMutationRoute({
      parts: ['other', 'mouse', 'override'], method: 'POST', req: {}, res: {}, context: ctx,
    }), false);
  });

  it('returns false for review paths without matching action', async () => {
    const { ctx } = makeItemCtx();
    strictEqual(await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'unknown-action'], method: 'POST', req: {}, res: {}, context: ctx,
    }), false);
  });

  it('matches POST /review/{category}/override', async () => {
    const { ctx } = makeItemCtx({
      readJsonBody: async () => ({ candidateId: 'ref_c1', itemFieldStateId: 1 }),
    });
    const result = await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    ok(result !== false);
  });

  it('matches POST /review/{category}/manual-override', async () => {
    const { ctx } = makeItemCtx({
      readJsonBody: async () => ({ value: 'test', itemFieldStateId: 1 }),
    });
    const result = await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'manual-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    ok(result !== false);
  });

  it('matches POST /review/{category}/key-review-confirm', async () => {
    const { ctx } = makeItemCtx({
      readJsonBody: async () => ({ lane: 'primary', candidateId: 'ref_c1' }),
    });
    const result = await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'key-review-confirm'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    ok(result !== false);
  });

  it('matches POST /review/{category}/key-review-accept', async () => {
    const { ctx } = makeItemCtx({
      readJsonBody: async () => ({ lane: 'primary', candidateId: 'ref_c1' }),
    });
    const result = await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'key-review-accept'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    ok(result !== false);
  });
});

/* ------------------------------------------------------------------ */
/*  Override input validation                                           */
/* ------------------------------------------------------------------ */

describe('item route handler — override input validation', () => {
  it('manual-override without value responds 400 value_required', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ value: '', itemFieldStateId: 1 }),
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'manual-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
    strictEqual(calls.jsonRes[0].body.error, 'value_required');
  });

  it('override without candidateId or value responds 400', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ itemFieldStateId: 1 }),
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });

  it('override with bad itemFieldStateId responds 400', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ candidateId: 'ref_c1' }),
      resolveGridFieldStateForMutation: () => ({
        error: 'item_field_state_id_required',
        errorMessage: 'Valid itemFieldStateId is required.',
      }),
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });
});

/* ------------------------------------------------------------------ */
/*  Override service delegation                                         */
/* ------------------------------------------------------------------ */

describe('item route handler — override service delegation', () => {
  it('override from candidate calls setOverrideFromCandidate + syncPrimary + broadcast', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ candidateId: 'ref_c1', value: '85g', itemFieldStateId: 1 }),
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.setOverride.length, 1);
    strictEqual(calls.syncPrimary.length, 1);
    strictEqual(calls.broadcastWs.length, 1);
  });

  it('manual override calls setManualOverride + broadcast', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ value: 'manual-val', itemFieldStateId: 1 }),
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'manual-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.broadcastWs.length, 1);
  });
});

/* ------------------------------------------------------------------ */
/*  Error wrapping                                                      */
/* ------------------------------------------------------------------ */

describe('item route handler — error wrapping', () => {
  it('override error responds 500 override_failed', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ candidateId: 'ref_c1', itemFieldStateId: 1 }),
      setOverrideFromCandidate: async () => { throw new Error('db down'); },
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 500);
    strictEqual(calls.jsonRes[0].body.error, 'override_failed');
  });

  it('manual override error responds 500 manual_override_failed', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ value: 'test', itemFieldStateId: 1 }),
      setManualOverride: async () => { throw new Error('db down'); },
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'manual-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 500);
    strictEqual(calls.jsonRes[0].body.error, 'manual_override_failed');
  });

  it('confirm error responds 500 confirm_failed', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ lane: 'primary', candidateId: 'ref_c1' }),
      resolveKeyReviewForLaneMutation: () => { throw new Error('boom'); },
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'key-review-confirm'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 500);
    strictEqual(calls.jsonRes[0].body.error, 'confirm_failed');
  });

  it('accept error responds 500 accept_failed', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ lane: 'primary', candidateId: 'ref_c1' }),
      resolveKeyReviewForLaneMutation: () => { throw new Error('boom'); },
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'key-review-accept'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 500);
    strictEqual(calls.jsonRes[0].body.error, 'accept_failed');
  });
});

/* ------------------------------------------------------------------ */
/*  Lane validation                                                     */
/* ------------------------------------------------------------------ */

describe('item route handler — lane validation', () => {
  it('confirm without lane responds 400', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ candidateId: 'ref_c1' }),
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'key-review-confirm'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });

  it('accept without lane responds 400', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ candidateId: 'ref_c1' }),
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'key-review-accept'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });

  it('confirm with invalid lane responds 400', async () => {
    const { ctx, calls } = makeItemCtx({
      readJsonBody: async () => ({ lane: 'invalid', candidateId: 'ref_c1' }),
    });
    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'key-review-confirm'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });
});

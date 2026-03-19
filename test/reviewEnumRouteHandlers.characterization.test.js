import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { handleReviewEnumMutationRoute } from '../src/api/reviewEnumMutationRoutes.js';

/* ------------------------------------------------------------------ */
/*  WHY: Characterization tests for enum handler dispatch layer.        */
/*  Tests route matching, input validation, consumer gate, error        */
/*  wrapping. Deep specDb interactions covered by 37 service tests in   */
/*  reviewEnumMutationService.characterization.test.js.                 */
/* ------------------------------------------------------------------ */

function makeEnumCtx(overrides = {}) {
  const calls = { jsonRes: [], broadcastWs: [], cascade: [], specDbCacheDeleted: [] };
  const ctx = {
    readJsonBody: async () => ({}),
    jsonRes: (_res, status, body) => { calls.jsonRes.push({ status, body }); return { status, body }; },
    getSpecDbReady: async () => ({
      isSeeded: () => true,
      category: 'mouse',
      getEnumList: () => ({ id: 4, field_key: 'lighting' }),
      getListValues: () => [],
      getListValueByFieldAndValue: () => null,
      getListValueById: () => ({ id: 11, field_key: 'lighting', value: 'RGB LED', list_id: 4 }),
      getCandidateById: () => null,
      upsertListValue: () => {},
      renameListValueById: () => [],
      db: { prepare: () => ({ get: () => null, run: () => ({ changes: 0 }), all: () => [] }) },
    }),
    syncSyntheticCandidatesFromComponentReview: async () => {},
    resolveEnumMutationContext: (_specDb, _category, body, _opts) => ({
      field: body?.field || 'lighting',
      value: body?.value || 'RGB LED',
      oldValue: body?.oldValue || 'RGB Led',
      listValueId: body?.listValueId || 11,
      enumListId: body?.enumListId || 4,
    }),
    isMeaningfulValue: (v) => v != null && String(v).trim() !== '',
    normalizeLower: (v) => String(v || '').trim().toLowerCase(),
    candidateLooksReference: () => false,
    applySharedLaneState: () => ({}),
    getPendingEnumSharedCandidateIds: () => [],
    specDbCache: { delete: (cat) => { calls.specDbCacheDeleted.push(cat); } },
    storage: {},
    outputRoot: 'out',
    cascadeEnumChange: async (args) => { calls.cascade.push(args); },
    loadQueueState: async () => ({ state: { products: {} } }),
    saveQueueState: async () => ({ ok: true }),
    markEnumSuggestionStatus: async () => {},
    isReviewFieldPathEnabled: async () => true,
    broadcastWs: (...args) => { calls.broadcastWs.push(args); },
    ...overrides,
  };
  return { ctx, calls };
}

/* ------------------------------------------------------------------ */
/*  Route matching                                                      */
/* ------------------------------------------------------------------ */

describe('enum route handler — route matching', () => {
  it('returns false for non-review-components paths', async () => {
    const { ctx } = makeEnumCtx();
    strictEqual(await handleReviewEnumMutationRoute({
      parts: ['review', 'mouse', 'enum-override'], method: 'POST', req: {}, res: {}, context: ctx,
    }), false);
  });

  it('returns false for review-components without matching action', async () => {
    const { ctx } = makeEnumCtx();
    strictEqual(await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'unknown'], method: 'POST', req: {}, res: {}, context: ctx,
    }), false);
  });

  it('matches POST /review-components/{category}/enum-override', async () => {
    const { ctx } = makeEnumCtx({
      readJsonBody: async () => ({ action: 'add', field: 'lighting', value: 'RGB' }),
    });
    const result = await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    ok(result !== false);
  });

  it('matches POST /review-components/{category}/enum-rename', async () => {
    const { ctx } = makeEnumCtx({
      readJsonBody: async () => ({ newValue: 'New LED', listValueId: 11, field: 'lighting' }),
    });
    const result = await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-rename'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    ok(result !== false);
  });
});

/* ------------------------------------------------------------------ */
/*  Enum override input validation                                      */
/* ------------------------------------------------------------------ */

describe('enum route handler — override input validation', () => {
  it('responds 400 when field is empty', async () => {
    const { ctx, calls } = makeEnumCtx({
      readJsonBody: async () => ({ action: 'add', field: '', value: 'RGB' }),
      resolveEnumMutationContext: () => ({ field: '', value: 'RGB', listValueId: 11, enumListId: 4 }),
    });
    await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });

  it('responds 400 when value is empty', async () => {
    const { ctx, calls } = makeEnumCtx({
      readJsonBody: async () => ({ action: 'add', field: 'lighting', value: '' }),
      resolveEnumMutationContext: () => ({ field: 'lighting', value: '', listValueId: 11, enumListId: 4 }),
    });
    await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });
});

/* ------------------------------------------------------------------ */
/*  Consumer gate                                                       */
/* ------------------------------------------------------------------ */

describe('enum route handler — consumer gate', () => {
  it('responds 403 when review consumer disabled for enum override', async () => {
    const { ctx, calls } = makeEnumCtx({
      readJsonBody: async () => ({ action: 'add', field: 'lighting', value: 'RGB' }),
      isReviewFieldPathEnabled: async () => false,
    });
    await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 403);
    strictEqual(calls.jsonRes[0].body.error, 'review_consumer_disabled');
  });

  it('responds 403 when review consumer disabled for enum rename', async () => {
    const { ctx, calls } = makeEnumCtx({
      readJsonBody: async () => ({ newValue: 'New LED', listValueId: 11, field: 'lighting' }),
      isReviewFieldPathEnabled: async () => false,
    });
    await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-rename'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 403);
    strictEqual(calls.jsonRes[0].body.error, 'review_consumer_disabled');
  });
});

/* ------------------------------------------------------------------ */
/*  Enum rename validation                                              */
/* ------------------------------------------------------------------ */

describe('enum route handler — rename validation', () => {
  it('responds 400 when newValue is missing', async () => {
    const { ctx, calls } = makeEnumCtx({
      readJsonBody: async () => ({ listValueId: 11 }),
    });
    await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-rename'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });

  it('responds 400 when newValue is empty string', async () => {
    const { ctx, calls } = makeEnumCtx({
      readJsonBody: async () => ({ newValue: '  ', listValueId: 11 }),
    });
    await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-rename'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });

  it('responds 200 changed:false when rename to same value (case-insensitive)', async () => {
    const { ctx, calls } = makeEnumCtx({
      readJsonBody: async () => ({ newValue: 'RGB Led', listValueId: 11, field: 'lighting' }),
      resolveEnumMutationContext: () => ({ field: 'lighting', oldValue: 'RGB Led', value: 'RGB Led', listValueId: 11 }),
    });
    await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-rename'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    const resp = calls.jsonRes[0];
    strictEqual(resp.status, 200);
    strictEqual(resp.body.changed, false);
  });
});

/* ------------------------------------------------------------------ */
/*  Error wrapping                                                      */
/* ------------------------------------------------------------------ */

describe('enum route handler — error wrapping', () => {
  it('enum override SQL error responds 500', async () => {
    const { ctx, calls } = makeEnumCtx({
      readJsonBody: async () => ({ action: 'remove', field: 'lighting', value: 'RGB LED', listValueId: 11 }),
      resolveEnumMutationContext: () => ({ field: 'lighting', value: 'RGB LED', listValueId: 11, enumListId: 4 }),
      getSpecDbReady: async () => ({
        isSeeded: () => true,
        category: 'mouse',
        getListValueById: () => { throw new Error('db crash'); },
        getEnumList: () => ({ id: 4 }),
        getListValues: () => [],
        getCandidateById: () => null,
        db: { prepare: () => ({ get: () => null, run: () => { throw new Error('db crash'); } }) },
      }),
    });
    await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 500);
  });

  it('enum rename SQL error responds 500 enum_rename_specdb_write_failed', async () => {
    const { ctx, calls } = makeEnumCtx({
      readJsonBody: async () => ({ newValue: 'New LED', listValueId: 11, field: 'lighting' }),
      getSpecDbReady: async () => ({
        isSeeded: () => true,
        category: 'mouse',
        renameListValueById: () => { throw new Error('db crash'); },
        getEnumList: () => ({ id: 4 }),
        getListValues: () => [],
        getListValueById: () => ({ id: 11, field_key: 'lighting', value: 'RGB LED', list_id: 4 }),
        db: { prepare: () => ({ get: () => null, run: () => ({ changes: 0 }) }) },
      }),
    });
    await handleReviewEnumMutationRoute({
      parts: ['review-components', 'mouse', 'enum-rename'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 500);
    strictEqual(calls.jsonRes[0].body.error, 'enum_rename_specdb_write_failed');
  });
});

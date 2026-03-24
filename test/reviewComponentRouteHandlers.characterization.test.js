import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { handleReviewComponentMutationRoute } from '../src/features/review/api/componentMutationRoutes.js';

/* ------------------------------------------------------------------ */
/*  WHY: Characterization tests for component handler dispatch layer.   */
/*  Tests route matching, input validation, error wrapping. Deep        */
/*  specDb interactions covered by 27 service tests in                  */
/*  reviewComponentMutationService.characterization.test.js.            */
/* ------------------------------------------------------------------ */

function makeComponentCtx(overrides = {}) {
  const calls = { jsonRes: [], broadcastWs: [], cascade: [], specDbCacheDeleted: [] };
  const ctx = {
    readJsonBody: async () => ({}),
    jsonRes: (_res, status, body) => { calls.jsonRes.push({ status, body }); return { status, body }; },
    getSpecDbReady: async () => ({
      isSeeded: () => true,
      category: 'mouse',
      db: {
        prepare: () => ({
          get: () => null,
          run: () => ({ changes: 1 }),
          all: () => [],
        }),
      },
      getCandidateById: () => null,
      upsertComponentValue: () => ({ id: 1 }),
      insertAlias: () => {},
      updateAliasesOverridden: () => {},
      upsertReview: () => {},
      getComponentIdentity: () => null,
    }),
    syncSyntheticCandidatesFromComponentReview: async () => {},
    resolveComponentMutationContext: (_specDb, _category, body) => ({
      componentType: body?.componentType || 'sensor',
      componentName: body?.componentName || 'PMW3360',
      componentMaker: body?.componentMaker || 'PixArt',
      property: body?.property || 'dpi',
      componentValueId: body?.componentValueId || 1,
      componentIdentityId: body?.componentIdentityId || 5,
    }),
    isMeaningfulValue: (v) => v != null && String(v).trim() !== '',
    candidateLooksReference: () => false,
    normalizeLower: (v) => String(v || '').trim().toLowerCase(),
    buildComponentIdentifier: (type, name, maker) => `${type}::${name}::${maker}`,
    applySharedLaneState: () => ({}),
    cascadeComponentChange: async (args) => { calls.cascade.push(args); },
    outputRoot: 'out',
    storage: {},
    loadQueueState: async () => ({ state: { products: {} } }),
    saveQueueState: async () => ({ ok: true }),
    remapPendingComponentReviewItemsForNameChange: async () => {},
    specDbCache: { delete: (cat) => { calls.specDbCacheDeleted.push(cat); } },
    broadcastWs: (...args) => { calls.broadcastWs.push(args); },
    getPendingComponentSharedCandidateIdsAsync: async () => [],
    ...overrides,
  };
  return { ctx, calls };
}

/* ------------------------------------------------------------------ */
/*  Route matching                                                      */
/* ------------------------------------------------------------------ */

describe('component route handler — route matching', () => {
  it('returns false for non-review-components paths', async () => {
    const { ctx } = makeComponentCtx();
    strictEqual(await handleReviewComponentMutationRoute({
      parts: ['review', 'mouse', 'component-override'], method: 'POST', req: {}, res: {}, context: ctx,
    }), false);
  });

  it('returns false for review-components without matching action', async () => {
    const { ctx } = makeComponentCtx();
    strictEqual(await handleReviewComponentMutationRoute({
      parts: ['review-components', 'mouse', 'unknown'], method: 'POST', req: {}, res: {}, context: ctx,
    }), false);
  });

  it('matches POST /review-components/{category}/component-override', async () => {
    const { ctx } = makeComponentCtx({
      readJsonBody: async () => ({ property: 'dpi', value: '16000', componentValueId: 1 }),
    });
    const result = await handleReviewComponentMutationRoute({
      parts: ['review-components', 'mouse', 'component-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    ok(result !== false);
  });

  it('matches POST /review-components/{category}/component-key-review-confirm', async () => {
    const { ctx } = makeComponentCtx({
      readJsonBody: async () => ({ candidateId: 'ref_c1', property: 'dpi', componentValueId: 1 }),
    });
    const result = await handleReviewComponentMutationRoute({
      parts: ['review-components', 'mouse', 'component-key-review-confirm'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    ok(result !== false);
  });
});

/* ------------------------------------------------------------------ */
/*  Component override input validation                                 */
/* ------------------------------------------------------------------ */

describe('component route handler — override input validation', () => {
  it('responds 400 when context resolution fails', async () => {
    const { ctx, calls } = makeComponentCtx({
      readJsonBody: async () => ({ property: 'dpi', value: '16000' }),
      resolveComponentMutationContext: () => ({
        error: 'component_not_found',
        errorMessage: 'Component not found.',
      }),
    });
    await handleReviewComponentMutationRoute({
      parts: ['review-components', 'mouse', 'component-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });

  it('identity operations respond 400 when componentIdentityId is missing', async () => {
    const { ctx, calls } = makeComponentCtx({
      readJsonBody: async () => ({ property: '__aliases', value: ['alias1'] }),
      resolveComponentMutationContext: () => ({
        componentType: 'sensor',
        componentName: 'PMW3360',
        componentMaker: 'PixArt',
        property: '__aliases',
        componentValueId: 1,
        componentIdentityId: null,
      }),
    });
    await handleReviewComponentMutationRoute({
      parts: ['review-components', 'mouse', 'component-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    strictEqual(calls.jsonRes[0].status, 400);
  });
});

/* ------------------------------------------------------------------ */
/*  Error wrapping (handler-level: getSpecDbReady failure)              */
/* ------------------------------------------------------------------ */

describe('component route handler — error wrapping', () => {
  it('component override with specDb not ready responds with error', async () => {
    const { ctx, calls } = makeComponentCtx({
      readJsonBody: async () => ({ property: 'dpi', value: '16000', componentValueId: 1 }),
      getSpecDbReady: async () => null,
    });
    await handleReviewComponentMutationRoute({
      parts: ['review-components', 'mouse', 'component-override'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    ok(calls.jsonRes.length >= 1, 'responds with error');
    ok(calls.jsonRes[0].status >= 400, 'error status code');
  });

  it('key-review-confirm with specDb not ready responds with error', async () => {
    const { ctx, calls } = makeComponentCtx({
      readJsonBody: async () => ({ candidateId: 'ref_c1', property: 'dpi', componentValueId: 1 }),
      getSpecDbReady: async () => null,
    });
    await handleReviewComponentMutationRoute({
      parts: ['review-components', 'mouse', 'component-key-review-confirm'], method: 'POST', req: {}, res: {}, context: ctx,
    });
    ok(calls.jsonRes.length >= 1, 'responds with error');
    ok(calls.jsonRes[0].status >= 400, 'error status code');
  });
});

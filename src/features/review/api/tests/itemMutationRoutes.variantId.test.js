// Per-variant override wiring + trust-boundary validation.
// itemMutationRoutes.js must forward variantId into both candidate overrides
// and SQL-first manual overrides, while itemMutationService.js rejects:
//   - variant-dependent field without variantId
//   - scalar field with variantId
//   - override of any variantGenerator field (colors, editions)

import test from 'node:test';
import assert from 'node:assert/strict';

import { handleReviewItemMutationRoute } from '../itemMutationRoutes.js';
import {
  makeItemRouteHarness,
  makeSeededRuntimeSpecDb,
} from './fixtures/reviewMutationRouteBuilders.js';

function makeVariantAwareSpecDb({ variantDependentFields = [], insertCalls, extra = {} }) {
  const vdSet = new Set(variantDependentFields);
  return makeSeededRuntimeSpecDb({
    getCompiledRules: () => ({
      fields: Object.fromEntries(
        [...vdSet].map((key) => [key, { type: 'string', variant_dependent: true }]),
      ),
    }),
    insertFieldCandidate: (args) => { insertCalls?.push(args); },
    getFieldCandidateBySourceIdAndVariant: () => ({ id: 99 }),
    replaceFieldCandidateEvidence: () => {},
    demoteResolvedCandidates: () => {},
    markFieldCandidateResolved: () => {},
    getFieldCandidatesByProductAndField: () => [],
    getFieldCandidatesByValue: () => [],
    upsertFieldCandidate: () => {},
    ...extra,
  });
}

test('variant-dependent field + no variantId → 400 variant_id_required', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: '2025-06-01', itemFieldStateId: 1 }),
    getSpecDb: () => makeVariantAwareSpecDb({ variantDependentFields: ['release_date'] }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-foo-bar', field_key: 'release_date' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'variant_id_required');
});

test('scalar field + variantId → 400 variant_id_not_allowed', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: '85g', variantId: 'v_black', itemFieldStateId: 1 }),
    getSpecDb: () => makeVariantAwareSpecDb({ variantDependentFields: [] }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-foo-bar', field_key: 'weight' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'variant_id_not_allowed');
});

test('colors field override attempt → 400 override_not_allowed', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: 'blue', itemFieldStateId: 1 }),
    getSpecDb: () => makeVariantAwareSpecDb({ variantDependentFields: [] }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-foo-bar', field_key: 'colors' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'override_not_allowed');
});

test('editions field override attempt → 400 override_not_allowed', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: 'limited', itemFieldStateId: 1 }),
    getSpecDb: () => makeVariantAwareSpecDb({ variantDependentFields: [] }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-foo-bar', field_key: 'editions' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'override_not_allowed');
});

test('variant-dependent field + variantId → 200 and inserts a variant-scoped manual override row', async () => {
  const insertCalls = [];
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: '2025-06-01', variantId: 'v_black', itemFieldStateId: 1 }),
    getSpecDb: () => makeVariantAwareSpecDb({ variantDependentFields: ['release_date'], insertCalls }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-foo-bar', field_key: 'release_date' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 200);
  assert.equal(calls.responses[0]?.body?.ok, true);
  assert.equal(insertCalls.length, 1, 'manual override must be projected into field_candidates');
  assert.equal(insertCalls[0]?.fieldKey, 'release_date');
  assert.equal(insertCalls[0]?.sourceType, 'manual_override');
  assert.equal(insertCalls[0]?.status, 'resolved');
  assert.equal(insertCalls[0]?.variantId, 'v_black');
});

test('candidate-override mode (not manual): variantId also forwards for variant-dependent', async () => {
  const insertCalls = [];
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({
      candidateId: 'ref_c1',
      value: '2025-06-01',
      variantId: 'v_white',
      itemFieldStateId: 1,
    }),
    getSpecDb: () => makeVariantAwareSpecDb({ variantDependentFields: ['release_date'], insertCalls }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-foo-bar', field_key: 'release_date' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 200);
  assert.equal(insertCalls[0]?.variantId, 'v_white', 'candidate override also forwards variantId');
});

test('scalar field + no variantId → 200 and inserts a scalar manual override row', async () => {
  const insertCalls = [];
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: '85g', itemFieldStateId: 1 }),
    getSpecDb: () => makeVariantAwareSpecDb({ variantDependentFields: [], insertCalls }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-foo-bar', field_key: 'weight' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 200);
  assert.equal(insertCalls.length, 1, 'manual override must be projected into field_candidates');
  assert.equal(insertCalls[0]?.fieldKey, 'weight');
  assert.equal(insertCalls[0]?.sourceType, 'manual_override');
  assert.equal(insertCalls[0]?.status, 'resolved');
  assert.equal(insertCalls[0]?.variantId, null);
});

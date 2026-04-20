// RED (WS-3 endpoint): POST /review/{category}/clear-published.
// Scope rules:
//   variant-dependent field + variantId         → variant-single clear
//   variant-dependent field + allVariants:true  → variant-all clear
//   scalar field (no variantId, no allVariants) → scalar clear
//   mutually exclusive: variantId + allVariants → 400
//   mismatch: scalar + variantId or allVariants → 400
//   mismatch: variant-dependent without scope   → 400
//
// Also verifies the data-change event registration.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { handleReviewItemMutationRoute } from '../itemMutationRoutes.js';
import {
  makeItemRouteHarness,
  makeSeededRuntimeSpecDb,
} from './fixtures/reviewMutationRouteBuilders.js';
import { DATA_CHANGE_EVENT_NAMES } from '../../../../core/events/dataChangeContract.js';

test('review-clear-published event is registered in DATA_CHANGE_EVENT_NAMES', () => {
  assert.ok(
    DATA_CHANGE_EVENT_NAMES.includes('review-clear-published'),
    'event name must be registered in DATA_CHANGE_EVENT_DOMAIN_MAP',
  );
});

function makeClearSpecDb({ variantDependentFields = [] } = {}) {
  const vdSet = new Set(variantDependentFields);
  return makeSeededRuntimeSpecDb({
    getCompiledRules: () => ({
      fields: Object.fromEntries(
        [...vdSet].map((key) => [key, { type: 'string', variant_dependent: true }]),
      ),
    }),
    getFieldCandidatesByProductAndField: () => [],
    demoteResolvedCandidates: () => {},
    upsertFieldCandidate: () => {},
  });
}

function withTempProductRoot(productId, productJson, fn) {
  const root = path.join('.tmp', `_test_clear_ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const productDir = path.join(root, productId);
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'product.json'), JSON.stringify(productJson, null, 2));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('variant-dependent + variantId → 200, scope=variant-single, broadcast review-clear-published', async () => {
  const productJson = {
    schema_version: 2, product_id: 'mouse-001', category: 'mouse',
    fields: {}, variant_fields: { v_black: { release_date: { value: '2025-11-11', source: 'pipeline' } } },
    candidates: {},
  };

  await withTempProductRoot('mouse-001', productJson, async () => {
    const broadcasts = [];
    const { calls, context } = makeItemRouteHarness({
      readJsonBody: async () => ({ productId: 'mouse-001', field: 'release_date', variantId: 'v_black' }),
      getSpecDb: () => makeClearSpecDb({ variantDependentFields: ['release_date'] }),
      resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'release_date' } }),
      broadcastWs: (type, payload) => { broadcasts.push({ type, payload }); },
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'clear-published'],
      method: 'POST',
      req: {}, res: {}, context,
    });

    assert.equal(calls.responses[0]?.status, 200);
    assert.equal(calls.responses[0]?.body?.ok, true);
    const bc = broadcasts.find((b) => b.type === 'data-change');
    assert.equal(bc?.payload?.event, 'review-clear-published');
    assert.equal(bc?.payload?.meta?.variantId, 'v_black');
    assert.equal(bc?.payload?.meta?.field, 'release_date');
  });
});

test('variant-dependent + allVariants:true → 200, scope=variant-all', async () => {
  const productJson = {
    schema_version: 2, product_id: 'mouse-001', category: 'mouse',
    fields: {}, variant_fields: { v_black: { release_date: { value: 'x', source: 'pipeline' } } },
    candidates: {},
  };

  await withTempProductRoot('mouse-001', productJson, async () => {
    const broadcasts = [];
    const { calls, context } = makeItemRouteHarness({
      readJsonBody: async () => ({ productId: 'mouse-001', field: 'release_date', allVariants: true }),
      getSpecDb: () => makeClearSpecDb({ variantDependentFields: ['release_date'] }),
      resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'release_date' } }),
      broadcastWs: (type, payload) => { broadcasts.push({ type, payload }); },
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'clear-published'],
      method: 'POST',
      req: {}, res: {}, context,
    });

    assert.equal(calls.responses[0]?.status, 200);
    const bc = broadcasts.find((b) => b.type === 'data-change');
    assert.equal(bc?.payload?.event, 'review-clear-published');
    assert.equal(bc?.payload?.meta?.allVariants, true);
  });
});

test('scalar field (no variantId, no allVariants) → 200, scope=scalar', async () => {
  const productJson = {
    schema_version: 2, product_id: 'mouse-001', category: 'mouse',
    fields: { weight: { value: 58, source: 'pipeline' } }, variant_fields: {},
    candidates: {},
  };

  await withTempProductRoot('mouse-001', productJson, async () => {
    const { calls, context } = makeItemRouteHarness({
      readJsonBody: async () => ({ productId: 'mouse-001', field: 'weight' }),
      getSpecDb: () => makeClearSpecDb({ variantDependentFields: [] }),
      resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'weight' } }),
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'clear-published'],
      method: 'POST',
      req: {}, res: {}, context,
    });

    assert.equal(calls.responses[0]?.status, 200);
  });
});

test('variant-dependent + no scope → 400 variant_clear_scope_required', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ productId: 'mouse-001', field: 'release_date' }),
    getSpecDb: () => makeClearSpecDb({ variantDependentFields: ['release_date'] }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'release_date' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'clear-published'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'variant_clear_scope_required');
});

test('scalar + variantId → 400 variant_id_not_allowed', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ productId: 'mouse-001', field: 'weight', variantId: 'v_black' }),
    getSpecDb: () => makeClearSpecDb({ variantDependentFields: [] }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'weight' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'clear-published'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'variant_id_not_allowed');
});

test('scalar + allVariants:true → 400 all_variants_not_allowed', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ productId: 'mouse-001', field: 'weight', allVariants: true }),
    getSpecDb: () => makeClearSpecDb({ variantDependentFields: [] }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'weight' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'clear-published'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'all_variants_not_allowed');
});

test('variantId + allVariants both set → 400 variant_clear_scope_conflict', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ productId: 'mouse-001', field: 'release_date', variantId: 'v_black', allVariants: true }),
    getSpecDb: () => makeClearSpecDb({ variantDependentFields: ['release_date'] }),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'release_date' } }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'clear-published'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'variant_clear_scope_conflict');
});

/**
 * POST /review/{category}/delete-variant-field — per-variant full wipe for one field.
 *
 * Contract:
 *   - Requires a non-empty variantId string → 400 invalid_variant_id otherwise.
 *   - Requires resolvable productId + field via resolveItemFieldMutationRequest.
 *   - Calls specDb.demoteResolvedCandidates(pid, field, vid) then
 *     specDb.deleteFieldCandidatesByProductFieldVariant(pid, field, vid).
 *   - Removes variant_fields[vid][field] from product.json (and prunes the
 *     variant entry entirely when it becomes empty).
 *   - Emits data-change event 'review-variant-field-deleted'.
 *   - Idempotent when nothing exists to delete (still returns 200).
 */

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

test('review-variant-field-deleted event is registered in DATA_CHANGE_EVENT_NAMES', () => {
  assert.ok(
    DATA_CHANGE_EVENT_NAMES.includes('review-variant-field-deleted'),
    'new event name must be registered in DATA_CHANGE_EVENT_DOMAIN_MAP',
  );
});

function makeDeleteSpecDb({ variantDependentFields = ['release_date'] } = {}) {
  const demoteCalls = [];
  const deleteCalls = [];
  const specDb = makeSeededRuntimeSpecDb({
    getCompiledRules: () => ({
      fields: Object.fromEntries(
        variantDependentFields.map((key) => [key, { type: 'string', variant_dependent: true }]),
      ),
    }),
    getFieldCandidatesByProductAndField: () => [],
    demoteResolvedCandidates: (pid, fk, vid) => { demoteCalls.push({ pid, fk, vid }); },
    deleteFieldCandidatesByProductFieldVariant: (pid, fk, vid) => { deleteCalls.push({ pid, fk, vid }); },
    upsertFieldCandidate: () => {},
  });
  specDb._test = { demoteCalls, deleteCalls };
  return specDb;
}

async function withTempProductRoot(productId, productJson, fn) {
  const root = path.join('.tmp', `_test_delete_variant_field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const productDir = path.join(root, productId);
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'product.json'), JSON.stringify(productJson, null, 2));
  try {
    // WHY: await the async callback so finally doesn't delete the temp dir
    // before the callback's fs.readFileSync reads back the route's mutation.
    return await fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('happy path: demote + delete + strip variant_fields entry + broadcast', async () => {
  const productJson = {
    schema_version: 2, product_id: 'mouse-001', category: 'mouse',
    fields: {},
    variant_fields: {
      v_black: { release_date: { value: '2025-11-11', source: 'pipeline' }, sku: { value: 'R-B', source: 'pipeline' } },
      v_white: { release_date: { value: '2025-12-01', source: 'pipeline' } },
    },
    candidates: {},
  };

  await withTempProductRoot('mouse-001', productJson, async (root) => {
    const broadcasts = [];
    const specDb = makeDeleteSpecDb();
    const { calls, context } = makeItemRouteHarness({
      readJsonBody: async () => ({ productId: 'mouse-001', field: 'release_date', variantId: 'v_black' }),
      getSpecDb: () => specDb,
      resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'release_date' } }),
      broadcastWs: (type, payload) => { broadcasts.push({ type, payload }); },
      productRoot: root,
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'delete-variant-field'],
      method: 'POST',
      req: {}, res: {}, context,
    });

    // 200 OK + payload shape
    assert.equal(calls.responses[0]?.status, 200);
    assert.equal(calls.responses[0]?.body?.ok, true);
    assert.equal(calls.responses[0]?.body?.status, 'deleted');
    assert.equal(calls.responses[0]?.body?.field, 'release_date');
    assert.equal(calls.responses[0]?.body?.variantId, 'v_black');
    assert.equal(calls.responses[0]?.body?.json_changed, true);

    // DB side: both demote + delete called with the full triplet
    assert.deepEqual(specDb._test.demoteCalls, [{ pid: 'mouse-001', fk: 'release_date', vid: 'v_black' }]);
    assert.deepEqual(specDb._test.deleteCalls, [{ pid: 'mouse-001', fk: 'release_date', vid: 'v_black' }]);

    // JSON side: v_black.release_date gone; v_black.sku preserved; v_white untouched
    const updated = JSON.parse(fs.readFileSync(path.join(root, 'mouse-001', 'product.json'), 'utf8'));
    assert.equal(updated.variant_fields?.v_black?.release_date, undefined, 'release_date cleared from v_black');
    assert.ok(updated.variant_fields?.v_black?.sku, 'sibling field on same variant preserved');
    assert.ok(updated.variant_fields?.v_white?.release_date, 'other variants untouched');

    // Event emitted with variantId in meta
    const bc = broadcasts.find((b) => b.type === 'data-change');
    assert.ok(bc, 'data-change broadcast emitted');
    assert.equal(bc.payload?.event, 'review-variant-field-deleted');
    assert.equal(bc.payload?.meta?.variantId, 'v_black');
    assert.equal(bc.payload?.meta?.field, 'release_date');
  });
});

test('solo field: pruning empties variant_fields[vid] entirely', async () => {
  const productJson = {
    schema_version: 2, product_id: 'mouse-001', category: 'mouse',
    fields: {},
    variant_fields: { v_black: { release_date: { value: '2025-11-11', source: 'pipeline' } } },
    candidates: {},
  };

  await withTempProductRoot('mouse-001', productJson, async (root) => {
    const { context } = makeItemRouteHarness({
      readJsonBody: async () => ({ productId: 'mouse-001', field: 'release_date', variantId: 'v_black' }),
      getSpecDb: () => makeDeleteSpecDb(),
      resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'release_date' } }),
      broadcastWs: () => {},
      productRoot: root,
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'delete-variant-field'],
      method: 'POST',
      req: {}, res: {}, context,
    });

    const updated = JSON.parse(fs.readFileSync(path.join(root, 'mouse-001', 'product.json'), 'utf8'));
    assert.equal(updated.variant_fields?.v_black, undefined, 'empty variant_fields entry pruned');
  });
});

test('idempotent: nothing to delete → 200 with json_changed=false', async () => {
  const productJson = {
    schema_version: 2, product_id: 'mouse-001', category: 'mouse',
    fields: {},
    variant_fields: { v_black: { sku: { value: 'R-B', source: 'pipeline' } } }, // no release_date to delete
    candidates: {},
  };

  await withTempProductRoot('mouse-001', productJson, async (root) => {
    const specDb = makeDeleteSpecDb();
    const { calls, context } = makeItemRouteHarness({
      readJsonBody: async () => ({ productId: 'mouse-001', field: 'release_date', variantId: 'v_black' }),
      getSpecDb: () => specDb,
      resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'release_date' } }),
      broadcastWs: () => {},
      productRoot: root,
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'delete-variant-field'],
      method: 'POST',
      req: {}, res: {}, context,
    });

    assert.equal(calls.responses[0]?.status, 200, 'no-op still returns 200');
    assert.equal(calls.responses[0]?.body?.json_changed, false, 'json_changed=false when nothing was in JSON');
    // DB calls still fire (safe on empty tables — idempotent at DB level too)
    assert.equal(specDb._test.demoteCalls.length, 1);
    assert.equal(specDb._test.deleteCalls.length, 1);
  });
});

test('missing variantId → 400 invalid_variant_id (no DB/JSON mutation)', async () => {
  const specDb = makeDeleteSpecDb();
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ productId: 'mouse-001', field: 'release_date' }), // no variantId
    getSpecDb: () => specDb,
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'release_date' } }),
    broadcastWs: () => {},
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'delete-variant-field'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'invalid_variant_id');
  // No DB calls — short-circuited before any mutation
  assert.equal(specDb._test.demoteCalls.length, 0);
  assert.equal(specDb._test.deleteCalls.length, 0);
});

test('empty variantId string → 400', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ productId: 'mouse-001', field: 'release_date', variantId: '' }),
    getSpecDb: () => makeDeleteSpecDb(),
    resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-001', field_key: 'release_date' } }),
    broadcastWs: () => {},
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'delete-variant-field'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'invalid_variant_id');
});

test('missing productId → 400 (routed through resolveItemFieldMutationRequest)', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ field: 'release_date', variantId: 'v_black' }), // no productId
    getSpecDb: () => makeDeleteSpecDb(),
    resolveGridFieldStateForMutation: () => ({ row: null }),
    broadcastWs: () => {},
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'delete-variant-field'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
});

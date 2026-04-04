import test from 'node:test';
import assert from 'node:assert/strict';

import { handleReviewItemMutationRoute } from '../itemMutationRoutes.js';
import { handleReviewComponentMutationRoute } from '../componentMutationRoutes.js';
import { handleReviewEnumMutationRoute } from '../enumMutationRoutes.js';
import {
  makeComponentMutationContext,
  makeComponentRouteHarness,
  makeEnumMutationContext,
  makeEnumRouteHarness,
  makeItemRouteHarness,
  makeSeededRuntimeSpecDb,
} from './fixtures/reviewMutationRouteBuilders.js';

test('review item override returns the public success envelope', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ candidateId: 'ref_c1', itemFieldStateId: 1 }),
  });

  const handled = await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'override'],
    method: 'POST',
    req: {},
    res: {},
    context,
  });

  assert.equal(handled, true);
  assert.equal(calls.responses[0]?.status, 200);
  assert.equal(calls.responses[0]?.body?.ok, true);
  assert.equal(calls.responses[0]?.body?.result?.candidate_id, 'ref_c1');
});

test('review item manual override rejects empty values via the response contract', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: '   ', itemFieldStateId: 1 }),
  });

  const handled = await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {},
    res: {},
    context,
  });

  assert.equal(handled, true);
  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'value_required');
});

[
  {
    name: 'review override failures surface override_failed',
    parts: ['review', 'mouse', 'override'],
    body: { candidateId: 'ref_c1', itemFieldStateId: 1 },
    overrides: {
      getSpecDb: () => makeSeededRuntimeSpecDb(),
      resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-foo-bar', field_key: 'weight' } }),
      setOverrideFromCandidate: async () => { throw new Error('db down'); },
    },
    error: 'override_failed',
  },
  {
    name: 'review manual override failures surface manual_override_failed',
    parts: ['review', 'mouse', 'manual-override'],
    body: { value: '85g', itemFieldStateId: 1 },
    overrides: {
      getSpecDb: () => makeSeededRuntimeSpecDb(),
      resolveGridFieldStateForMutation: () => ({ row: { product_id: 'mouse-foo-bar', field_key: 'weight' } }),
      setManualOverride: async () => { throw new Error('db down'); },
    },
    error: 'manual_override_failed',
  },
  {
    name: 'review confirm failures surface confirm_failed',
    parts: ['review', 'mouse', 'key-review-confirm'],
    body: { lane: 'primary', candidateId: 'ref_c1' },
    overrides: {
      getSpecDb: () => makeSeededRuntimeSpecDb(),
      resolveKeyReviewForLaneMutation: () => { throw new Error('boom'); },
    },
    error: 'confirm_failed',
  },
  {
    name: 'review accept failures surface accept_failed',
    parts: ['review', 'mouse', 'key-review-accept'],
    body: { lane: 'primary', candidateId: 'ref_c1' },
    overrides: {
      getSpecDb: () => makeSeededRuntimeSpecDb(),
      resolveKeyReviewForLaneMutation: () => { throw new Error('boom'); },
    },
    error: 'accept_failed',
  },
].forEach(({ name, parts, body, overrides, error }) => {
  test(name, async () => {
    const { calls, context } = makeItemRouteHarness({
      readJsonBody: async () => body,
      ...overrides,
    });

    const handled = await handleReviewItemMutationRoute({
      parts,
      method: 'POST',
      req: {},
      res: {},
      context,
    });

    assert.equal(handled, true);
    assert.equal(calls.responses[0]?.status, 500);
    assert.equal(calls.responses[0]?.body?.error, error);
  });
});

test('component override returns the public success envelope', async () => {
  const runtimeSpecDb = makeSeededRuntimeSpecDb({
    getKeyReviewState: () => null,
  });
  const { calls, context } = makeComponentRouteHarness({
    readJsonBody: async () => ({ property: 'dpi', value: '16000', componentValueId: 1 }),
    getSpecDbReady: async () => runtimeSpecDb,
  });

  const handled = await handleReviewComponentMutationRoute({
    parts: ['review-components', 'mouse', 'component-override'],
    method: 'POST',
    req: {},
    res: {},
    context,
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 200);
  assert.equal(calls.responses[0]?.body?.ok, true);
  assert.equal(calls.responses[0]?.body?.sql_only, true);
});

test('component override validates missing identity ids through the response contract', async () => {
  const { calls, context } = makeComponentRouteHarness({
    readJsonBody: async () => ({ property: '__aliases', value: ['alias-1'] }),
    resolveComponentMutationContext: () => makeComponentMutationContext({
      property: '__aliases',
      componentIdentityId: null,
    }),
  });

  const handled = await handleReviewComponentMutationRoute({
    parts: ['review-components', 'mouse', 'component-override'],
    method: 'POST',
    req: {},
    res: {},
    context,
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'component_identity_id_required');
});

test('component override failures surface component_override_specdb_write_failed', async () => {
  const { calls, context } = makeComponentRouteHarness({
    readJsonBody: async () => ({ property: 'dpi', value: '16000', componentValueId: 1 }),
    getSpecDbReady: async () => makeSeededRuntimeSpecDb({
      getKeyReviewState: () => null,
      upsertComponentValue: () => { throw new Error('db crash'); },
    }),
  });

  const handled = await handleReviewComponentMutationRoute({
    parts: ['review-components', 'mouse', 'component-override'],
    method: 'POST',
    req: {},
    res: {},
    context,
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 500);
  assert.equal(calls.responses[0]?.body?.error, 'component_override_specdb_write_failed');
});

test('component key review confirm failures surface component_key_review_confirm_failed', async () => {
  const { calls, context } = makeComponentRouteHarness({
    readJsonBody: async () => ({ property: 'dpi', candidateId: 'ref_c1', componentValueId: 1 }),
    getSpecDbReady: async () => makeSeededRuntimeSpecDb({
      getKeyReviewState: () => null,
      upsertReview: () => { throw new Error('db crash'); },
    }),
  });

  const handled = await handleReviewComponentMutationRoute({
    parts: ['review-components', 'mouse', 'component-key-review-confirm'],
    method: 'POST',
    req: {},
    res: {},
    context,
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 500);
  assert.equal(calls.responses[0]?.body?.error, 'component_key_review_confirm_failed');
});

test('enum override rejects disabled review consumers through the response contract', async () => {
  const { calls, context } = makeEnumRouteHarness({
    readJsonBody: async () => ({ action: 'confirm', listValueId: 11, enumListId: 4, candidateId: 'cand-1' }),
    resolveEnumMutationContext: () => makeEnumMutationContext({
      field: 'lighting',
      value: 'RGB LED',
      oldValue: 'RGB LED',
      listValueId: 11,
    }),
    isReviewFieldPathEnabled: async () => false,
  });

  const handled = await handleReviewEnumMutationRoute({
    parts: ['review-components', 'mouse', 'enum-override'],
    method: 'POST',
    req: {},
    res: {},
    context,
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 403);
  assert.equal(calls.responses[0]?.body?.error, 'review_consumer_disabled');
});

test('enum rename returns changed:false when the new value only differs by casing', async () => {
  const { calls, context } = makeEnumRouteHarness({
    readJsonBody: async () => ({ newValue: 'RGB Led', listValueId: 11, field: 'lighting' }),
    resolveEnumMutationContext: () => makeEnumMutationContext({
      field: 'lighting',
      oldValue: 'RGB Led',
      value: 'RGB Led',
      listValueId: 11,
    }),
  });

  const handled = await handleReviewEnumMutationRoute({
    parts: ['review-components', 'mouse', 'enum-rename'],
    method: 'POST',
    req: {},
    res: {},
    context,
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 200);
  assert.equal(calls.responses[0]?.body?.changed, false);
});

test('enum override failures surface enum_override_specdb_write_failed', async () => {
  const { calls, context } = makeEnumRouteHarness({
    readJsonBody: async () => ({ action: 'remove', field: 'lighting', value: 'RGB LED', listValueId: 11 }),
    getSpecDbReady: async () => makeSeededRuntimeSpecDb({
      getProductsByListValueId: () => [],
      deleteListValueById: () => { throw new Error('db crash'); },
    }),
    resolveEnumMutationContext: () => makeEnumMutationContext({
      field: 'lighting',
      value: 'RGB LED',
      oldValue: 'RGB LED',
      listValueId: 11,
    }),
  });

  const handled = await handleReviewEnumMutationRoute({
    parts: ['review-components', 'mouse', 'enum-override'],
    method: 'POST',
    req: {},
    res: {},
    context,
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 500);
  assert.equal(calls.responses[0]?.body?.error, 'enum_override_specdb_write_failed');
});

test('enum rename failures surface enum_rename_specdb_write_failed', async () => {
  const { calls, context } = makeEnumRouteHarness({
    readJsonBody: async () => ({ newValue: 'New LED', listValueId: 11, field: 'lighting' }),
    getSpecDbReady: async () => makeSeededRuntimeSpecDb({
      renameListValueById: () => { throw new Error('db crash'); },
    }),
    resolveEnumMutationContext: () => makeEnumMutationContext({
      field: 'lighting',
      oldValue: 'RGB LED',
      value: 'RGB LED',
      listValueId: 11,
    }),
  });

  const handled = await handleReviewEnumMutationRoute({
    parts: ['review-components', 'mouse', 'enum-rename'],
    method: 'POST',
    req: {},
    res: {},
    context,
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 500);
  assert.equal(calls.responses[0]?.body?.error, 'enum_rename_specdb_write_failed');
});

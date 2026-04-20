// Characterization: pin the scalar manual-override POST happy path
// (broadcast event, envelope shape, body destructure) BEFORE WS-1 adds
// variantId wiring at itemMutationRoutes.js:40, 65-79, 101-115.
//
// This locks "existing scalar override must keep working" — variantId is
// additive-optional, not a replacement.

import test from 'node:test';
import assert from 'node:assert/strict';

import { handleReviewItemMutationRoute } from '../itemMutationRoutes.js';
import {
  makeItemRouteHarness,
  makeSeededRuntimeSpecDb,
} from './fixtures/reviewMutationRouteBuilders.js';

test('manual-override: broadcast event is review-manual-override', async () => {
  const broadcasts = [];
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: '85g', reason: 'spec sheet', reviewer: 'chris', itemFieldStateId: 1 }),
    broadcastWs: (type, payload) => { broadcasts.push({ type, payload }); },
  });

  const handled = await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(handled, true);
  assert.equal(calls.responses[0]?.status, 200);
  assert.equal(calls.responses[0]?.body?.ok, true);
  // Broadcast fires with event type 'review-manual-override'
  const dataChange = broadcasts.find((b) => b.type === 'data-change');
  assert.ok(dataChange, 'data-change broadcast emitted');
  assert.equal(dataChange.payload.event, 'review-manual-override');
});

test('manual-override: envelope carries result object from submitCandidate', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: '85g', itemFieldStateId: 1 }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  const body = calls.responses[0]?.body;
  assert.equal(body?.ok, true);
  assert.ok(body?.result, 'envelope includes result');
  // result is the submitCandidate return value: {status, candidateId, value, validationResult, ...}
  assert.ok(Object.hasOwn(body.result, 'status'), 'result has status');
});

test('candidate override (not manual): broadcast event is review-override, envelope includes result', async () => {
  const broadcasts = [];
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ candidateId: 'ref_c1', value: '85g', itemFieldStateId: 1 }),
    broadcastWs: (type, payload) => { broadcasts.push({ type, payload }); },
  });

  const handled = await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(handled, true);
  assert.equal(calls.responses[0]?.status, 200);
  const dataChange = broadcasts.find((b) => b.type === 'data-change');
  assert.equal(dataChange?.payload?.event, 'review-override');
});

test('manual-override: empty value returns 400 value_required (pre-submit guard)', async () => {
  const { calls, context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: '', itemFieldStateId: 1 }),
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(calls.responses[0]?.status, 400);
  assert.equal(calls.responses[0]?.body?.error, 'value_required');
});

test('broadcast payload carries productId + field in meta (broadcastExtra)', async () => {
  const broadcasts = [];
  const { context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: '85g', itemFieldStateId: 1 }),
    broadcastWs: (type, payload) => { broadcasts.push({ type, payload }); },
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  const dataChange = broadcasts.find((b) => b.type === 'data-change');
  const meta = dataChange?.payload?.meta || {};
  assert.ok(meta.productId, 'meta.productId present');
  assert.ok(meta.field, 'meta.field present');
});

test('manual override does NOT insert into field_candidates (user input ≠ extraction)', async () => {
  // WHY: Manual overrides are user input and live only in product.json. They
  // must not pollute field_candidates; that table is reserved for pipeline /
  // LLM-extracted candidates + their evidence. See writeManualOverride.test.js.
  const insertCalls = [];
  const specDb = makeSeededRuntimeSpecDb({
    getCompiledRules: () => ({ fields: { weight: { type: 'number' } } }),
    insertFieldCandidate: (args) => { insertCalls.push(args); },
  });
  const { context } = makeItemRouteHarness({
    readJsonBody: async () => ({ value: '85g', itemFieldStateId: 1 }),
    getSpecDb: () => specDb,
  });

  await handleReviewItemMutationRoute({
    parts: ['review', 'mouse', 'manual-override'],
    method: 'POST',
    req: {}, res: {}, context,
  });

  assert.equal(insertCalls.length, 0, 'manual override must bypass field_candidates entirely');
});

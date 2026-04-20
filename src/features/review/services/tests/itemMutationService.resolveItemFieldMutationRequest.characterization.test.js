// Characterization: pin the current validator behavior at
// itemMutationService.js:6-43 BEFORE WS-1 adds variant-dependent /
// colors-editions validation branches. These tests must remain green
// as new validation is layered in.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveItemFieldMutationRequest,
  buildManualOverrideEvidence,
  resolveItemOverrideMode,
} from '../itemMutationService.js';

function makeDeps({ fieldStateCtx, specDbStub = {} } = {}) {
  return {
    getSpecDb: () => specDbStub,
    resolveGridFieldStateForMutation: () => fieldStateCtx,
    category: 'mouse',
    body: {},
    missingSlotMessage: 'productId and field are required for override.',
  };
}

test('happy path: returns {error:null, specDb, productId, field}', () => {
  const specDbStub = { __marker: 'specDb' };
  const result = resolveItemFieldMutationRequest(makeDeps({
    specDbStub,
    fieldStateCtx: { row: { product_id: 'mouse-foo-bar', field_key: 'weight' } },
  }));
  assert.equal(result.error, null);
  assert.equal(result.specDb, specDbStub);
  assert.equal(result.productId, 'mouse-foo-bar');
  assert.equal(result.field, 'weight');
});

test('fieldStateCtx.error → 400 with {error, message} payload', () => {
  const result = resolveItemFieldMutationRequest(makeDeps({
    fieldStateCtx: { error: 'field_state_not_found', errorMessage: 'no state for that product+field' },
  }));
  assert.ok(result.error);
  assert.equal(result.error.status, 400);
  assert.equal(result.error.payload.error, 'field_state_not_found');
  assert.equal(result.error.payload.message, 'no state for that product+field');
});

test('missing product_id → 400 product_and_field_required', () => {
  const result = resolveItemFieldMutationRequest(makeDeps({
    fieldStateCtx: { row: { product_id: '', field_key: 'weight' } },
  }));
  assert.equal(result.error?.status, 400);
  assert.equal(result.error?.payload?.error, 'product_and_field_required');
});

test('missing field_key → 400 product_and_field_required', () => {
  const result = resolveItemFieldMutationRequest(makeDeps({
    fieldStateCtx: { row: { product_id: 'p1', field_key: '' } },
  }));
  assert.equal(result.error?.status, 400);
  assert.equal(result.error?.payload?.error, 'product_and_field_required');
});

test('trims whitespace from product_id and field_key', () => {
  const result = resolveItemFieldMutationRequest(makeDeps({
    fieldStateCtx: { row: { product_id: '  p1  ', field_key: '  weight ' } },
  }));
  assert.equal(result.productId, 'p1');
  assert.equal(result.field, 'weight');
});

test('resolveItemOverrideMode: /review/{cat}/override POST → "override"', () => {
  assert.equal(resolveItemOverrideMode(['review', 'mouse', 'override'], 'POST'), 'override');
});

test('resolveItemOverrideMode: /review/{cat}/manual-override POST → "manual-override"', () => {
  assert.equal(resolveItemOverrideMode(['review', 'mouse', 'manual-override'], 'POST'), 'manual-override');
});

test('resolveItemOverrideMode: unknown action → null', () => {
  assert.equal(resolveItemOverrideMode(['review', 'mouse', 'foo'], 'POST'), null);
  assert.equal(resolveItemOverrideMode(['review', 'mouse', 'override'], 'GET'), null);
  assert.equal(resolveItemOverrideMode(['other', 'mouse', 'override'], 'POST'), null);
});

test('buildManualOverrideEvidence: manual-override mode produces full evidence shape', () => {
  const ev = buildManualOverrideEvidence({ mode: 'manual-override', value: '85g', body: {} });
  assert.equal(ev.url, 'gui://manual-entry');
  assert.equal(ev.quote, 'Manually set to "85g" via GUI');
  assert.equal(ev.source_id, null);
  assert.ok(ev.retrieved_at, 'timestamp included');
});

test('buildManualOverrideEvidence: non-manual-override mode produces minimal evidence', () => {
  const ev = buildManualOverrideEvidence({ mode: 'override', value: '85g', body: {} });
  assert.equal(ev.url, 'gui://manual-entry');
  assert.equal(ev.quote, 'Manually set to "85g" via GUI');
  assert.equal(ev.source_id, undefined, 'no source_id key in non-manual mode');
});

test('buildManualOverrideEvidence: body can override url/quote for manual-override', () => {
  const ev = buildManualOverrideEvidence({
    mode: 'manual-override',
    value: '85g',
    body: { evidenceUrl: 'https://x.com', evidenceQuote: 'custom quote' },
  });
  assert.equal(ev.url, 'https://x.com');
  assert.equal(ev.quote, 'custom quote');
});

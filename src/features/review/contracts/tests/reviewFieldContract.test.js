// WHY: Contract test verifying review field contract keys match the actual
// per-field output shape emitted by buildProductReviewPayload() in reviewGridData.js.

import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import {
  FIELD_STATE_KEYS,
  FIELD_STATE_OPTIONAL_KEYS,
  FIELD_STATE_SELECTED_KEYS,
  CONFIDENCE_COLOR_VALUES,
  REVIEW_CANDIDATE_KEYS,
  CANDIDATE_EVIDENCE_KEYS,
  PRODUCT_REVIEW_PAYLOAD_KEYS,
  PRODUCT_IDENTITY_KEYS,
  PRODUCT_METRICS_KEYS,
} from '../reviewFieldContract.js';

describe('reviewFieldContract', () => {

  it('FIELD_STATE_KEYS is frozen and non-empty', () => {
    ok(Array.isArray(FIELD_STATE_KEYS));
    ok(FIELD_STATE_KEYS.length > 0);
    ok(Object.isFrozen(FIELD_STATE_KEYS));
  });

  it('FIELD_STATE_KEYS includes required builder output keys', () => {
    const expected = [
      'selected', 'candidate_count',
      'candidates', 'accepted_candidate_id', 'selected_candidate_id',
    ];
    for (const key of expected) {
      ok(FIELD_STATE_KEYS.includes(key), `missing: ${key}`);
    }
  });

  it('FIELD_STATE_OPTIONAL_KEYS includes optional builder output keys', () => {
    const expected = [
      'source', 'method', 'tier', 'evidence_url', 'evidence_quote',
      'overridden', 'source_timestamp',
    ];
    for (const key of expected) {
      ok(FIELD_STATE_OPTIONAL_KEYS.includes(key), `missing optional: ${key}`);
    }
  });

  it('FIELD_STATE_SELECTED_KEYS includes value, confidence, status, color', () => {
    for (const key of ['value', 'confidence', 'status', 'color']) {
      ok(FIELD_STATE_SELECTED_KEYS.includes(key), `missing: ${key}`);
    }
  });

  it('CONFIDENCE_COLOR_VALUES includes all colors', () => {
    for (const c of ['green', 'yellow', 'red', 'gray']) {
      ok(CONFIDENCE_COLOR_VALUES.includes(c), `missing color: ${c}`);
    }
  });

  it('REVIEW_CANDIDATE_KEYS includes core candidate fields', () => {
    for (const key of ['candidate_id', 'value', 'score', 'source_id', 'evidence']) {
      ok(REVIEW_CANDIDATE_KEYS.includes(key), `missing: ${key}`);
    }
  });

  it('CANDIDATE_EVIDENCE_KEYS includes url, quote, snippet_id', () => {
    for (const key of ['url', 'quote', 'snippet_id']) {
      ok(CANDIDATE_EVIDENCE_KEYS.includes(key), `missing: ${key}`);
    }
  });

  it('PRODUCT_REVIEW_PAYLOAD_KEYS includes product_id, fields, metrics', () => {
    for (const key of ['product_id', 'fields', 'metrics']) {
      ok(PRODUCT_REVIEW_PAYLOAD_KEYS.includes(key), `missing: ${key}`);
    }
  });

  it('no duplicate keys in any list', () => {
    const lists = [
      FIELD_STATE_KEYS, FIELD_STATE_OPTIONAL_KEYS, FIELD_STATE_SELECTED_KEYS,
      REVIEW_CANDIDATE_KEYS, CANDIDATE_EVIDENCE_KEYS,
      PRODUCT_REVIEW_PAYLOAD_KEYS, PRODUCT_IDENTITY_KEYS, PRODUCT_METRICS_KEYS,
    ];
    for (const list of lists) {
      const unique = new Set(list);
      strictEqual(unique.size, list.length, `duplicate found in ${JSON.stringify(list)}`);
    }
  });

  it('FIELD_STATE_OPTIONAL_KEYS includes variant_values (variant-dependent published state)', () => {
    ok(FIELD_STATE_OPTIONAL_KEYS.includes('variant_values'),
      'variant_values must be in optional keys for variant-dependent field payload');
  });

  it('REVIEW_CANDIDATE_KEYS includes variant_id + variant_label + variant_type + color_atoms + edition_slug', () => {
    for (const key of ['variant_id', 'variant_label', 'variant_type', 'color_atoms', 'edition_slug']) {
      ok(REVIEW_CANDIDATE_KEYS.includes(key), `missing: ${key}`);
    }
  });
});

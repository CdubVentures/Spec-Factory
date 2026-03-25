import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';

import {
  FIELD_STATE_SHAPE, FIELD_STATE_KEYS, FIELD_STATE_OPTIONAL_KEYS,
  FIELD_STATE_SELECTED_SHAPE, FIELD_STATE_SELECTED_KEYS,
  REVIEW_CANDIDATE_SHAPE, REVIEW_CANDIDATE_KEYS,
  CANDIDATE_EVIDENCE_SHAPE, CANDIDATE_EVIDENCE_KEYS,
  KEY_REVIEW_LANE_SHAPE, KEY_REVIEW_LANE_KEYS,
  REVIEW_LAYOUT_ROW_SHAPE, REVIEW_LAYOUT_ROW_KEYS,
  REVIEW_LAYOUT_SHAPE, REVIEW_LAYOUT_KEYS,
  RUN_METRICS_SHAPE, RUN_METRICS_KEYS,
  PRODUCTS_INDEX_RESPONSE_SHAPE, PRODUCTS_INDEX_RESPONSE_KEYS,
  CANDIDATE_RESPONSE_SHAPE, CANDIDATE_RESPONSE_KEYS,
  PRODUCT_REVIEW_PAYLOAD_SHAPE, PRODUCT_REVIEW_PAYLOAD_KEYS,
} from '../reviewFieldContract.js';

import {
  COMPONENT_REVIEW_ITEM_SHAPE, COMPONENT_REVIEW_ITEM_KEYS,
  COMPONENT_REVIEW_PAYLOAD_SHAPE, COMPONENT_REVIEW_PAYLOAD_KEYS,
  COMPONENT_REVIEW_LAYOUT_SHAPE, COMPONENT_REVIEW_LAYOUT_KEYS,
  ENUM_VALUE_REVIEW_ITEM_SHAPE, ENUM_VALUE_REVIEW_ITEM_KEYS,
  ENUM_FIELD_REVIEW_SHAPE, ENUM_FIELD_REVIEW_KEYS,
  ENUM_REVIEW_PAYLOAD_SHAPE, ENUM_REVIEW_PAYLOAD_KEYS,
  COMPONENT_REVIEW_FLAGGED_ITEM_SHAPE, COMPONENT_REVIEW_FLAGGED_ITEM_KEYS,
  COMPONENT_REVIEW_DOCUMENT_SHAPE, COMPONENT_REVIEW_DOCUMENT_KEYS,
  COMPONENT_REVIEW_BATCH_RESULT_SHAPE, COMPONENT_REVIEW_BATCH_RESULT_KEYS,
} from '../componentReviewShapes.js';

const ALL_SHAPES = [
  { name: 'FIELD_STATE_SELECTED', shape: FIELD_STATE_SELECTED_SHAPE, keys: FIELD_STATE_SELECTED_KEYS },
  { name: 'CANDIDATE_EVIDENCE', shape: CANDIDATE_EVIDENCE_SHAPE, keys: CANDIDATE_EVIDENCE_KEYS },
  { name: 'REVIEW_CANDIDATE', shape: REVIEW_CANDIDATE_SHAPE, keys: REVIEW_CANDIDATE_KEYS },
  { name: 'KEY_REVIEW_LANE', shape: KEY_REVIEW_LANE_SHAPE, keys: KEY_REVIEW_LANE_KEYS },
  { name: 'REVIEW_LAYOUT_ROW', shape: REVIEW_LAYOUT_ROW_SHAPE, keys: REVIEW_LAYOUT_ROW_KEYS },
  { name: 'REVIEW_LAYOUT', shape: REVIEW_LAYOUT_SHAPE, keys: REVIEW_LAYOUT_KEYS },
  { name: 'RUN_METRICS', shape: RUN_METRICS_SHAPE, keys: RUN_METRICS_KEYS },
  { name: 'PRODUCTS_INDEX_RESPONSE', shape: PRODUCTS_INDEX_RESPONSE_SHAPE, keys: PRODUCTS_INDEX_RESPONSE_KEYS },
  { name: 'CANDIDATE_RESPONSE', shape: CANDIDATE_RESPONSE_SHAPE, keys: CANDIDATE_RESPONSE_KEYS },
  { name: 'PRODUCT_REVIEW_PAYLOAD', shape: PRODUCT_REVIEW_PAYLOAD_SHAPE, keys: PRODUCT_REVIEW_PAYLOAD_KEYS },
  { name: 'COMPONENT_REVIEW_ITEM', shape: COMPONENT_REVIEW_ITEM_SHAPE, keys: COMPONENT_REVIEW_ITEM_KEYS },
  { name: 'COMPONENT_REVIEW_PAYLOAD', shape: COMPONENT_REVIEW_PAYLOAD_SHAPE, keys: COMPONENT_REVIEW_PAYLOAD_KEYS },
  { name: 'COMPONENT_REVIEW_LAYOUT', shape: COMPONENT_REVIEW_LAYOUT_SHAPE, keys: COMPONENT_REVIEW_LAYOUT_KEYS },
  { name: 'ENUM_VALUE_REVIEW_ITEM', shape: ENUM_VALUE_REVIEW_ITEM_SHAPE, keys: ENUM_VALUE_REVIEW_ITEM_KEYS },
  { name: 'ENUM_FIELD_REVIEW', shape: ENUM_FIELD_REVIEW_SHAPE, keys: ENUM_FIELD_REVIEW_KEYS },
  { name: 'ENUM_REVIEW_PAYLOAD', shape: ENUM_REVIEW_PAYLOAD_SHAPE, keys: ENUM_REVIEW_PAYLOAD_KEYS },
  { name: 'COMPONENT_REVIEW_FLAGGED_ITEM', shape: COMPONENT_REVIEW_FLAGGED_ITEM_SHAPE, keys: COMPONENT_REVIEW_FLAGGED_ITEM_KEYS },
  { name: 'COMPONENT_REVIEW_DOCUMENT', shape: COMPONENT_REVIEW_DOCUMENT_SHAPE, keys: COMPONENT_REVIEW_DOCUMENT_KEYS },
  { name: 'COMPONENT_REVIEW_BATCH_RESULT', shape: COMPONENT_REVIEW_BATCH_RESULT_SHAPE, keys: COMPONENT_REVIEW_BATCH_RESULT_KEYS },
];

describe('shape descriptor structural contracts', () => {
  for (const { name, shape } of ALL_SHAPES) {
    it(`${name}: every entry has key (string) and coerce (string)`, () => {
      for (const d of shape) {
        ok(typeof d.key === 'string' && d.key.length > 0, `${name}: missing key`);
        ok(typeof d.coerce === 'string' && d.coerce.length > 0, `${name}.${d.key}: missing coerce`);
      }
    });
  }

  for (const { name, shape } of ALL_SHAPES) {
    it(`${name}: no duplicate keys`, () => {
      const keys = shape.map(d => d.key);
      strictEqual(new Set(keys).size, keys.length, `${name} has duplicate keys`);
    });
  }
});

describe('derived key lists match shape descriptors', () => {
  for (const { name, shape, keys } of ALL_SHAPES) {
    it(`${name}_KEYS matches shape.map(d => d.key)`, () => {
      const shapeKeys = shape.map(d => d.key);
      strictEqual(JSON.stringify([...keys]), JSON.stringify(shapeKeys), `${name} key list mismatch`);
    });
  }
});

describe('FIELD_STATE split keys', () => {
  it('FIELD_STATE_KEYS contains only required entries', () => {
    const required = FIELD_STATE_SHAPE.filter(d => !d.optional).map(d => d.key);
    strictEqual(JSON.stringify([...FIELD_STATE_KEYS]), JSON.stringify(required));
  });

  it('FIELD_STATE_OPTIONAL_KEYS contains only optional entries', () => {
    const optional = FIELD_STATE_SHAPE.filter(d => d.optional).map(d => d.key);
    strictEqual(JSON.stringify([...FIELD_STATE_OPTIONAL_KEYS]), JSON.stringify(optional));
  });

  it('required + optional covers the full shape', () => {
    strictEqual(FIELD_STATE_KEYS.length + FIELD_STATE_OPTIONAL_KEYS.length, FIELD_STATE_SHAPE.length);
  });
});

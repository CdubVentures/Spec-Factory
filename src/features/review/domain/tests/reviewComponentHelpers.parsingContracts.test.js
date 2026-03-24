import test from 'node:test';
import assert from 'node:assert/strict';

import { parseReviewItemAttributes } from '../componentReviewHelpers.js';

test('parseReviewItemAttributes accepts object and JSON-string attributes and rejects invalid payloads', () => {
  assert.deepEqual(parseReviewItemAttributes({ product_attributes: { a: 1 } }), { a: 1 });
  assert.deepEqual(parseReviewItemAttributes({ product_attributes: '{"b":2}' }), { b: 2 });

  for (const input of [
    { product_attributes: 'bad-json' },
    { product_attributes: null },
    {},
    null,
  ]) {
    assert.deepEqual(parseReviewItemAttributes(input), {});
  }
});

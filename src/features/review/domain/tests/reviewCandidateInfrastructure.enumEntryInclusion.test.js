import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldIncludeEnumValueEntry,
} from '../candidateInfrastructure.js';

test('shouldIncludeEnumValueEntry filters unlinked pending pipeline entries', () => {
  assert.equal(shouldIncludeEnumValueEntry(null), false);
  assert.equal(shouldIncludeEnumValueEntry({ value: 'x' }), true);
  assert.equal(
    shouldIncludeEnumValueEntry(
      { source: 'pipeline', needs_review: true, candidates: [{ candidate_id: 'c', value: 'v' }], linked_products: [] },
      { requireLinkedPendingPipeline: true },
    ),
    false,
  );
  assert.equal(
    shouldIncludeEnumValueEntry(
      { source: 'pipeline', needs_review: true, candidates: [{ candidate_id: 'c', value: 'v' }], linked_products: ['p1'] },
      { requireLinkedPendingPipeline: true },
    ),
    true,
  );
});

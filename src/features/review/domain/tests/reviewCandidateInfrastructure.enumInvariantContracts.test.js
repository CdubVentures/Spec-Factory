import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureEnumValueCandidateInvariant,
} from '../candidateInfrastructure.js';

test('ensureEnumValueCandidateInvariant mutates entry with candidates', () => {
  const entry = {
    value: 'wireless',
    source: 'pipeline',
    confidence: 0.6,
    candidates: [
      { candidate_id: 'e1', value: 'wireless', score: 0.8, source_id: 'pipeline' },
    ],
    needs_review: false,
  };

  ensureEnumValueCandidateInvariant(entry, { fieldKey: 'connection' });

  assert.equal(entry.candidates.length >= 1, true);
  assert.equal(typeof entry.confidence, 'number');
  assert.equal(typeof entry.color, 'string');
  assert.equal(entry.value, 'wireless');
});

test('ensureEnumValueCandidateInvariant preserves selected values on user-driven paths', () => {
  const entry = {
    value: 'manual-enum',
    source: 'user',
    overridden: true,
    confidence: 0.95,
    candidates: [],
    needs_review: true,
  };

  ensureEnumValueCandidateInvariant(entry, { fieldKey: 'shape' });
  assert.equal(entry.value, 'manual-enum');
  assert.equal(typeof entry.color, 'string');
});

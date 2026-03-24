import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureEnumValueCandidateInvariant,
  ensureTrackedStateCandidateInvariant,
} from '../candidateInfrastructure.js';

test('ensureTrackedStateCandidateInvariant mutates state with candidates', () => {
  const state = {
    source: 'pipeline',
    selected: { value: 'Pixart 3950', confidence: 0.8 },
    accepted_candidate_id: '',
    candidates: [
      { candidate_id: 'c1', value: 'Pixart 3950', score: 0.9, source_id: 'pipeline' },
    ],
    reason_codes: [],
  };

  ensureTrackedStateCandidateInvariant(state, { fallbackCandidateId: 'test' });

  assert.equal(state.candidates.length >= 1, true);
  assert.equal(state.candidate_count, state.candidates.length);
  assert.equal(state.selected.value, 'Pixart 3950');
  assert.equal(typeof state.selected.confidence, 'number');
  assert.equal(typeof state.selected.color, 'string');
});

test('ensureTrackedStateCandidateInvariant synthesizes missing accepted candidate', () => {
  const state = {
    source: 'pipeline',
    selected: { value: 'test-value', confidence: 0.7 },
    accepted_candidate_id: 'missing-id',
    candidates: [],
    reason_codes: [],
  };

  ensureTrackedStateCandidateInvariant(state, { fallbackCandidateId: 'fb' });

  const synthetic = state.candidates.find((candidate) => candidate.candidate_id === 'missing-id');
  assert.ok(synthetic, 'should synthesize accepted candidate');
  assert.equal(synthetic.is_synthetic_selected, true);
});

test('ensureTrackedStateCandidateInvariant preserves selected values on user-driven paths', () => {
  const state = {
    source: 'user',
    overridden: true,
    selected: { value: 'manual-val', confidence: 0.9 },
    candidates: [
      { candidate_id: 'c1', value: 'manual-val', score: 0.9, source_id: 'user' },
    ],
    reason_codes: [],
  };

  ensureTrackedStateCandidateInvariant(state, { fallbackCandidateId: 'u' });
  assert.equal(state.selected.value, 'manual-val');
  assert.equal(typeof state.selected.color, 'string');
});

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

test('candidate invariant helpers are no-ops for non-object inputs', () => {
  ensureTrackedStateCandidateInvariant(null);
  ensureTrackedStateCandidateInvariant(undefined);
  ensureTrackedStateCandidateInvariant('string');
  ensureEnumValueCandidateInvariant(null);
  ensureEnumValueCandidateInvariant(undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasActionableCandidate,
} from '../candidateInfrastructure.js';

test('hasActionableCandidate requires non-synthetic candidates with known values and ids', () => {
  assert.equal(hasActionableCandidate([]), false);
  assert.equal(hasActionableCandidate([{ candidate_id: 'c1', value: 'x' }]), true);
  assert.equal(hasActionableCandidate([{ candidate_id: 'c1', value: 'x', is_synthetic_selected: true }]), false);
  assert.equal(hasActionableCandidate([{ candidate_id: '', value: 'x' }]), false);
  assert.equal(hasActionableCandidate([{ candidate_id: 'c1', value: 'unknown' }]), false);
});

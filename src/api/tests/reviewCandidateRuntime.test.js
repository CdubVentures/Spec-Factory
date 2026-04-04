import test from 'node:test';
import assert from 'node:assert/strict';

import { createReviewCandidateRuntime } from '../reviewCandidateRuntime.js';

function createReviewCandidateRuntimeHarness(overrides = {}) {
  return createReviewCandidateRuntime({
    getSpecDb: () => null,
    config: {},
    normalizePathToken: (value) => String(value || '').trim(),
    ...overrides,
  });
}

test('candidateLooksReference recognizes reference and component-db candidates', () => {
  const runtime = createReviewCandidateRuntimeHarness();

  assert.equal(runtime.candidateLooksReference('ref_sensor_1'), true);
  assert.equal(runtime.candidateLooksReference('cand-1', 'component_db'), true);
  assert.equal(runtime.candidateLooksReference('cand-2', 'pipeline'), false);
});

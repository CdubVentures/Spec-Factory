import test from 'node:test';
import assert from 'node:assert/strict';

import { candidateLooksReference } from '../reviewCandidateRuntime.js';

test('candidateLooksReference recognizes reference and component-db candidates', () => {
  assert.equal(candidateLooksReference('ref_sensor_1'), true);
  assert.equal(candidateLooksReference('cand-1', 'component_db'), true);
  assert.equal(candidateLooksReference('cand-2', 'pipeline'), false);
});

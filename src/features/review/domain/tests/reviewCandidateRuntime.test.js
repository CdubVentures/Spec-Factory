import test from 'node:test';
import assert from 'node:assert/strict';

import { candidateLooksReference, isMeaningfulValue } from '../reviewCandidateRuntime.js';

test('candidateLooksReference recognizes reference and component-db candidates', () => {
  assert.equal(candidateLooksReference('ref_sensor_1'), true);
  assert.equal(candidateLooksReference('cand-1', 'component_db'), true);
  assert.equal(candidateLooksReference('cand-2', 'pipeline'), false);
});

test('isMeaningfulValue rejects the LLM unk sentinel case-insensitively', () => {
  assert.equal(isMeaningfulValue('unk'), false);
  assert.equal(isMeaningfulValue('UNK'), false);
  assert.equal(isMeaningfulValue('unknown'), false);
  assert.equal(isMeaningfulValue('real value'), true);
});

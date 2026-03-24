import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendAllSpecDbCandidates,
  toSpecDbCandidate,
} from '../candidateInfrastructure.js';

test('toSpecDbCandidate builds normalized candidates and falls back to the provided id', () => {
  const rowCandidate = toSpecDbCandidate(
    { candidate_id: 'sdb1', value: 'PAW3950', score: 0.9, source_host: 'techpowerup.com', product_id: 'p1' },
    'fallback',
  );
  const fallbackCandidate = toSpecDbCandidate({ value: 'x' }, 'fb');

  assert.equal(rowCandidate.candidate_id, 'sdb1');
  assert.equal(rowCandidate.value, 'PAW3950');
  assert.equal(rowCandidate.source_id, 'specdb');
  assert.equal(rowCandidate.source, 'techpowerup.com (p1)');
  assert.equal(fallbackCandidate.candidate_id, 'fb');
});

test('appendAllSpecDbCandidates deduplicates and skips empty values', () => {
  const target = [{ candidate_id: 'existing', value: 'a' }];
  const rows = [
    { candidate_id: 'existing', value: 'b' },
    { value: 'new-val' },
    { value: '' },
    { value: null },
  ];

  appendAllSpecDbCandidates(target, rows, 'prefix');
  assert.equal(target.length, 2);
  assert.equal(target[1].value, 'new-val');
});

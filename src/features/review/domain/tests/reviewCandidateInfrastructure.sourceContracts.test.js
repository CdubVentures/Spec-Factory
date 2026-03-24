import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSourceToken,
  sourceLabelFromToken,
  sourceMethodFromToken,
} from '../candidateInfrastructure.js';

test('normalizeSourceToken maps source aliases', () => {
  const cases = [
    ['component_db', 'reference'],
    ['known_values', 'reference'],
    ['reference', 'reference'],
    ['pipeline', 'pipeline'],
    ['pipeline_extraction', 'pipeline'],
    ['specdb', 'specdb'],
    ['manual', 'user'],
    ['user', 'user'],
    ['', ''],
    [null, ''],
    ['other', 'other'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeSourceToken(input), expected, `normalizeSourceToken(${JSON.stringify(input)})`);
  }
});

test('sourceLabelFromToken returns display labels', () => {
  assert.equal(sourceLabelFromToken('reference'), 'Reference');
  assert.equal(sourceLabelFromToken('pipeline'), 'Pipeline');
  assert.equal(sourceLabelFromToken('pipeline', 'Custom'), 'Custom');
  assert.equal(sourceLabelFromToken('specdb'), 'SpecDb');
  assert.equal(sourceLabelFromToken('user'), 'user');
});

test('sourceMethodFromToken returns method strings', () => {
  assert.equal(sourceMethodFromToken('reference'), 'reference_data');
  assert.equal(sourceMethodFromToken('pipeline'), 'pipeline_extraction');
  assert.equal(sourceMethodFromToken('specdb'), 'specdb_lookup');
  assert.equal(sourceMethodFromToken('user'), 'manual_override');
  assert.equal(sourceMethodFromToken('other', 'fallback'), 'fallback');
});

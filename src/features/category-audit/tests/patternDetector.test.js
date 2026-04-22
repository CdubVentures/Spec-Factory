import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeEnum, resolveFilterUi } from '../patternDetector.js';

test('analyzeEnum groups values by digit-collapsed signature', () => {
  const result = analyzeEnum([
    '1 zone (rgb)', '2 zone (rgb)', '9 zone (rgb)',
    '1 zone (led)', '7 zone (led)',
    'none',
  ]);
  assert.equal(result.total, 6);
  assert.equal(result.signatureGroups.length, 3);
  assert.equal(result.signatureGroups[0].signature, '<N> zone (rgb)');
  assert.equal(result.signatureGroups[0].count, 3);
  assert.equal(result.signatureGroups[1].signature, '<N> zone (led)');
  assert.equal(result.signatureGroups[1].count, 2);
  assert.equal(result.signatureGroups[2].signature, 'none');
  assert.equal(result.signatureGroups[2].count, 1);
});

test('analyzeEnum computes topSignature coverage percentage', () => {
  const result = analyzeEnum(['alpha one', 'alpha two', 'beta one']);
  assert.ok(result.topSignature);
  assert.equal(result.topSignature.signature, 'alpha one');
  // Every value has a unique signature → top count = 1 of 3 = 33%
  assert.equal(result.topSignature.count, 1);
  assert.equal(result.topSignature.coveragePct, 33);
});

test('analyzeEnum collapses decimals before integers (preserves precision signal)', () => {
  const result = analyzeEnum(['12.5 ms', '10 ms']);
  const sigs = result.signatureGroups.map((g) => g.signature).sort();
  assert.deepEqual(sigs, ['<FLOAT> ms', '<N> ms']);
});

test('analyzeEnum flags suspicious values for string enums: empty, ≤2 chars, numeric-only, no letters', () => {
  const result = analyzeEnum(['matte', 'A', 'help', '1', '2.5', '---', 'rubber grips'], { contractType: 'string' });
  const reasons = new Map(result.suspiciousValues.map((s) => [s.value, s.reason]));
  assert.ok(reasons.has('A'), 'single char flagged');
  assert.ok(reasons.get('A').includes('very short'));
  assert.ok(reasons.has('1'), 'purely numeric flagged');
  assert.ok(reasons.get('1').includes('very short') || reasons.get('1').includes('numeric'));
  assert.ok(reasons.has('2.5'));
  assert.ok(reasons.has('---'), 'no-letters flagged');
  assert.ok(!reasons.has('matte'));
  assert.ok(!reasons.has('rubber grips'));
  assert.ok(!reasons.has('help'), 'word with letters is NOT flagged (auditor judges semantics)');
});

test('analyzeEnum does not flag suspicious values for non-string contract types', () => {
  const result = analyzeEnum(['1', '2', '3'], { contractType: 'integer' });
  assert.equal(result.suspiciousValues.length, 0);
});

test('analyzeEnum handles empty input', () => {
  const result = analyzeEnum([]);
  assert.equal(result.total, 0);
  assert.equal(result.signatureGroups.length, 0);
  assert.equal(result.topSignature, null);
  assert.equal(result.suspiciousValues.length, 0);
});

test('analyzeEnum handles non-array input defensively', () => {
  const result = analyzeEnum(null);
  assert.equal(result.total, 0);
  assert.equal(result.signatureGroups.length, 0);
});

test('analyzeEnum sorts signature groups by count desc, then signature asc', () => {
  const result = analyzeEnum(['z', 'z', 'a', 'a', 'a', 'm']);
  assert.deepEqual(result.signatureGroups.map((g) => g.signature), ['a', 'z', 'm']);
});

test('resolveFilterUi maps contract type to frontend rendering', () => {
  assert.equal(resolveFilterUi('string'), 'toggles');
  assert.equal(resolveFilterUi('number'), 'range');
  assert.equal(resolveFilterUi('integer'), 'range');
  assert.equal(resolveFilterUi('float'), 'range');
  assert.equal(resolveFilterUi('date'), 'date_range');
  assert.equal(resolveFilterUi('boolean'), 'checkbox');
  assert.equal(resolveFilterUi('bool'), 'checkbox');
  assert.equal(resolveFilterUi(''), 'none');
  assert.equal(resolveFilterUi('unknown'), 'none');
});

test('analyzeEnum filterUi reflects contract type', () => {
  assert.equal(analyzeEnum(['a'], { contractType: 'string' }).filterUi, 'toggles');
  assert.equal(analyzeEnum(['1'], { contractType: 'number' }).filterUi, 'range');
  assert.equal(analyzeEnum(['2026-01-01'], { contractType: 'date' }).filterUi, 'date_range');
});

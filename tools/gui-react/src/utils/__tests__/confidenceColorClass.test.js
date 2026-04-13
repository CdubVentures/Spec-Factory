import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { confidenceColorClass } from '../colors.js';

describe('confidenceColorClass', () => {
  const cases = [
    [1.0,  'conf-100'],
    [0.95, 'conf-100'],
    [0.94, 'conf-90'],
    [0.85, 'conf-90'],
    [0.84, 'conf-80'],
    [0.75, 'conf-80'],
    [0.74, 'conf-70'],
    [0.65, 'conf-70'],
    [0.64, 'conf-60'],
    [0.55, 'conf-60'],
    [0.54, 'conf-50'],
    [0.45, 'conf-50'],
    [0.44, 'conf-40'],
    [0.35, 'conf-40'],
    [0.34, 'conf-30'],
    [0.25, 'conf-30'],
    [0.24, 'conf-20'],
    [0.15, 'conf-20'],
    [0.14, 'conf-10'],
    [0.0,  'conf-10'],
  ];

  for (const [score, expected] of cases) {
    it(`maps ${score} → ${expected}`, () => {
      assert.equal(confidenceColorClass(score), expected);
    });
  }

  it('clamps negative to conf-10', () => {
    assert.equal(confidenceColorClass(-0.1), 'conf-10');
  });

  it('clamps > 1 to conf-100', () => {
    assert.equal(confidenceColorClass(1.5), 'conf-100');
  });
});

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../src/shared/tests/helpers/loadBundledModule.js';

let confidenceColorClass;

describe('confidenceColorClass — threshold-anchored 4-band scale', () => {
  before(async () => {
    ({ confidenceColorClass } = await loadBundledModule(
      'tools/gui-react/src/utils/colors.ts',
      { prefix: 'utils-colors-' },
    ));
  });

  // With default threshold 0.7:
  //   >= 0.80 → conf-100 (strong pass)
  //   >= 0.70 → conf-70  (pass)
  //   >= 0.60 → conf-40  (borderline)
  //   <  0.60 → conf-10  (fail)
  const defaultCases = [
    [1.00, 'conf-100'],
    [0.95, 'conf-100'],
    [0.80, 'conf-100'],
    [0.79, 'conf-70'],
    [0.75, 'conf-70'],
    [0.70, 'conf-70'],
    [0.69, 'conf-40'],
    [0.60, 'conf-40'],
    [0.59, 'conf-10'],
    [0.30, 'conf-10'],
    [0.00, 'conf-10'],
  ];

  for (const [score, expected] of defaultCases) {
    it(`default threshold: maps ${score} → ${expected}`, () => {
      assert.equal(confidenceColorClass(score), expected);
    });
  }

  it('custom threshold shifts the bands — threshold 0.5', () => {
    assert.equal(confidenceColorClass(0.60, 0.5), 'conf-100'); // ≥ 0.60
    assert.equal(confidenceColorClass(0.50, 0.5), 'conf-70');  // ≥ 0.50
    assert.equal(confidenceColorClass(0.40, 0.5), 'conf-40');  // ≥ 0.40
    assert.equal(confidenceColorClass(0.39, 0.5), 'conf-10');
  });

  it('custom threshold shifts the bands — threshold 0.9 (very strict)', () => {
    assert.equal(confidenceColorClass(1.00, 0.9), 'conf-100');
    assert.equal(confidenceColorClass(0.90, 0.9), 'conf-70');
    assert.equal(confidenceColorClass(0.85, 0.9), 'conf-40');
    assert.equal(confidenceColorClass(0.79, 0.9), 'conf-10');
  });

  it('non-finite score → conf-10 (fail closed on bad input)', () => {
    assert.equal(confidenceColorClass(NaN), 'conf-10');
    assert.equal(confidenceColorClass(Infinity), 'conf-10');
    assert.equal(confidenceColorClass(null), 'conf-10');
    assert.equal(confidenceColorClass(undefined), 'conf-10');
  });

  it('non-finite threshold → conf-10 (bad input, fail closed)', () => {
    assert.equal(confidenceColorClass(0.9, NaN), 'conf-10');
    assert.equal(confidenceColorClass(0.9, null), 'conf-10');
  });
});

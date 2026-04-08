import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRounding } from '../checks/applyRounding.js';

describe('applyRounding — mode nearest (default)', () => {
  const cases = [
    [42.567, 0, 43,    true,  'round to integer'],
    [42.567, 1, 42.6,  true,  'round to 1 decimal'],
    [42.567, 2, 42.57, true,  'round to 2 decimals'],
    [42,     0, 42,    false, 'already integer'],
    [114.3,  1, 114.3, false, 'already 1 decimal'],
    [0.999,  0, 1,     true,  'rounds up'],
    [0,      0, 0,     false, 'zero unchanged'],
    [-3.7,   0, -4,    true,  'negative rounds'],
  ];

  for (const [value, decimals, expected, repaired, label] of cases) {
    it(label, () => {
      const r = applyRounding(value, { decimals, mode: 'nearest' });
      assert.strictEqual(r.value, expected);
      assert.equal(r.repaired, repaired);
      if (repaired) assert.equal(r.rule, 'rounding');
    });
  }
});

describe('applyRounding — mode floor', () => {
  it('floor to integer', () => {
    const r = applyRounding(42.9, { decimals: 0, mode: 'floor' });
    assert.strictEqual(r.value, 42);
    assert.equal(r.repaired, true);
  });

  it('floor to 1 decimal', () => {
    const r = applyRounding(42.99, { decimals: 1, mode: 'floor' });
    assert.strictEqual(r.value, 42.9);
    assert.equal(r.repaired, true);
  });
});

describe('applyRounding — mode ceil', () => {
  it('ceil to integer', () => {
    const r = applyRounding(42.1, { decimals: 0, mode: 'ceil' });
    assert.strictEqual(r.value, 43);
    assert.equal(r.repaired, true);
  });

  it('ceil to 1 decimal', () => {
    const r = applyRounding(42.01, { decimals: 1, mode: 'ceil' });
    assert.strictEqual(r.value, 42.1);
    assert.equal(r.repaired, true);
  });
});

describe('applyRounding — default mode (nearest when unspecified)', () => {
  it('no mode → nearest', () => {
    const r = applyRounding(42.567, { decimals: 0 });
    assert.strictEqual(r.value, 43);
    assert.equal(r.repaired, true);
  });
});

describe('applyRounding — no config / passthrough', () => {
  const cases = [
    [42.5,    null,           42.5,    'null config'],
    [42.5,    undefined,      42.5,    'undefined config'],
    [42.5,    {},             42.5,    'empty config (no decimals)'],
    ['unk',   { decimals: 0 }, 'unk',  'unk passthrough'],
    ['hello', { decimals: 0 }, 'hello', 'non-number string passthrough'],
  ];

  for (const [value, config, expected, label] of cases) {
    it(label, () => {
      const r = applyRounding(value, config);
      assert.strictEqual(r.value, expected);
      assert.equal(r.repaired, false);
    });
  }

  it('NaN passthrough', () => {
    const r = applyRounding(NaN, { decimals: 0 });
    assert.ok(Number.isNaN(r.value));
    assert.equal(r.repaired, false);
  });

  it('null value passthrough', () => {
    const r = applyRounding(null, { decimals: 0 });
    assert.strictEqual(r.value, null);
    assert.equal(r.repaired, false);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkRange } from '../checks/checkRange.js';

describe('checkRange — in range (pass)', () => {
  const cases = [
    [42,   { min: 0, max: 100 },     'within bounds'],
    [0,    { min: 0, max: 100 },     'at min (inclusive)'],
    [100,  { min: 0, max: 100 },     'at max (inclusive)'],
    [0.05, { min: 0.01, max: 0.5 },  'decimal range'],
    [200,  { min: 200, max: 5000 },  'at min (monitor brightness)'],
    [5000, { min: 200, max: 5000 },  'at max (monitor brightness)'],
  ];

  for (const [value, range, label] of cases) {
    it(`pass: ${label}`, () => {
      assert.equal(checkRange(value, range).pass, true);
    });
  }
});

describe('checkRange — out of range (reject)', () => {
  const cases = [
    [-1,    { min: 0, max: 100 },     'below min'],
    [101,   { min: 0, max: 100 },     'above max'],
    [0.001, { min: 0.01, max: 0.5 },  'below min (decimal)'],
    [0.6,   { min: 0.01, max: 0.5 },  'above max (decimal)'],
    [199,   { min: 200, max: 5000 },   'below min (monitor)'],
    [5001,  { min: 200, max: 5000 },   'above max (monitor)'],
  ];

  for (const [value, range, label] of cases) {
    it(`reject: ${label}`, () => {
      const r = checkRange(value, range);
      assert.equal(r.pass, false);
      assert.equal(typeof r.reason, 'string');
      assert.ok(r.detail);
      assert.equal(r.detail.actual, value);
    });
  }
});

describe('checkRange — partial range', () => {
  it('only min, value above → pass', () => {
    assert.equal(checkRange(50, { min: 0 }).pass, true);
  });

  it('only min, value below → reject', () => {
    assert.equal(checkRange(-1, { min: 0 }).pass, false);
  });

  it('only max, value below → pass', () => {
    assert.equal(checkRange(50, { max: 100 }).pass, true);
  });

  it('only max, value above → reject', () => {
    assert.equal(checkRange(101, { max: 100 }).pass, false);
  });
});

describe('checkRange — no config / passthrough', () => {
  const cases = [
    [42,      null,              'null config'],
    [42,      undefined,         'undefined config'],
    [42,      {},                'empty config'],
    ['unk',   { min: 0, max: 100 }, 'unk passthrough'],
    ['hello', { min: 0, max: 100 }, 'non-number string passthrough'],
    [null,    { min: 0, max: 100 }, 'null passthrough'],
    [true,    { min: 0, max: 100 }, 'boolean passthrough'],
  ];

  for (const [value, config, label] of cases) {
    it(`pass: ${label}`, () => {
      assert.equal(checkRange(value, config).pass, true);
    });
  }
});

describe('checkRange — rejection detail', () => {
  it('includes min, max, and actual in detail', () => {
    const r = checkRange(-1, { min: 0, max: 100 });
    assert.equal(r.pass, false);
    assert.deepStrictEqual(r.detail, { min: 0, max: 100, actual: -1 });
  });

  it('partial range detail (only min)', () => {
    const r = checkRange(-1, { min: 0 });
    assert.equal(r.pass, false);
    assert.equal(r.detail.actual, -1);
    assert.equal(r.detail.min, 0);
  });
});

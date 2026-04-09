import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkUnit } from '../checks/checkUnit.js';

describe('checkUnit — no unit declared (passthrough)', () => {
  const cases = [
    [42,      '',        'empty string unit'],
    [42,      null,      'null unit'],
    [42,      undefined, 'undefined unit'],
    ['hello', '',        'string value, no unit'],
  ];

  for (const [value, unit, label] of cases) {
    it(`passthrough: ${label}`, () => {
      const r = checkUnit(value, unit);
      assert.equal(r.pass, true);
      assert.equal(r.value, value);
    });
  }
});

describe('checkUnit — unk passthrough', () => {
  it('"unk" skips unit check', () => {
    const r = checkUnit('unk', 'g');
    assert.equal(r.pass, true);
    assert.equal(r.value, 'unk');
  });
});

describe('checkUnit — bare number (unit assumed correct)', () => {
  const cases = [
    [42,   'g',  'integer + g'],
    [0,    'mm', 'zero + mm'],
    [42.5, 'Hz', 'float + Hz'],
    [-5,   'g',  'negative + g'],
  ];

  for (const [value, unit, label] of cases) {
    it(`pass: ${label}`, () => {
      const r = checkUnit(value, unit);
      assert.equal(r.pass, true);
      assert.equal(r.value, value);
    });
  }
});

describe('checkUnit — same-unit suffix strip (REPAIR)', () => {
  const cases = [
    ['42g',      'g',   42,     'strip g'],
    ['42 g',     'g',   42,     'strip g with space'],
    ['120 mm',   'mm',  120,    'strip mm'],
    ['1000Hz',   'Hz',  1000,   'strip Hz'],
    ['42.5 ms',  'ms',  42.5,   'float + ms'],
    ['100 dpi',  'dpi', 100,    'strip dpi'],
  ];

  for (const [value, unit, expected, label] of cases) {
    it(`repair: ${label}`, () => {
      const r = checkUnit(value, unit);
      assert.equal(r.pass, true);
      assert.strictEqual(r.value, expected);
      assert.equal(r.rule, 'strip_same_unit');
    });
  }
});

describe('checkUnit — wrong unit (REJECT)', () => {
  const cases = [
    ['2.65 lb',  'g',  'lb',  'lb not in [g]'],
    ['4.5 in',   'mm', 'in',  'in not in [mm]'],
    ['180 cm',   'm',  'cm',  'cm not in [m]'],
    ['1.5 oz',   'g',  'oz',  'oz not in [g]'],
    ['500 mAh',  'h',  'mAh', 'mAh not in [h]'],
  ];

  for (const [value, unit, detected, label] of cases) {
    it(`reject: ${label}`, () => {
      const r = checkUnit(value, unit);
      assert.equal(r.pass, false);
      assert.equal(typeof r.reason, 'string');
      assert.ok(r.detail);
      assert.equal(r.detail.expected, unit);
      assert.equal(r.detail.detected.toLowerCase(), detected.toLowerCase());
    });
  }
});

describe('checkUnit — non-numeric passthrough', () => {
  it('null passes through', () => {
    const r = checkUnit(null, 'g');
    assert.equal(r.pass, true);
  });

  it('boolean passes through', () => {
    const r = checkUnit(true, 'g');
    assert.equal(r.pass, true);
  });

  it('non-numeric string passes through', () => {
    const r = checkUnit('hello world', 'g');
    assert.equal(r.pass, true);
  });
});

describe('checkUnit — bare numeric string passthrough', () => {
  it('"42" with unit g → strips to number', () => {
    const r = checkUnit('42', 'g');
    assert.equal(r.pass, true);
    assert.strictEqual(r.value, 42);
  });

  it('rejects wrong unit when only canonical is accepted', () => {
    const r = checkUnit('42 lb', 'g');
    assert.equal(r.pass, false);
  });
});

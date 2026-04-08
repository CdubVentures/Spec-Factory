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
    ['42g',      'g',   ['g'],   42,     'strip g'],
    ['42 g',     'g',   ['g'],   42,     'strip g with space'],
    ['120 mm',   'mm',  ['mm'],  120,    'strip mm'],
    ['1000Hz',   'Hz',  ['Hz'],  1000,   'strip Hz'],
    ['42.5 ms',  'ms',  ['ms'],  42.5,   'float + ms'],
    ['100 dpi',  'dpi', ['dpi'], 100,    'strip dpi'],
  ];

  for (const [value, unit, accepts, expected, label] of cases) {
    it(`repair: ${label}`, () => {
      const r = checkUnit(value, unit, accepts);
      assert.equal(r.pass, true);
      assert.strictEqual(r.value, expected);
      assert.equal(r.rule, 'strip_same_unit');
    });
  }
});

describe('checkUnit — unit_accepts multi-form', () => {
  it('"120 hours" for h field with unit_accepts ["h", "hours"]', () => {
    const r = checkUnit('120 hours', 'h', ['h', 'hours']);
    assert.equal(r.pass, true);
    assert.strictEqual(r.value, 120);
    assert.equal(r.rule, 'unit_accepts');
  });

  it('"120 h" for h field with unit_accepts ["h", "hours"]', () => {
    const r = checkUnit('120 h', 'h', ['h', 'hours']);
    assert.equal(r.pass, true);
    assert.strictEqual(r.value, 120);
  });

  it('"500 mAh" for mAh field with unit_accepts ["mAh"]', () => {
    const r = checkUnit('500 mAh', 'mAh', ['mAh']);
    assert.equal(r.pass, true);
    assert.strictEqual(r.value, 500);
  });
});

describe('checkUnit — wrong unit (REJECT)', () => {
  const cases = [
    ['2.65 lb',  'g',  ['g'],            'lb',  'lb not in [g]'],
    ['4.5 in',   'mm', ['mm'],           'in',  'in not in [mm]'],
    ['180 cm',   'm',  ['m'],            'cm',  'cm not in [m]'],
    ['1.5 oz',   'g',  ['g'],            'oz',  'oz not in [g]'],
    ['500 mAh',  'h',  ['h', 'hours'],   'mAh', 'mAh not in [h, hours]'],
  ];

  for (const [value, unit, accepts, detected, label] of cases) {
    it(`reject: ${label}`, () => {
      const r = checkUnit(value, unit, accepts);
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

// ── unit_conversions: deterministic conversion ────────────────────────────────

describe('checkUnit — unit_conversions: deterministic convert', () => {
  const conversions = { lb: 453.592, oz: 28.3495, kg: 1000 };

  it('lb → g conversion via factor', () => {
    const r = checkUnit('2.65 lb', 'g', ['g'], conversions);
    assert.equal(r.pass, true);
    assert.equal(typeof r.value, 'number');
    // 2.65 * 453.592 = 1202.0188
    assert.ok(Math.abs(r.value - 1202.0188) < 0.01);
    assert.equal(r.rule, 'unit_convert');
  });

  it('oz → g conversion via factor', () => {
    const r = checkUnit('4.5 oz', 'g', ['g'], conversions);
    assert.equal(r.pass, true);
    // 4.5 * 28.3495 = 127.57275
    assert.ok(Math.abs(r.value - 127.57275) < 0.01);
    assert.equal(r.rule, 'unit_convert');
  });

  it('no conversion factor for unit → still rejects', () => {
    const r = checkUnit('10 stones', 'g', ['g'], conversions);
    assert.equal(r.pass, false);
    assert.equal(r.detail.detected, 'stones');
  });

  it('null conversions → falls back to reject', () => {
    const r = checkUnit('2.65 lb', 'g', ['g'], null);
    assert.equal(r.pass, false);
  });

  it('empty conversions → falls back to reject', () => {
    const r = checkUnit('2.65 lb', 'g', ['g'], {});
    assert.equal(r.pass, false);
  });

  it('accepted unit still passes without conversion', () => {
    const r = checkUnit('42 g', 'g', ['g'], conversions);
    assert.equal(r.pass, true);
    assert.equal(r.value, 42);
    assert.equal(r.rule, 'strip_same_unit');
  });
});

// ── strict_unit_required ─────────────────────────────────────────────────────

describe('checkUnit — strict_unit_required', () => {
  it('bare number passes when strict is false', () => {
    const r = checkUnit('42', 'g', ['g'], null, false);
    assert.equal(r.pass, true);
    assert.equal(r.value, 42);
  });

  it('bare number passes when strict is undefined (default)', () => {
    const r = checkUnit('42', 'g', ['g']);
    assert.equal(r.pass, true);
    assert.equal(r.value, 42);
  });

  it('bare number REJECTS when strict is true', () => {
    const r = checkUnit('42', 'g', ['g'], null, true);
    assert.equal(r.pass, false);
    assert.ok(r.reason.includes('unit_required'));
  });

  it('number with correct unit passes when strict is true', () => {
    const r = checkUnit('42 g', 'g', ['g'], null, true);
    assert.equal(r.pass, true);
    assert.equal(r.value, 42);
  });

  it('already-numeric value REJECTS when strict is true', () => {
    const r = checkUnit(42, 'g', ['g'], null, true);
    assert.equal(r.pass, false);
    assert.ok(r.reason.includes('unit_required'));
  });

  it('unk still passes when strict is true', () => {
    const r = checkUnit('unk', 'g', ['g'], null, true);
    assert.equal(r.pass, true);
  });
});

describe('checkUnit — default unitAccepts fallback', () => {
  it('uses [expectedUnit] when unitAccepts not provided', () => {
    const r = checkUnit('42 g', 'g');
    assert.equal(r.pass, true);
    assert.strictEqual(r.value, 42);
  });

  it('rejects wrong unit when unitAccepts not provided', () => {
    const r = checkUnit('42 lb', 'g');
    assert.equal(r.pass, false);
  });
});

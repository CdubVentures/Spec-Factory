import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateRecord } from '../validateRecord.js';

// --- Helpers ---

function numRule(unit, { rounding, range } = {}) {
  return {
    contract: { shape: 'scalar', type: 'number', unit, ...(rounding ? { rounding } : {}), ...(range ? { range } : {}) },
    parse: {},
    enum: {},
    ui: rounding ? { display_decimals: rounding.decimals } : {},
  };
}

function textRule() {
  return { contract: { shape: 'scalar', type: 'string' }, parse: {}, enum: {}, ui: {} };
}

// ============================================================
// Happy path
// ============================================================

describe('validateRecord — happy path', () => {
  it('all fields valid', () => {
    const r = validateRecord({
      fields: { weight: 42, model: 'Viper' },
      fieldRules: { weight: numRule('g'), model: textRule() },
    });
    assert.equal(r.valid, true);
    assert.equal(r.fields.weight, 42);
    assert.equal(r.fields.model, 'viper');
    assert.equal(r.perField.weight.valid, true);
    assert.equal(r.perField.model.valid, true);
  });

  it('single field', () => {
    const r = validateRecord({
      fields: { weight: 42 },
      fieldRules: { weight: numRule('g') },
    });
    assert.equal(r.valid, true);
    assert.equal(Object.keys(r.perField).length, 1);
  });

  it('empty fields → valid', () => {
    const r = validateRecord({ fields: {}, fieldRules: {} });
    assert.equal(r.valid, true);
    assert.equal(Object.keys(r.perField).length, 0);
  });
});

// ============================================================
// Per-field validation flows through
// ============================================================

describe('validateRecord — per-field flow-through', () => {
  it('type coerce + unit strip', () => {
    const r = validateRecord({
      fields: { weight: '120 mm' },
      fieldRules: { weight: numRule('mm') },
    });
    assert.equal(r.perField.weight.value, 120);
    assert.equal(r.perField.weight.valid, true);
  });

  it('string normalization', () => {
    const r = validateRecord({
      fields: { model: '  BLACK  ' },
      fieldRules: { model: textRule() },
    });
    assert.equal(r.perField.model.value, 'black');
  });

  it('wrong unit rejection', () => {
    const r = validateRecord({
      fields: { weight: '2.65 lb' },
      fieldRules: { weight: numRule('g') },
    });
    assert.equal(r.valid, false);
    assert.equal(r.perField.weight.valid, false);
  });

  it('field with no matching rule → default handling', () => {
    const r = validateRecord({
      fields: { unknown_field: 'hello' },
      fieldRules: {},
    });
    assert.equal(r.valid, true);
    assert.ok(r.perField.unknown_field);
  });
});

// ============================================================
// Enum routing
// ============================================================

describe('validateRecord — enum routing', () => {
  it('enum pass — known value', () => {
    const r = validateRecord({
      fields: { color: 'black' },
      fieldRules: { color: textRule() },
      knownValues: { enums: { color: { policy: 'closed', values: ['black', 'white'] } } },
    });
    assert.equal(r.valid, true);
  });

  it('enum reject — unknown value (closed)', () => {
    const r = validateRecord({
      fields: { color: 'pink' },
      fieldRules: { color: textRule() },
      knownValues: { enums: { color: { policy: 'closed', values: ['black', 'white'] } } },
    });
    assert.equal(r.valid, false);
  });

  it('no knownValues → skip enum', () => {
    const r = validateRecord({
      fields: { color: 'black' },
      fieldRules: { color: textRule() },
      knownValues: null,
    });
    assert.equal(r.valid, true);
  });

  it('open_prefer_known unknown → invalid with unknown_enum_prefer_known rejection', () => {
    const r = validateRecord({
      fields: { shape: 'ergonomic' },
      fieldRules: { shape: textRule() },
      knownValues: { enums: { shape: { policy: 'open_prefer_known', values: ['ambidextrous', 'right-handed'] } } },
    });
    assert.equal(r.valid, false, 'field with unknown open_prefer_known value should be invalid');
    const rej = r.perField.shape.rejections;
    assert.equal(rej.length, 1);
    assert.equal(rej[0].reason_code, 'unknown_enum_prefer_known');
    assert.deepStrictEqual(rej[0].detail.unknown, ['ergonomic']);
  });

  it('open_prefer_known known value → valid, no rejection', () => {
    const r = validateRecord({
      fields: { shape: 'ambidextrous' },
      fieldRules: { shape: textRule() },
      knownValues: { enums: { shape: { policy: 'open_prefer_known', values: ['ambidextrous', 'right-handed'] } } },
    });
    assert.equal(r.valid, true);
    assert.equal(r.perField.shape.rejections.length, 0);
  });
});

// ============================================================
// Overall valid determination
// ============================================================

describe('validateRecord — overall valid', () => {
  it('all valid + no cross failures → true', () => {
    const r = validateRecord({
      fields: { weight: 42 },
      fieldRules: { weight: numRule('g') },
    });
    assert.equal(r.valid, true);
  });

  it('per-field rejection → false', () => {
    const r = validateRecord({
      fields: { weight: '2.65 lb' },
      fieldRules: { weight: numRule('g') },
    });
    assert.equal(r.valid, false);
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('validateRecord — edge cases', () => {
  it('null fieldRules → graceful', () => {
    const r = validateRecord({ fields: { weight: 42 }, fieldRules: null });
    assert.equal(r.valid, true);
    assert.ok(r.perField.weight);
  });

  it('empty fieldRules → no rule for field', () => {
    const r = validateRecord({ fields: { weight: 42 }, fieldRules: {} });
    assert.equal(r.valid, true);
  });

  it('null fields → empty', () => {
    const r = validateRecord({ fields: null, fieldRules: {} });
    assert.equal(r.valid, true);
    assert.equal(Object.keys(r.perField).length, 0);
  });
});

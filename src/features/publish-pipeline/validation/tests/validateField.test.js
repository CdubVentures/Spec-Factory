import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateField } from '../validateField.js';

// --- Helper: build a minimal field rule ---
function rule({ shape = 'scalar', type = 'string', unit, template = 'text_field', tokenMap, rounding, range, listRules, enumPolicy } = {}) {
  return {
    contract: {
      shape,
      type,
      ...(unit ? { unit } : {}),
      ...(rounding ? { rounding } : {}),
      ...(range ? { range } : {}),
      ...(listRules ? { list_rules: listRules } : {}),
    },
    parse: {
      template,
      ...(tokenMap ? { token_map: tokenMap } : {}),
      ...(unit ? { unit_accepts: [unit] } : {}),
    },
    enum: enumPolicy ? { policy: enumPolicy } : {},
    ui: rounding ? { display_decimals: rounding.decimals } : {},
  };
}

// ============================================================
// text_field (scalar string, 140 fields)
// ============================================================

describe('validateField — text_field', () => {
  const textRule = rule();

  it('clean passthrough', () => {
    const r = validateField({ fieldKey: 'model', value: 'black', fieldRule: textRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'black');
    assert.equal(r.confidence, 1.0);
    assert.equal(r.repairs.length, 0);
    assert.equal(r.rejections.length, 0);
  });

  it('trim + lowercase normalization', () => {
    const r = validateField({ fieldKey: 'model', value: '  BLACK  ', fieldRule: textRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'black');
    assert.ok(r.repairs.length > 0);
  });

  it('token_map applied', () => {
    const r = validateField({ fieldKey: 'color', value: 'grey', fieldRule: rule({ tokenMap: { grey: 'gray' } }) });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'gray');
  });

  it('null → unk via absence normalization', () => {
    const r = validateField({ fieldKey: 'model', value: null, fieldRule: textRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'unk');
  });

  it('number auto-coerced to string', () => {
    const r = validateField({ fieldKey: 'model', value: 42, fieldRule: textRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, '42');
  });

  it('array rejected — wrong shape', () => {
    const r = validateField({ fieldKey: 'model', value: ['a'], fieldRule: textRule });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.length > 0);
    assert.ok(r.rejections[0].reason_code.includes('shape'));
  });
});

// ============================================================
// number_with_unit (scalar number, 78 fields)
// ============================================================

describe('validateField — number_with_unit', () => {
  const numRule = rule({ type: 'number', unit: 'g', template: 'number_with_unit' });

  it('clean number passthrough', () => {
    const r = validateField({ fieldKey: 'weight', value: 42, fieldRule: numRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 42);
  });

  it('string number coerced + unit stripped', () => {
    const r = validateField({ fieldKey: 'weight', value: '120 mm', fieldRule: rule({ type: 'number', unit: 'mm', template: 'number_with_unit' }) });
    assert.equal(r.valid, true);
    assert.equal(r.value, 120);
  });

  it('string number coerced + rounded', () => {
    const r = validateField({
      fieldKey: 'weight',
      value: '42.567',
      fieldRule: rule({ type: 'number', unit: 'g', template: 'number_with_unit', rounding: { decimals: 0, mode: 'nearest' } }),
    });
    assert.equal(r.valid, true);
    assert.equal(r.value, 43);
  });

  it('wrong unit rejected', () => {
    const r = validateField({ fieldKey: 'weight', value: '2.65 lb', fieldRule: numRule });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code.includes('unit')));
  });

  it('out of range rejected', () => {
    const r = validateField({
      fieldKey: 'weight',
      value: 101,
      fieldRule: rule({ type: 'number', unit: 'g', template: 'number_with_unit', range: { min: 0, max: 100 } }),
    });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code.includes('range')));
  });

  it('unk passthrough for number field', () => {
    const r = validateField({ fieldKey: 'weight', value: 'unk', fieldRule: numRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'unk');
  });

  it('null → unk for number field', () => {
    const r = validateField({ fieldKey: 'weight', value: null, fieldRule: numRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'unk');
  });
});

// ============================================================
// boolean_yes_no_unk (scalar string, 35 fields)
// ============================================================

describe('validateField — boolean_yes_no_unk', () => {
  const boolRule = rule({ template: 'boolean_yes_no_unk' });

  it('"true" dispatched to "yes"', () => {
    const r = validateField({ fieldKey: 'wireless', value: 'true', fieldRule: boolRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'yes');
  });

  it('"no" clean passthrough', () => {
    const r = validateField({ fieldKey: 'wireless', value: 'no', fieldRule: boolRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'no');
  });

  it('"unk" passthrough', () => {
    const r = validateField({ fieldKey: 'wireless', value: 'unk', fieldRule: boolRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'unk');
  });

  it('null → unk', () => {
    const r = validateField({ fieldKey: 'wireless', value: null, fieldRule: boolRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'unk');
  });
});

// ============================================================
// list_of_tokens_delimited (list string[], 21 fields)
// ============================================================

describe('validateField — list_of_tokens_delimited', () => {
  const listRule = rule({ shape: 'list', template: 'list_of_tokens_delimited', listRules: { dedupe: true, sort: 'none', max_items: 100, min_items: 0 } });
  const knownColors = { policy: 'closed', values: ['black', 'white', 'red'] };

  it('dispatched + enum pass', () => {
    const r = validateField({ fieldKey: 'colors', value: 'Black, White, Red', fieldRule: listRule, knownValues: knownColors });
    assert.equal(r.valid, true);
    assert.deepStrictEqual(r.value, ['black', 'white', 'red']);
  });

  it('dispatched + deduped', () => {
    const r = validateField({ fieldKey: 'colors', value: 'Black, Black, White', fieldRule: listRule, knownValues: { policy: 'closed', values: ['black', 'white'] } });
    assert.equal(r.valid, true);
    assert.deepStrictEqual(r.value, ['black', 'white']);
  });

  it('unknown enum value rejected (closed)', () => {
    const r = validateField({ fieldKey: 'colors', value: 'Black, Pink', fieldRule: listRule, knownValues: knownColors });
    assert.equal(r.valid, false);
  });

  it('null → empty list', () => {
    const r = validateField({ fieldKey: 'colors', value: null, fieldRule: listRule });
    assert.equal(r.valid, true);
    assert.deepStrictEqual(r.value, []);
  });
});

// ============================================================
// component_reference (scalar string, 4 fields)
// ============================================================

describe('validateField — component_reference', () => {
  const compRule = rule({ template: 'component_reference' });
  const sensorDb = { items: [{ name: 'PAW3395', aliases: ['PAW 3395'] }] };

  it('exact component match', () => {
    const r = validateField({ fieldKey: 'sensor', value: 'PAW3395', fieldRule: compRule, componentDb: sensorDb });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'PAW3395');
  });

  it('case-insensitive component repair', () => {
    const r = validateField({ fieldKey: 'sensor', value: 'paw3395', fieldRule: compRule, componentDb: sensorDb });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'PAW3395');
  });

  it('unknown component rejected', () => {
    const r = validateField({ fieldKey: 'sensor', value: 'Mystery', fieldRule: compRule, componentDb: sensorDb });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code.includes('component')));
  });

  it('unk passthrough', () => {
    const r = validateField({ fieldKey: 'sensor', value: 'unk', fieldRule: compRule, componentDb: sensorDb });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'unk');
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('validateField — edge cases', () => {
  it('null fieldRule → unk', () => {
    const r = validateField({ fieldKey: 'x', value: 'hello', fieldRule: null });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'unk');
  });

  it('empty fieldRule → graceful defaults', () => {
    const r = validateField({ fieldKey: 'x', value: 'hello', fieldRule: {} });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'hello');
  });

  it('confidence is always 1.0', () => {
    const r = validateField({ fieldKey: 'x', value: 'hello', fieldRule: rule() });
    assert.equal(r.confidence, 1.0);
  });

  it('repairPrompt is null when no unknowns', () => {
    const r = validateField({ fieldKey: 'x', value: 'hello', fieldRule: rule() });
    assert.equal(r.repairPrompt, null);
  });
});

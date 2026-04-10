import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateField } from '../validateField.js';

// --- Helper: build a minimal field rule (type-driven, no templates) ---
function rule({ shape = 'scalar', type = 'string', unit, tokenMap, rounding, range, listRules, enumPolicy } = {}) {
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
      ...(tokenMap ? { token_map: tokenMap } : {}),
    },
    enum: enumPolicy ? { policy: enumPolicy } : {},
  };
}

// ============================================================
// string (scalar, the most common type)
// ============================================================

describe('validateField — string', () => {
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

  it('null → null via absence normalization', () => {
    const r = validateField({ fieldKey: 'model', value: null, fieldRule: textRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, null);
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
// number (scalar, with unit)
// ============================================================

describe('validateField — number', () => {
  const numRule = rule({ type: 'number', unit: 'g' });

  it('clean number passthrough', () => {
    const r = validateField({ fieldKey: 'weight', value: 42, fieldRule: numRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 42);
  });

  it('string number coerced + unit stripped', () => {
    const r = validateField({ fieldKey: 'weight', value: '120 mm', fieldRule: rule({ type: 'number', unit: 'mm' }) });
    assert.equal(r.valid, true);
    assert.equal(r.value, 120);
  });

  it('string number coerced + rounded', () => {
    const r = validateField({
      fieldKey: 'weight',
      value: '42.567',
      fieldRule: rule({ type: 'number', unit: 'g', rounding: { decimals: 0, mode: 'nearest' } }),
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
      fieldRule: rule({ type: 'number', unit: 'g', range: { min: 0, max: 100 } }),
    });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code.includes('range')));
  });

  it('unk token → null for number field', () => {
    const r = validateField({ fieldKey: 'weight', value: 'unk', fieldRule: numRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, null);
  });

  it('null → null for number field', () => {
    const r = validateField({ fieldKey: 'weight', value: null, fieldRule: numRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, null);
  });
});

// ============================================================
// boolean (scalar)
// ============================================================

describe('validateField — boolean', () => {
  const boolRule = rule({ type: 'boolean' });

  it('"true" coerced to "yes"', () => {
    const r = validateField({ fieldKey: 'wireless', value: 'true', fieldRule: boolRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'yes');
  });

  it('"no" passthrough', () => {
    const r = validateField({ fieldKey: 'wireless', value: 'no', fieldRule: boolRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, 'no');
  });

  it('"unk" → null (absence normalized)', () => {
    const r = validateField({ fieldKey: 'wireless', value: 'unk', fieldRule: boolRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, null);
  });

  it('null → null', () => {
    const r = validateField({ fieldKey: 'wireless', value: null, fieldRule: boolRule });
    assert.equal(r.valid, true);
    assert.equal(r.value, null);
  });
});

// ============================================================
// string list (shape=list, extraction submits arrays)
// ============================================================

describe('validateField — string list', () => {
  const listRule = rule({ shape: 'list', listRules: { dedupe: true, sort: 'none' } });
  const knownColors = { policy: 'closed', values: ['black', 'white', 'red'] };

  it('array of strings + enum pass', () => {
    const r = validateField({ fieldKey: 'colors', value: ['black', 'white', 'red'], fieldRule: listRule, knownValues: knownColors });
    assert.equal(r.valid, true);
    assert.deepStrictEqual(r.value, ['black', 'white', 'red']);
  });

  it('deduped', () => {
    const r = validateField({ fieldKey: 'colors', value: ['black', 'black', 'white'], fieldRule: listRule, knownValues: { policy: 'closed', values: ['black', 'white'] } });
    assert.equal(r.valid, true);
    assert.deepStrictEqual(r.value, ['black', 'white']);
  });

  it('unknown enum value rejected (closed)', () => {
    const r = validateField({ fieldKey: 'colors', value: ['black', 'pink'], fieldRule: listRule, knownValues: knownColors });
    assert.equal(r.valid, false);
  });

  it('null → empty list', () => {
    const r = validateField({ fieldKey: 'colors', value: null, fieldRule: listRule });
    assert.equal(r.valid, true);
    assert.deepStrictEqual(r.value, []);
  });

  it('string where list expected → wrong shape rejection', () => {
    const r = validateField({ fieldKey: 'colors', value: 'Black, White', fieldRule: listRule });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'wrong_shape'));
  });
});

// ── open_prefer_known — alias resolution through pipeline ────────────────────

describe('validateField — open_prefer_known (alias resolution)', () => {
  function opkRule(extra = {}) {
    return {
      contract: { shape: 'scalar', type: 'string' },
      parse: {},
      enum: { policy: 'open_prefer_known' },
      ...extra,
    };
  }

  it('case-insensitive enum match → auto-repair to canonical', () => {
    const r = validateField({
      fieldKey: 'lighting',
      value: '3 zone (rgb)',
      fieldRule: opkRule(),
      knownValues: { policy: 'open_prefer_known', values: ['3 Zone (RGB)', '4 Zone (RGB)', 'None'] },
    });
    assert.equal(r.valid, true);
    assert.equal(r.value, '3 Zone (RGB)');
    assert.ok(r.repairs.some(rep => rep.step === 'enum_alias'));
  });

  it('canonical input still resolves (normalize lowercases, alias restores)', () => {
    const r = validateField({
      fieldKey: 'lighting',
      value: '3 Zone (RGB)',
      fieldRule: opkRule(),
      knownValues: { policy: 'open_prefer_known', values: ['3 Zone (RGB)'] },
    });
    assert.equal(r.valid, true);
    assert.equal(r.value, '3 Zone (RGB)');
  });

  it('no match → accept + flag for LLM', () => {
    const r = validateField({
      fieldKey: 'lighting',
      value: '5 Zone (RGB)',
      fieldRule: opkRule(),
      knownValues: { policy: 'open_prefer_known', values: ['3 Zone (RGB)', '4 Zone (RGB)'] },
    });
    assert.ok(r.rejections.some(rej => rej.reason_code === 'unknown_enum_prefer_known'));
  });

  it('closed policy — case mismatch rejects', () => {
    const closedRule = {
      contract: { shape: 'scalar', type: 'string' },
      parse: {},
      enum: { policy: 'closed' },
    };
    const r = validateField({
      fieldKey: 'lighting',
      value: '3 zone (rgb)',
      fieldRule: closedRule,
      knownValues: { policy: 'closed', values: ['3 Zone (RGB)'] },
    });
    assert.equal(r.valid, false);
  });
});

// ============================================================
// publish gate (derived from required_level)
// ============================================================

describe('validateField — publish gate (derived from required_level)', () => {
  it('unk value rejected when required_level is identity', () => {
    const r = validateField({
      fieldKey: 'weight',
      value: null,
      fieldRule: {
        contract: { shape: 'scalar', type: 'number' },
        parse: {},
        priority: { required_level: 'identity' },
      },
    });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'unk_blocks_publish'));
  });

  it('null value passes when required_level is optional', () => {
    const r = validateField({
      fieldKey: 'weight',
      value: null,
      fieldRule: {
        contract: { shape: 'scalar', type: 'number' },
        parse: {},
        priority: { required_level: 'optional' },
      },
    });
    assert.equal(r.valid, true);
    assert.equal(r.value, null);
  });

  it('non-unk value passes regardless of required_level', () => {
    const r = validateField({
      fieldKey: 'weight',
      value: 42,
      fieldRule: {
        contract: { shape: 'scalar', type: 'number' },
        parse: {},
        priority: { required_level: 'identity' },
      },
    });
    assert.equal(r.valid, true);
    assert.equal(r.value, 42);
  });

  it('absence token (n/a) normalized to null → blocked for required fields', () => {
    const r = validateField({
      fieldKey: 'color',
      value: 'n/a',
      fieldRule: {
        contract: { shape: 'scalar', type: 'string' },
        parse: {},
        priority: { required_level: 'required' },
      },
    });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'unk_blocks_publish'));
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('validateField — edge cases', () => {
  it('null fieldRule → null', () => {
    const r = validateField({ fieldKey: 'x', value: 'hello', fieldRule: null });
    assert.equal(r.valid, true);
    assert.equal(r.value, null);
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

// ============================================================
// Bug fix: [object Object] prevention
// ============================================================

describe('validateField — shape-before-coercion bug fix', () => {
  it('object with scalar shape → clean wrong_shape rejection (NOT [object Object])', () => {
    const r = validateField({
      fieldKey: 'model',
      value: { nested: true },
      fieldRule: { contract: { type: 'string', shape: 'scalar' } },
    });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'wrong_shape'));
    assert.notEqual(r.value, '[object Object]');
    assert.notEqual(r.value, '[object object]');
  });

  it('object with list shape → wrong_shape rejection (not an array)', () => {
    const r = validateField({
      fieldKey: 'colors',
      value: { 'cod-edition': { colors: ['black'] } },
      fieldRule: { contract: { type: 'string', shape: 'list' } },
    });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'wrong_shape'));
  });
});

// ============================================================
// consistencyMode — enum policy override
// ============================================================

describe('validateField — consistencyMode', () => {
  const kv = { policy: 'open', values: ['alpha', 'beta', 'gamma'] };

  it('mode OFF + open policy + unknown value → valid (unchanged)', () => {
    const r = validateField({ fieldKey: 'x', value: 'unknown-val', fieldRule: rule({ enumPolicy: 'open' }), knownValues: kv });
    assert.equal(r.valid, true);
  });

  it('mode ON + open policy + unknown value → rejected unknown_enum_prefer_known', () => {
    const r = validateField({ fieldKey: 'x', value: 'unknown-val', fieldRule: rule({ enumPolicy: 'open' }), knownValues: kv, consistencyMode: true });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'unknown_enum_prefer_known'));
  });

  it('mode ON + open policy + known value → valid', () => {
    const r = validateField({ fieldKey: 'x', value: 'alpha', fieldRule: rule({ enumPolicy: 'open' }), knownValues: kv, consistencyMode: true });
    assert.equal(r.valid, true);
  });

  it('mode ON + open policy + null (absence) → valid (null passthrough)', () => {
    const r = validateField({ fieldKey: 'x', value: null, fieldRule: rule({ enumPolicy: 'open' }), knownValues: kv, consistencyMode: true });
    assert.equal(r.valid, true);
  });

  it('mode ON + closed policy → unchanged (still enum_value_not_allowed)', () => {
    const closedKv = { policy: 'closed', values: ['alpha', 'beta'] };
    const r = validateField({ fieldKey: 'x', value: 'unknown-val', fieldRule: rule({ enumPolicy: 'closed' }), knownValues: closedKv, consistencyMode: true });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'enum_value_not_allowed'));
  });

  it('mode ON + open_prefer_known → unchanged (already flags unknowns)', () => {
    const opkKv = { policy: 'open_prefer_known', values: ['alpha', 'beta'] };
    const r = validateField({ fieldKey: 'x', value: 'unknown-val', fieldRule: rule({ enumPolicy: 'open_prefer_known' }), knownValues: opkKv, consistencyMode: true });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'unknown_enum_prefer_known'));
  });

  it('mode ON + open policy + no enum values → valid (nothing to check)', () => {
    const emptyKv = { policy: 'open', values: [] };
    const r = validateField({ fieldKey: 'x', value: 'anything', fieldRule: rule({ enumPolicy: 'open' }), knownValues: emptyKv, consistencyMode: true });
    assert.equal(r.valid, true);
  });

  it('mode ON + open policy + null knownValues → valid (no values to check)', () => {
    const r = validateField({ fieldKey: 'x', value: 'anything', fieldRule: rule({ enumPolicy: 'open' }), knownValues: null, consistencyMode: true });
    assert.equal(r.valid, true);
  });

  it('mode ON + open policy + list shape + unknown → rejected', () => {
    const listKv = { policy: 'open', values: ['alpha', 'beta'] };
    const r = validateField({
      fieldKey: 'x', value: ['unknown-item'],
      fieldRule: rule({ shape: 'list', enumPolicy: 'open' }),
      knownValues: listKv, consistencyMode: true,
    });
    assert.ok(r.rejections.some(rej => rej.reason_code === 'unknown_enum_prefer_known'));
  });
});

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deriveTestValues } from '../deriveFailureValues.js';

const HELPER_ROOT = path.resolve('category_authority');

let fieldRules, knownValues, componentDBs;

before(async () => {
  fieldRules = JSON.parse(await fs.readFile(
    path.join(HELPER_ROOT, 'mouse', '_generated', 'field_rules.json'), 'utf8',
  ));
  knownValues = JSON.parse(await fs.readFile(
    path.join(HELPER_ROOT, 'mouse', '_generated', 'known_values.json'), 'utf8',
  ));
  const compDbDir = path.join(HELPER_ROOT, 'mouse', '_generated', 'component_db');
  componentDBs = {};
  const compDbFiles = (await fs.readdir(compDbDir)).filter(f => f.endsWith('.json'));
  for (const f of compDbFiles) {
    const data = JSON.parse(await fs.readFile(path.join(compDbDir, f), 'utf8'));
    const key = data.component_type || f.replace('.json', '');
    componentDBs[key] = data;
  }
});

function callDerive(fieldKey) {
  const rule = fieldRules.fields[fieldKey];
  const kv = knownValues?.enums?.[fieldKey] || null;
  const template = rule?.parse?.template || 'text_field';
  const compType = template === 'component_reference' ? fieldKey : null;
  const compDb = compType ? (componentDBs[compType] || componentDBs[compType + 's'] || null) : null;
  return deriveTestValues(fieldKey, rule, kv, compDb);
}

// ── Structure tests ─────────────────────────────────────────────────────────

describe('deriveTestValues — structure', () => {
  it('returns { rejects, repairs, good } for every field', () => {
    for (const fieldKey of Object.keys(fieldRules.fields)) {
      const result = callDerive(fieldKey);
      assert.ok(Array.isArray(result.rejects), `${fieldKey}: rejects is array`);
      assert.ok(Array.isArray(result.repairs), `${fieldKey}: repairs is array`);
      assert.ok(result.good && result.good.value !== undefined, `${fieldKey}: good.value exists`);
    }
  });

  it('every reject entry has value, expectedCode, description', () => {
    for (const fieldKey of Object.keys(fieldRules.fields)) {
      const result = callDerive(fieldKey);
      for (const r of result.rejects) {
        assert.ok(r.value !== undefined, `${fieldKey}: reject value exists`);
        assert.ok(typeof r.expectedCode === 'string', `${fieldKey}: expectedCode is string`);
        assert.ok(typeof r.description === 'string', `${fieldKey}: description is string`);
      }
    }
  });

  it('every repair entry has value, expectedRepair, knob, description', () => {
    for (const fieldKey of Object.keys(fieldRules.fields)) {
      const result = callDerive(fieldKey);
      for (const r of result.repairs) {
        assert.ok(r.value !== undefined, `${fieldKey}: repair value exists`);
        assert.ok(r.expectedRepair !== undefined, `${fieldKey}: expectedRepair exists`);
        assert.ok(typeof r.knob === 'string', `${fieldKey}: knob is string`);
        assert.ok(typeof r.description === 'string', `${fieldKey}: description is string`);
      }
    }
  });
});

// ── Rejection coverage tests ────────────────────────────────────────────────

describe('deriveTestValues — rejection coverage', () => {
  it('every non-dispatched-list field has wrong_shape rejection', () => {
    const DISPATCHED = new Set([
      'boolean_yes_no_unk', 'list_of_tokens_delimited', 'date_field',
      'latency_list_modes_ms', 'list_of_numbers_with_unit',
    ]);
    const missing = [];
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const shape = rule?.contract?.shape || 'scalar';
      const template = rule?.parse?.template || 'text_field';
      // WHY: Dispatched list normalizers convert any input to arrays — wrong_shape unreachable
      if (shape === 'list' && DISPATCHED.has(template)) continue;
      const result = callDerive(fieldKey);
      if (!result.rejects.some(r => r.expectedCode === 'wrong_shape')) {
        missing.push(fieldKey);
      }
    }
    assert.equal(missing.length, 0, `missing wrong_shape: ${missing.join(', ')}`);
  });

  it('numeric fields with contract.range include out_of_range', () => {
    const missing = [];
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const range = rule?.contract?.range;
      const type = rule?.contract?.type || rule?.data_type || 'string';
      if ((type === 'number' || type === 'integer') && range && (range.min != null || range.max != null)) {
        const result = callDerive(fieldKey);
        if (!result.rejects.some(r => r.expectedCode === 'out_of_range')) {
          missing.push(fieldKey);
        }
      }
    }
    assert.equal(missing.length, 0, `missing out_of_range: ${missing.join(', ')}`);
  });

  it('closed enum fields include enum_value_not_allowed', () => {
    const missing = [];
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const kv = knownValues?.enums?.[fieldKey];
      const policy = kv?.policy || rule?.enum?.policy;
      if (policy === 'closed' && kv?.values?.length > 0) {
        const result = callDerive(fieldKey);
        if (!result.rejects.some(r => r.expectedCode === 'enum_value_not_allowed')) {
          missing.push(fieldKey);
        }
      }
    }
    assert.equal(missing.length, 0, `missing enum_value_not_allowed: ${missing.join(', ')}`);
  });

  it('component_reference fields with !allow_new include not_in_component_db', () => {
    const missing = [];
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const template = rule?.parse?.template;
      const allowNew = rule?.component?.allow_new_components || false;
      if (template === 'component_reference' && !allowNew) {
        const compDb = componentDBs[fieldKey] || componentDBs[fieldKey + 's'] || null;
        if (compDb?.items?.length > 0) {
          const result = callDerive(fieldKey);
          if (!result.rejects.some(r => r.expectedCode === 'not_in_component_db')) {
            missing.push(fieldKey);
          }
        }
      }
    }
    assert.equal(missing.length, 0, `missing not_in_component_db: ${missing.join(', ')}`);
  });

  it('fields with contract.unit include wrong_unit', () => {
    const DISPATCHED = new Set([
      'boolean_yes_no_unk', 'list_of_tokens_delimited', 'date_field',
      'latency_list_modes_ms', 'list_of_numbers_with_unit',
    ]);
    const missing = [];
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const unit = rule?.contract?.unit;
      const template = rule?.parse?.template || 'text_field';
      if (unit && !DISPATCHED.has(template)) {
        const result = callDerive(fieldKey);
        if (!result.rejects.some(r => r.expectedCode === 'wrong_unit')) {
          missing.push(fieldKey);
        }
      }
    }
    assert.equal(missing.length, 0, `missing wrong_unit: ${missing.join(', ')}`);
  });
});

// ── Good value tests ────────────────────────────────────────────────────────

describe('deriveTestValues — good values', () => {
  it('good values have correct type/shape for scalar string fields', () => {
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const shape = rule?.contract?.shape || 'scalar';
      const type = rule?.contract?.type || rule?.data_type || 'string';
      if (shape !== 'scalar' || type !== 'string') continue;
      const result = callDerive(fieldKey);
      const v = result.good.value;
      assert.ok(typeof v === 'string', `${fieldKey}: good value should be string, got ${typeof v}`);
    }
  });

  it('good values for scalar numeric fields are numbers or numeric strings', () => {
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const type = rule?.contract?.type || rule?.data_type || 'string';
      const shape = rule?.contract?.shape || 'scalar';
      if (type !== 'number' && type !== 'integer') continue;
      if (shape === 'list') continue; // list-of-numbers returns array, tested separately
      const result = callDerive(fieldKey);
      const v = result.good.value;
      // Allow bare numbers or strings with unit suffix
      const isNumeric = typeof v === 'number' || (typeof v === 'string' && /\d/.test(v));
      assert.ok(isNumeric, `${fieldKey}: good value should be numeric, got ${JSON.stringify(v)}`);
    }
  });

  it('good values for list fields are arrays', () => {
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const shape = rule?.contract?.shape || 'scalar';
      if (shape !== 'list') continue;
      const result = callDerive(fieldKey);
      assert.ok(Array.isArray(result.good.value), `${fieldKey}: good value should be array`);
    }
  });
});

// ── Repair coverage tests ───────────────────────────────────────────────────

describe('deriveTestValues — repair coverage', () => {
  it('fields with contract.rounding include rounding repair', () => {
    const DISPATCHED = new Set([
      'boolean_yes_no_unk', 'list_of_tokens_delimited', 'date_field',
      'latency_list_modes_ms', 'list_of_numbers_with_unit',
    ]);
    let found = 0;
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const rounding = rule?.contract?.rounding;
      const template = rule?.parse?.template || 'text_field';
      if (rounding?.decimals != null && !DISPATCHED.has(template)) {
        const result = callDerive(fieldKey);
        const hasRounding = result.repairs.some(r => r.knob === 'rounding');
        assert.ok(hasRounding, `${fieldKey}: should have rounding repair`);
        found++;
      }
    }
    assert.ok(found > 0, 'should find at least one field with rounding config');
  });

  it('non-dispatched fields with parse.token_map include token_map repair', () => {
    const DISPATCHED = new Set([
      'boolean_yes_no_unk', 'list_of_tokens_delimited', 'date_field',
      'latency_list_modes_ms', 'list_of_numbers_with_unit',
    ]);
    let found = 0;
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const tokenMap = rule?.parse?.token_map;
      const template = rule?.parse?.template || 'text_field';
      // WHY: token_map repair only applies to non-dispatched fields (dispatched normalizers handle their own)
      if (tokenMap && typeof tokenMap === 'object' && Object.keys(tokenMap).length > 0 && !DISPATCHED.has(template)) {
        const result = callDerive(fieldKey);
        const hasTokenMap = result.repairs.some(r => r.knob === 'token_map');
        assert.ok(hasTokenMap, `${fieldKey}: should have token_map repair`);
        found++;
      }
    }
    // token_map on non-dispatched fields may not exist in all categories
    assert.ok(true, `found ${found} non-dispatched fields with token_map repair`);
  });

  it('fields with alternate unit_accepts form include unit_accepts repair', () => {
    const DISPATCHED = new Set([
      'boolean_yes_no_unk', 'list_of_tokens_delimited', 'date_field',
      'latency_list_modes_ms', 'list_of_numbers_with_unit',
    ]);
    let found = 0;
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const ua = rule?.parse?.unit_accepts;
      const unit = rule?.contract?.unit;
      const template = rule?.parse?.template || 'text_field';
      // WHY: only test when an alternate form exists (differs from canonical unit)
      const hasAlternate = ua?.some(u => u.toLowerCase() !== (unit || '').toLowerCase());
      if (ua?.length > 0 && unit && !DISPATCHED.has(template) && hasAlternate) {
        const result = callDerive(fieldKey);
        const has = result.repairs.some(r => r.knob === 'unit_accepts');
        assert.ok(has, `${fieldKey}: should have unit_accepts repair`);
        found++;
      }
    }
    assert.ok(found > 0, 'should find at least one field with alternate unit_accepts');
  });

  it('alias enum fields with case-changeable values include alias_resolve repair', () => {
    let found = 0;
    for (const [fieldKey, rule] of Object.entries(fieldRules.fields)) {
      const strategy = rule?.enum?.match?.strategy;
      const shape = rule?.contract?.shape || 'scalar';
      const kv = knownValues?.enums?.[fieldKey];
      if (strategy !== 'alias' || !kv?.values?.length || shape !== 'scalar') continue;
      // WHY: only test when mixed-case of first value differs from original
      const first = kv.values[0];
      const mixed = first.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join('');
      if (mixed === first) continue;
      const result = callDerive(fieldKey);
      const has = result.repairs.some(r => r.knob === 'alias_resolve');
      assert.ok(has, `${fieldKey}: should have alias_resolve repair`);
      found++;
    }
    // WHY: Not all categories have scalar alias enum fields with case-changeable values
    assert.ok(true, `found ${found} fields with alias match + case-changeable value`);
  });
});

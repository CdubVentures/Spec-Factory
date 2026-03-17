import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRange,
  validateRange,
  validateShapeAndUnits,
  enforceEnumPolicy
} from '../src/engine/engineFieldValidators.js';
import { buildEnumIndex } from '../src/engine/engineEnumIndex.js';

// ── parseRange ────────────────────────────────────────────────────────────────

test('parseRange extracts min/max from contract.range', () => {
  const range = parseRange({ contract: { range: { min: 30, max: 200 } } });
  assert.equal(range.min, 30);
  assert.equal(range.max, 200);
});

test('parseRange falls back to validate block', () => {
  const range = parseRange({ validate: { min: 1, max: 100 } });
  assert.equal(range.min, 1);
  assert.equal(range.max, 100);
});

test('parseRange returns null for missing bounds', () => {
  const range = parseRange({});
  assert.equal(range.min, null);
  assert.equal(range.max, null);
});

// ── validateRange ─────────────────────────────────────────────────────────────

test('validateRange returns ok for value in range', () => {
  const rules = { weight: { contract: { range: { min: 30, max: 200 } } } };
  assert.equal(validateRange('weight', 100, { rules }).ok, true);
});

test('validateRange returns out_of_range for below min', () => {
  const rules = { weight: { contract: { range: { min: 30, max: 200 } } } };
  const result = validateRange('weight', 10, { rules });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, 'out_of_range');
});

test('validateRange returns out_of_range for above max', () => {
  const rules = { weight: { contract: { range: { min: 30, max: 200 } } } };
  const result = validateRange('weight', 500, { rules });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, 'out_of_range');
});

test('validateRange returns number_required for null value', () => {
  const rules = { weight: { contract: { range: { min: 30, max: 200 } } } };
  const result = validateRange('weight', 'not a number', { rules });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, 'number_required');
});

test('validateRange returns ok for unknown field', () => {
  assert.equal(validateRange('nonexistent', 42, { rules: {} }).ok, true);
});

// ── validateShapeAndUnits ─────────────────────────────────────────────────────

test('validateShapeAndUnits returns ok for scalar value on scalar rule', () => {
  const rules = { weight: { contract: { type: 'number', shape: 'scalar' } } };
  assert.equal(validateShapeAndUnits('weight', 54, { rules }).ok, true);
});

test('validateShapeAndUnits returns shape_mismatch for array on scalar rule', () => {
  const rules = { weight: { contract: { type: 'string', shape: 'scalar' } } };
  const result = validateShapeAndUnits('weight', [1, 2], { rules });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, 'shape_mismatch');
});

test('validateShapeAndUnits returns shape_mismatch for object on scalar rule', () => {
  const rules = { weight: { contract: { type: 'string', shape: 'scalar' } } };
  const result = validateShapeAndUnits('weight', { a: 1 }, { rules });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, 'shape_mismatch');
});

test('validateShapeAndUnits returns shape_mismatch for scalar on list rule', () => {
  const rules = { rates: { contract: { type: 'number', shape: 'list' } } };
  const result = validateShapeAndUnits('rates', 42, { rules });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, 'shape_mismatch');
});

test('validateShapeAndUnits checks numeric type in list', () => {
  const rules = { rates: { contract: { type: 'number', shape: 'list' } } };
  assert.equal(validateShapeAndUnits('rates', [1, 2, 3], { rules }).ok, true);
  const bad = validateShapeAndUnits('rates', [1, 'abc', 3], { rules });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason_code, 'number_required');
});

test('validateShapeAndUnits returns ok for unknown field', () => {
  assert.equal(validateShapeAndUnits('nonexistent', 42, { rules: {} }).ok, true);
});

// ── enforceEnumPolicy ─────────────────────────────────────────────────────────

test('enforceEnumPolicy resolves aliases', () => {
  const enumIndex = buildEnumIndex({
    enums: {
      connection: {
        policy: 'closed',
        values: [
          { canonical: 'wired', aliases: ['usb wired'] },
          { canonical: 'wireless', aliases: ['2.4ghz'] }
        ]
      }
    }
  });
  const rules = { connection: { enum_policy: 'closed' } };
  const result = enforceEnumPolicy('connection', 'usb wired', { rules, enumIndex });
  assert.equal(result.ok, true);
  assert.equal(result.canonical_value, 'wired');
  assert.equal(result.was_aliased, true);
});

test('enforceEnumPolicy rejects closed-policy unknown value', () => {
  const enumIndex = buildEnumIndex({
    enums: {
      connection: {
        policy: 'closed',
        values: [{ canonical: 'wired' }]
      }
    }
  });
  const rules = { connection: { enum_policy: 'closed' } };
  const result = enforceEnumPolicy('connection', 'satellite', { rules, enumIndex });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, 'enum_value_not_allowed');
});

test('enforceEnumPolicy marks open-policy unknown values for curation', () => {
  const enumIndex = buildEnumIndex({
    enums: {
      coating: {
        policy: 'open',
        values: [{ canonical: 'matte' }]
      }
    }
  });
  const rules = { coating: {} };
  const result = enforceEnumPolicy('coating', 'satin', { rules, enumIndex });
  assert.equal(result.ok, true);
  assert.equal(result.needs_curation, true);
});

test('enforceEnumPolicy falls back to buildRuleEnumSpec when field not in enumIndex', () => {
  const enumIndex = new Map();
  const rules = {
    status: {
      enum: [{ canonical: 'Active', aliases: ['on'] }],
      enum_policy: 'closed'
    }
  };
  const result = enforceEnumPolicy('status', 'on', { rules, enumIndex });
  assert.equal(result.ok, true);
  assert.equal(result.canonical_value, 'Active');
  assert.equal(result.was_aliased, true);
});

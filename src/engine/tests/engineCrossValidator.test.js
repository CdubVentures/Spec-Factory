import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInCondition, crossValidate } from '../engineCrossValidator.js';

// ── evaluateInCondition ───────────────────────────────────────────────────────

test('evaluateInCondition returns true when field value is in the list', () => {
  assert.equal(evaluateInCondition("connection IN ['wireless','bluetooth']", { connection: 'wireless' }), true);
  assert.equal(evaluateInCondition("connection IN ['wireless','bluetooth']", { connection: 'bluetooth' }), true);
});

test('evaluateInCondition returns false when field value is not in the list', () => {
  assert.equal(evaluateInCondition("connection IN ['wireless','bluetooth']", { connection: 'wired' }), false);
});

test('evaluateInCondition returns false for malformed condition', () => {
  assert.equal(evaluateInCondition('not a valid condition', {}), false);
  assert.equal(evaluateInCondition('', {}), false);
});

// ── crossValidate: range check ────────────────────────────────────────────────

test('crossValidate range: value in range passes', () => {
  const result = crossValidate('dpi', 20000, {}, {
    crossValidationRules: [{
      rule_id: 'dpi_range',
      trigger_field: 'dpi',
      check: { type: 'range', min: 100, max: 50000 }
    }],
    rules: {},
    lookupComponent: () => null
  });
  assert.equal(result.ok, true);
  assert.ok(result.checks_passed.includes('dpi_range'));
});

test('crossValidate range: value out of range fails', () => {
  const result = crossValidate('dpi', 60000, {}, {
    crossValidationRules: [{
      rule_id: 'dpi_range',
      trigger_field: 'dpi',
      check: { type: 'range', min: 100, max: 50000 }
    }],
    rules: {},
    lookupComponent: () => null
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].rule, 'dpi_range');
});

// ── crossValidate: group_completeness ─────────────────────────────────────────

test('crossValidate group_completeness: met', () => {
  const result = crossValidate('lngth', 120, { lngth: 120, width: 65, height: 40 }, {
    crossValidationRules: [{
      rule_id: 'dimensions',
      trigger_field: 'lngth',
      check: { type: 'group_completeness', minimum_present: 3 },
      related_fields: ['lngth', 'width', 'height']
    }],
    rules: {},
    lookupComponent: () => null
  });
  assert.equal(result.ok, true);
  assert.ok(result.checks_passed.includes('dimensions'));
});

test('crossValidate group_completeness: not met', () => {
  const result = crossValidate('lngth', 120, { lngth: 120, width: 65, height: null }, {
    crossValidationRules: [{
      rule_id: 'dimensions',
      trigger_field: 'lngth',
      check: { type: 'group_completeness', minimum_present: 3 },
      related_fields: ['lngth', 'width', 'height']
    }],
    rules: {},
    lookupComponent: () => null
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].rule, 'dimensions');
});

// ── crossValidate: mutual_exclusion ───────────────────────────────────────────

test('crossValidate mutual_exclusion: conflicts detected', () => {
  const result = crossValidate('connection', 'wired', { connection: 'wired', battery_hours: 120 }, {
    crossValidationRules: [{
      rule_id: 'wired_no_battery',
      trigger_field: 'connection',
      condition: "connection IN ['wired']",
      check: { type: 'mutual_exclusion' },
      related_fields: ['battery_hours']
    }],
    rules: {},
    lookupComponent: () => null
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].rule, 'wired_no_battery');
});

test('crossValidate mutual_exclusion: condition not met skips check', () => {
  const result = crossValidate('connection', 'wireless', { connection: 'wireless', battery_hours: 120 }, {
    crossValidationRules: [{
      rule_id: 'wired_no_battery',
      trigger_field: 'connection',
      condition: "connection IN ['wired']",
      check: { type: 'mutual_exclusion' },
      related_fields: ['battery_hours']
    }],
    rules: {},
    lookupComponent: () => null
  });
  assert.equal(result.ok, true);
});

// ── crossValidate: conditional_require ────────────────────────────────────────

test('crossValidate conditional_require: condition true, field absent', () => {
  const result = crossValidate('connection', 'wireless', { connection: 'wireless' }, {
    crossValidationRules: [{
      rule_id: 'wireless_needs_battery',
      trigger_field: 'connection',
      condition: "connection IN ['wireless','bluetooth']",
      requires_field: 'battery_hours'
    }],
    rules: {},
    lookupComponent: () => null
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].rule, 'wireless_needs_battery');
});

test('crossValidate conditional_require: condition true, field present', () => {
  const result = crossValidate('connection', 'wireless', { connection: 'wireless', battery_hours: 120 }, {
    crossValidationRules: [{
      rule_id: 'wireless_needs_battery',
      trigger_field: 'connection',
      condition: "connection IN ['wireless','bluetooth']",
      requires_field: 'battery_hours'
    }],
    rules: {},
    lookupComponent: () => null
  });
  assert.equal(result.ok, true);
  assert.ok(result.checks_passed.includes('wireless_needs_battery'));
});

test('crossValidate conditional_require: condition false, skips', () => {
  const result = crossValidate('connection', 'wired', { connection: 'wired' }, {
    crossValidationRules: [{
      rule_id: 'wireless_needs_battery',
      trigger_field: 'connection',
      condition: "connection IN ['wireless','bluetooth']",
      requires_field: 'battery_hours'
    }],
    rules: {},
    lookupComponent: () => null
  });
  assert.equal(result.ok, true);
});

// ── crossValidate: component_db_lookup with compound boundary ─────────────────

test('crossValidate component_db_lookup: value within range passes', () => {
  const result = crossValidate('dpi', 25000, { sensor: 'PAW3395', dpi: 25000 }, {
    crossValidationRules: [{
      rule_id: 'sensor_dpi_limit',
      trigger_field: 'dpi',
      check: {
        type: 'component_db_lookup',
        db: 'sensor',
        lookup_field: 'sensor',
        compare_field: 'max_dpi',
        tolerance_percent: 0
      }
    }],
    rules: {
      dpi: { contract: { range: { min: 100, max: 50000 } } }
    },
    lookupComponent: (db, q) => q === 'PAW3395' ? { canonical_name: 'PAW3395', properties: { max_dpi: 26000 } } : null
  });
  assert.equal(result.ok, true);
});

test('crossValidate component_db_lookup: value exceeds component max', () => {
  const result = crossValidate('dpi', 28000, { sensor: 'PAW3395', dpi: 28000 }, {
    crossValidationRules: [{
      rule_id: 'sensor_dpi_limit',
      trigger_field: 'dpi',
      check: {
        type: 'component_db_lookup',
        db: 'sensor',
        lookup_field: 'sensor',
        compare_field: 'max_dpi',
        tolerance_percent: 0
      }
    }],
    rules: {
      dpi: { contract: { range: { min: 100, max: 50000 } } }
    },
    lookupComponent: (db, q) => q === 'PAW3395' ? { canonical_name: 'PAW3395', properties: { max_dpi: 26000 } } : null
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].rule, 'sensor_dpi_limit');
  assert.equal(result.violations[0].reason_code, 'compound_range_conflict');
});

// ── crossValidate: unknown value short-circuits ───────────────────────────────

test('crossValidate returns ok for unknown token values', () => {
  const result = crossValidate('dpi', 'unk', {}, {
    crossValidationRules: [{ rule_id: 'test', trigger_field: 'dpi', check: { type: 'range', min: 0, max: 100 } }],
    rules: {},
    lookupComponent: () => null
  });
  assert.equal(result.ok, true);
});

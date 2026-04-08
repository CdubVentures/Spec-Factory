import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkConstraints } from '../checks/checkConstraints.js';

// --- Fixtures ---

const conditionalRule = {
  rule_id: 'wireless_battery_required',
  trigger_field: 'connection',
  condition: "connection IN ['wireless','hybrid','bluetooth']",
  requires_field: 'battery_hours',
  on_fail: 'set_unknown_with_reason',
  unknown_reason: 'not_found_after_search',
};

const rangeRule = {
  rule_id: 'actuation_force_plausibility',
  trigger_field: 'actuation_force',
  check: { type: 'range', min: 20, max: 100, on_fail: 'reject_candidate' },
};

const groupRule = {
  rule_id: 'dimensions_consistency',
  trigger_field: 'lngth',
  related_fields: ['width', 'height'],
  check: { type: 'group_completeness', minimum_present: 3, on_fail: 'flag_for_review' },
};

// --- Tests ---

describe('checkConstraints — conditional requirement', () => {
  it('condition met + field present → no failure', () => {
    const r = checkConstraints(
      { connection: 'wireless', battery_hours: 120 },
      { rules: [conditionalRule] },
    );
    assert.equal(r.failures.length, 0);
  });

  it('condition met + field is unk → failure', () => {
    const r = checkConstraints(
      { connection: 'wireless', battery_hours: 'unk' },
      { rules: [conditionalRule] },
    );
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].rule_id, 'wireless_battery_required');
    assert.equal(r.failures[0].action, 'set_unknown_with_reason');
  });

  it('condition met + field missing → failure', () => {
    const r = checkConstraints(
      { connection: 'bluetooth' },
      { rules: [conditionalRule] },
    );
    assert.equal(r.failures.length, 1);
  });

  it('condition not met → skip', () => {
    const r = checkConstraints(
      { connection: 'wired' },
      { rules: [conditionalRule] },
    );
    assert.equal(r.failures.length, 0);
  });

  it('trigger field missing → skip', () => {
    const r = checkConstraints(
      {},
      { rules: [conditionalRule] },
    );
    assert.equal(r.failures.length, 0);
  });
});

describe('checkConstraints — range plausibility', () => {
  it('in range → no failure', () => {
    const r = checkConstraints(
      { actuation_force: 50 },
      { rules: [rangeRule] },
    );
    assert.equal(r.failures.length, 0);
  });

  it('below min → failure', () => {
    const r = checkConstraints(
      { actuation_force: 5 },
      { rules: [rangeRule] },
    );
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].rule_id, 'actuation_force_plausibility');
    assert.equal(r.failures[0].action, 'reject_candidate');
  });

  it('above max → failure', () => {
    const r = checkConstraints(
      { actuation_force: 150 },
      { rules: [rangeRule] },
    );
    assert.equal(r.failures.length, 1);
  });

  it('at min boundary → no failure', () => {
    const r = checkConstraints(
      { actuation_force: 20 },
      { rules: [rangeRule] },
    );
    assert.equal(r.failures.length, 0);
  });

  it('at max boundary → no failure', () => {
    const r = checkConstraints(
      { actuation_force: 100 },
      { rules: [rangeRule] },
    );
    assert.equal(r.failures.length, 0);
  });

  it('unk value → skip', () => {
    const r = checkConstraints(
      { actuation_force: 'unk' },
      { rules: [rangeRule] },
    );
    assert.equal(r.failures.length, 0);
  });

  it('trigger field missing → skip', () => {
    const r = checkConstraints(
      {},
      { rules: [rangeRule] },
    );
    assert.equal(r.failures.length, 0);
  });
});

describe('checkConstraints — group completeness', () => {
  it('all fields present → no failure', () => {
    const r = checkConstraints(
      { lngth: 120, width: 60, height: 40 },
      { rules: [groupRule] },
    );
    assert.equal(r.failures.length, 0);
  });

  it('only 2 of 3 present → failure', () => {
    const r = checkConstraints(
      { lngth: 120, width: 60 },
      { rules: [groupRule] },
    );
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].rule_id, 'dimensions_consistency');
    assert.equal(r.failures[0].action, 'flag_for_review');
  });

  it('unk counts as missing', () => {
    const r = checkConstraints(
      { lngth: 120, width: 60, height: 'unk' },
      { rules: [groupRule] },
    );
    assert.equal(r.failures.length, 1);
  });

  it('all unk → failure', () => {
    const r = checkConstraints(
      { lngth: 'unk', width: 'unk', height: 'unk' },
      { rules: [groupRule] },
    );
    assert.equal(r.failures.length, 1);
  });
});

describe('checkConstraints — no rules / passthrough', () => {
  it('null rules → no failures', () => {
    const r = checkConstraints({ a: 1 }, null);
    assert.equal(r.failures.length, 0);
  });

  it('empty rules → no failures', () => {
    const r = checkConstraints({ a: 1 }, { rules: [] });
    assert.equal(r.failures.length, 0);
  });

  it('undefined rules → no failures', () => {
    const r = checkConstraints({ a: 1 }, undefined);
    assert.equal(r.failures.length, 0);
  });
});

describe('checkConstraints — multiple rules', () => {
  it('evaluates all rules independently', () => {
    const r = checkConstraints(
      { actuation_force: 5, connection: 'wireless' },
      { rules: [rangeRule, conditionalRule] },
    );
    assert.equal(r.failures.length, 2);
  });

  it('mixed pass/fail across rules', () => {
    const r = checkConstraints(
      { actuation_force: 50, connection: 'wireless', battery_hours: 'unk' },
      { rules: [rangeRule, conditionalRule] },
    );
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].rule_id, 'wireless_battery_required');
  });
});

// --- component_db_lookup ---

describe('checkConstraints — component_db_lookup', () => {
  const sensorDb = {
    items: [
      { name: 'PAW3395', properties: { max_dpi: 26000, ips: 650 } },
      { name: 'HERO 25K', properties: { max_dpi: 25600, ips: 400 } },
    ],
  };

  const dpiRule = {
    rule_id: 'sensor_dpi_consistency',
    trigger_field: 'dpi',
    check: {
      type: 'component_db_lookup',
      db: 'sensors',
      lookup_field: 'sensor',
      compare: 'dpi <= sensors[sensor].properties.max_dpi',
      on_fail: 'flag_for_review',
      tolerance_percent: 5,
    },
  };

  it('dpi within sensor max → no failure', () => {
    const r = checkConstraints(
      { dpi: 16000, sensor: 'PAW3395' },
      { rules: [dpiRule] },
      { sensors: sensorDb },
    );
    assert.equal(r.failures.length, 0);
  });

  it('dpi exceeds sensor max → failure', () => {
    const r = checkConstraints(
      { dpi: 30000, sensor: 'PAW3395' },
      { rules: [dpiRule] },
      { sensors: sensorDb },
    );
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].rule_id, 'sensor_dpi_consistency');
    assert.equal(r.failures[0].action, 'flag_for_review');
  });

  it('dpi within tolerance → no failure', () => {
    const r = checkConstraints(
      { dpi: 27000, sensor: 'PAW3395' },
      { rules: [dpiRule] },
      { sensors: sensorDb },
    );
    // 27000 exceeds 26000 but within 5% tolerance (26000 * 1.05 = 27300)
    assert.equal(r.failures.length, 0);
  });

  it('unknown sensor → no failure (entity not found)', () => {
    const r = checkConstraints(
      { dpi: 50000, sensor: 'Unknown9000' },
      { rules: [dpiRule] },
      { sensors: sensorDb },
    );
    assert.equal(r.failures.length, 0);
  });

  it('unk sensor → no failure (skipped)', () => {
    const r = checkConstraints(
      { dpi: 50000, sensor: 'unk' },
      { rules: [dpiRule] },
      { sensors: sensorDb },
    );
    assert.equal(r.failures.length, 0);
  });
});

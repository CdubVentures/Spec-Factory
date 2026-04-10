import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  FieldRulesEngine,
  createAdvancedEngineFixtureRoot,
} from './helpers/fieldRulesEngineHarness.js';

test('crossValidate supports component lookup, group completeness, and mutual exclusion checks', async () => {
  const fixture = await createAdvancedEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });

    const componentViolation = engine.crossValidate('dpi', 30000, {
      sensor: 'PAW3395',
      dpi: 30000
    });
    assert.equal(componentViolation.ok, false);
    assert.equal(componentViolation.violations.some((row) => row.rule === 'sensor_dpi_limit'), true);

    const groupWarning = engine.crossValidate('lngth', 120, {
      lngth: 120,
      width: 65,
      height: null
    });
    assert.equal(groupWarning.ok, false);
    assert.equal(groupWarning.violations.some((row) => row.rule === 'dimensions_triplet'), true);

    const exclusion = engine.crossValidate('connection', 'wired', {
      connection: 'wired',
      battery_hours: 120
    });
    assert.equal(exclusion.ok, false);
    assert.equal(exclusion.violations.some((row) => row.rule === 'wired_has_no_battery'), true);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('crossValidate compound boundary: value between field-rule max and component max triggers compound_range_conflict', async () => {
  const fixture = await createAdvancedEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = engine.crossValidate('dpi', 28000, {
      sensor: 'PAW3395',
      dpi: 28000
    });
    assert.equal(result.ok, false);
    const violation = result.violations.find(v => v.rule === 'sensor_dpi_limit');
    assert.ok(violation, 'should have sensor_dpi_limit violation');
    assert.equal(violation.reason_code, 'compound_range_conflict');
    assert.equal(violation.effective_max, 26000);
    assert.equal(violation.effective_min, 100);
    assert.deepEqual(violation.sources, ['field_rule', 'component_db']);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('crossValidate compound boundary: value within compound range passes', async () => {
  const fixture = await createAdvancedEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = engine.crossValidate('dpi', 25000, {
      sensor: 'PAW3395',
      dpi: 25000
    });
    assert.equal(result.ok, true);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('crossValidate compound boundary: value exceeds both field-rule and component still triggers compound_range_conflict', async () => {
  const fixture = await createAdvancedEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = engine.crossValidate('dpi', 55000, {
      sensor: 'PAW3395',
      dpi: 55000
    });
    assert.equal(result.ok, false);
    const violation = result.violations.find(v => v.rule === 'sensor_dpi_limit');
    assert.ok(violation, 'should have sensor_dpi_limit violation');
    assert.equal(violation.reason_code, 'compound_range_conflict');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// WP2 — getCoreDeepFieldRules accessor
// ---------------------------------------------------------------------------

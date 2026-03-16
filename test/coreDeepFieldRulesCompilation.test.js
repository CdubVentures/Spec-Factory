import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveCoreFields,
  deriveEvidenceTierMinimum,
} from '../src/field-rules/compiler.js';

function makeFields() {
  return {
    brand: { priority: { required_level: 'identity' } },
    model: { priority: { required_level: 'identity' } },
    sensor: { priority: { required_level: 'required' }, evidence: { tier_preference: ['tier1', 'tier2'] } },
    weight: { priority: { required_level: 'critical' }, evidence: { tier_preference: ['tier1', 'tier2'] } },
    dpi: { priority: { required_level: 'required' } },
    polling_rate: { priority: { required_level: 'expected' } },
    rgb_zones: { priority: { required_level: 'optional' } },
    click_latency: { priority: { required_level: 'expected' }, evidence: { tier_preference: ['tier1'] } },
  };
}

describe('WP1 — deriveCoreFields', () => {
  it('FC-01: every field in input gets core_fact or deep_claim classification', () => {
    const fields = makeFields();
    const coreFields = deriveCoreFields(fields);
    const allKeys = Object.keys(fields);
    for (const key of allKeys) {
      const isCore = coreFields.includes(key);
      const isDeep = !isCore;
      assert.ok(isCore || isDeep, `field '${key}' must be classified`);
    }
  });

  it('FC-02: no dual-classified fields (core_fields has no duplicates)', () => {
    const fields = makeFields();
    const coreFields = deriveCoreFields(fields);
    const unique = new Set(coreFields);
    assert.equal(coreFields.length, unique.size, 'no duplicates in core_fields');
  });

  it('FC-03: required_level=identity fields land in core_fields', () => {
    const fields = makeFields();
    const coreFields = deriveCoreFields(fields);
    assert.ok(coreFields.includes('brand'), 'identity field brand is core');
    assert.ok(coreFields.includes('model'), 'identity field model is core');
  });

  it('FC-04: required_level=required fields land in core_fields', () => {
    const fields = makeFields();
    const coreFields = deriveCoreFields(fields);
    assert.ok(coreFields.includes('sensor'), 'required field sensor is core');
    assert.ok(coreFields.includes('dpi'), 'required field dpi is core');
  });

  it('FC-05: required_level=critical fields land in core_fields', () => {
    const fields = makeFields();
    const coreFields = deriveCoreFields(fields);
    assert.ok(coreFields.includes('weight'), 'critical field weight is core');
  });

  it('FC-06: required_level=expected/optional fields NOT in core_fields', () => {
    const fields = makeFields();
    const coreFields = deriveCoreFields(fields);
    assert.ok(!coreFields.includes('polling_rate'), 'expected field NOT core');
    assert.ok(!coreFields.includes('rgb_zones'), 'optional field NOT core');
  });
});

describe('WP1 — deriveEvidenceTierMinimum', () => {
  it('FC-07: evidence_tier_minimum matches tier_preference when present', () => {
    const rule = { evidence: { tier_preference: ['tier1', 'tier2'] } };
    assert.equal(deriveEvidenceTierMinimum(rule), 2);

    const rule2 = { evidence: { tier_preference: ['tier1'] } };
    assert.equal(deriveEvidenceTierMinimum(rule2), 1);
  });

  it('FC-08: missing tier_preference defaults to evidence_tier_minimum: 3', () => {
    assert.equal(deriveEvidenceTierMinimum({}), 3);
    assert.equal(deriveEvidenceTierMinimum({ evidence: {} }), 3);
    assert.equal(deriveEvidenceTierMinimum({ evidence: { tier_preference: [] } }), 3);
    assert.equal(deriveEvidenceTierMinimum(null), 3);
  });
});

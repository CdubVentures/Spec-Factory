import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNeedSet,
  makeIdentityLocked,
  makeIdentityUnlocked,
  makeIdentityConflict,
  makeBaseRules,
  makeBaseInput,
} from './helpers/needSetHarness.js';

// --- Test groups ---

describe('Phase 01 â€” Schema 2 need_score in fields[]', () => {
  it('every field in fields[] has a numeric need_score', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(Array.isArray(result.fields), 'fields[] must exist');
    for (const f of result.fields) {
      assert.equal(typeof f.need_score, 'number', `fields[] entry ${f.field_key} must have numeric need_score`);
      assert.ok(f.need_score > 0, `need_score for ${f.field_key} must be > 0`);
    }
  });

  it('identity fields score higher than optional fields', () => {
    const result = computeNeedSet(makeBaseInput());
    const identityField = result.fields.find((f) => f.required_level === 'identity');
    const optionalField = result.fields.find((f) => f.required_level === 'optional');
    assert.ok(identityField, 'should have an identity field');
    assert.ok(optionalField, 'should have an optional field');
    assert.ok(identityField.need_score > optionalField.need_score,
      `identity score ${identityField.need_score} should > optional score ${optionalField.need_score}`);
  });
});

describe('Phase 01 â€” Schema 2 reasons[] derivation', () => {
  it('missing field â†’ reasons includes "missing"', () => {
    const result = computeNeedSet(makeBaseInput());
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField.reasons.includes('missing'));
  });

  it('conflict field â†’ reasons includes "conflict"', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: { weight: { value: '58g', confidence: 0.9, pass_target: 0.8 } },
      fieldReasoning: { weight: { reasons: ['constraint_conflict'] } }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField.reasons.includes('conflict'));
  });

  it('low confidence â†’ reasons includes "low_conf"', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: { weight: { value: '58g', confidence: 0.4, pass_target: 0.8 } }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField.reasons.includes('low_conf'));
  });

  it('insufficient refs â†’ reasons includes "min_refs_fail"', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required', min_evidence_refs: 3 } },
      provenance: { weight: { value: '58g', confidence: 0.95, pass_target: 0.8, evidence: [{ url: 'a', tier: 1 }] } }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField.reasons.includes('min_refs_fail'),
      `reasons should include min_refs_fail, got: ${JSON.stringify(wField.reasons)}`);
  });

  it('accepted field â†’ empty reasons', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: {
        weight: { value: '58g', confidence: 0.95, pass_target: 0.8, evidence: [{ url: 'a', tier: 1 }, { url: 'b', tier: 1 }] }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepEqual(wField.reasons, []);
  });
});

describe('Phase 01 â€” Schema 2 planner_seed', () => {
  it('missing_critical_fields includes identity/critical fields that are unresolved', () => {
    const result = computeNeedSet(makeBaseInput());
    // brand is identity, sensor is critical â€” both missing
    assert.ok(result.planner_seed.missing_critical_fields.includes('brand'));
    assert.ok(result.planner_seed.missing_critical_fields.includes('sensor'));
    // weight is required, not critical â€” should NOT be in missing_critical
    assert.ok(!result.planner_seed.missing_critical_fields.includes('weight'));
  });

  it('unresolved_fields includes all non-accepted fields', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: {
        weight: { value: '58g', confidence: 0.95, pass_target: 0.8 }
      }
    }));
    assert.ok(!result.planner_seed.unresolved_fields.includes('weight'), 'accepted field not in unresolved');
    assert.ok(result.planner_seed.unresolved_fields.includes('sensor'), 'missing field in unresolved');
  });

  it('current_product_identity has category, brand, model', () => {
    const result = computeNeedSet(makeBaseInput({ brand: 'Razer', model: 'Viper V3 Pro' }));
    assert.equal(result.planner_seed.current_product_identity.category, 'mouse');
    assert.equal(result.planner_seed.current_product_identity.brand, 'Razer');
    assert.equal(result.planner_seed.current_product_identity.model, 'Viper V3 Pro');
  });
});

describe('Phase 01 â€” Schema 2 history (round 0)', () => {
  it('round 0 â†’ all history fields are empty/zero', () => {
    const result = computeNeedSet(makeBaseInput({ round: 0 }));
    for (const f of result.fields) {
      assert.deepEqual(f.history.existing_queries, [], `${f.field_key} history.existing_queries`);
      assert.deepEqual(f.history.domains_tried, [], `${f.field_key} history.domains_tried`);
      assert.equal(f.history.query_count, 0, `${f.field_key} history.query_count`);
      assert.equal(f.history.urls_examined_count, 0, `${f.field_key} history.urls_examined_count`);
      assert.equal(f.history.no_value_attempts, 0, `${f.field_key} history.no_value_attempts`);
      assert.equal(f.history.duplicate_attempts_suppressed, 0, `${f.field_key} history.duplicate_attempts_suppressed`);
    }
  });
});

describe('Phase 01 â€” Schema 2 history (round 1+ carry-forward)', () => {
  it('round 1 with evidence â†’ domains_tried populated from evidence', () => {
    const result = computeNeedSet(makeBaseInput({
      round: 1,
      provenance: {
        weight: {
          value: '58g', confidence: 0.4, pass_target: 0.8,
          evidence: [
            { url: 'https://rtings.com/review', tier: 2, rootDomain: 'rtings.com' },
            { url: 'https://pcmag.com/review', tier: 3, rootDomain: 'pcmag.com' }
          ]
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField.history.domains_tried.includes('rtings.com'));
    assert.ok(wField.history.domains_tried.includes('pcmag.com'));
    assert.equal(wField.history.refs_found, 2);
  });
});

describe('Phase 01 â€” Schema 2 backward compat', () => {
  it('still emits rows, focus_fields, bundles, profile_mix for existing consumers', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(Array.isArray(result.rows), 'rows must still exist');
    assert.ok(Array.isArray(result.focus_fields), 'focus_fields must still exist');
    assert.ok(Array.isArray(result.bundles), 'bundles must still exist');
    assert.ok(result.profile_mix, 'profile_mix must still exist');
  });
});

// WHY: computeEvidenceDecay was removed in Phase 12.
// The decay tests that were here have been moved to evidenceFreshnessDecay.test.js (rewritten).

// ============================================================
// GAP-1: Logic Box 1 â€” idx hint normalization
// ============================================================

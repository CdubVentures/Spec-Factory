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

describe('Phase 01 â€” Schema 2 Top-Level Shape', () => {
  it('output includes schema_version and round', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.schema_version, 'needset_output.v2.1');
    assert.equal(typeof result.round, 'number');
  });

  it('round defaults to 0', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.round, 0);
  });

  it('round can be overridden', () => {
    const result = computeNeedSet(makeBaseInput({ round: 2 }));
    assert.equal(result.round, 2);
  });

  it('output has identity block', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(result.identity, 'identity block must exist');
    assert.equal(typeof result.identity.state, 'string');
    assert.equal(typeof result.identity.confidence, 'number');
    assert.equal(typeof result.identity.source_label_state, 'string');
  });

  it('output has planner_seed', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(result.planner_seed, 'planner_seed must exist');
    assert.ok(Array.isArray(result.planner_seed.missing_critical_fields));
    assert.ok(Array.isArray(result.planner_seed.unresolved_fields));
    assert.ok(Array.isArray(result.planner_seed.existing_queries));
    assert.ok(result.planner_seed.current_product_identity);
  });

  it('output has fields[] array', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(Array.isArray(result.fields), 'fields[] must be an array');
    // All 5 fields should appear in fields[] (even covered ones)
    assert.equal(result.fields.length, 5, 'fields[] should include ALL fields');
  });
});

describe('Phase 01 â€” Schema 2 Identity Block', () => {
  it('locked identity with high confidence â†’ state=locked, source_label_state=matched', () => {
    const result = computeNeedSet(makeBaseInput({
      identityContext: makeIdentityLocked(),
      brand: 'Razer',
      model: 'Viper V3 Pro'
    }));
    assert.equal(result.identity.state, 'locked');
    assert.equal(result.identity.source_label_state, 'matched');
    assert.equal(result.identity.manufacturer, 'Razer');
    assert.equal(result.identity.model, 'Viper V3 Pro');
  });

  it('unlocked identity with low confidence â†’ state=unknown, source_label_state=unknown', () => {
    const result = computeNeedSet(makeBaseInput({
      identityContext: makeIdentityUnlocked()
    }));
    assert.equal(result.identity.state, 'unknown');
    assert.equal(result.identity.source_label_state, 'unknown');
  });

  it('conflict identity â†’ state=conflict, source_label_state=different', () => {
    const result = computeNeedSet(makeBaseInput({
      identityContext: makeIdentityConflict()
    }));
    assert.equal(result.identity.state, 'conflict');
    assert.equal(result.identity.source_label_state, 'different');
  });
});

describe('Phase 01 â€” Schema 2 Summary (9-field)', () => {
  it('summary has all 9 required fields', () => {
    const result = computeNeedSet(makeBaseInput());
    const s = result.summary;
    assert.equal(typeof s.total, 'number');
    assert.equal(typeof s.resolved, 'number');
    assert.equal(typeof s.core_total, 'number');
    assert.equal(typeof s.core_unresolved, 'number');
    assert.equal(typeof s.secondary_total, 'number');
    assert.equal(typeof s.secondary_unresolved, 'number');
    assert.equal(typeof s.optional_total, 'number');
    assert.equal(typeof s.optional_unresolved, 'number');
    assert.equal(typeof s.conflicts, 'number');
  });

  it('total = resolved + sum of unresolved buckets', () => {
    const result = computeNeedSet(makeBaseInput());
    const s = result.summary;
    assert.equal(s.total, s.resolved + s.core_unresolved + s.secondary_unresolved + s.optional_unresolved);
  });

  it('all fields missing â†’ resolved=0, total=5', () => {
    const result = computeNeedSet(makeBaseInput({ provenance: {} }));
    assert.equal(result.summary.total, 5);
    assert.equal(result.summary.resolved, 0);
  });

  it('all fields covered â†’ resolved=5, unresolved all 0', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: {
        weight: { value: '58g', confidence: 0.95, pass_target: 0.8 },
        sensor: { value: 'PAW3950', confidence: 0.95, pass_target: 0.8 },
        dpi_max: { value: '30000', confidence: 0.95, pass_target: 0.8 },
        rgb: { value: 'yes', confidence: 0.95, pass_target: 0.8 },
        brand: { value: 'Razer', confidence: 0.95, pass_target: 0.8 }
      }
    }));
    assert.equal(result.summary.resolved, 5);
    assert.equal(result.summary.core_unresolved, 0);
    assert.equal(result.summary.secondary_unresolved, 0);
    assert.equal(result.summary.optional_unresolved, 0);
  });
});

describe('Phase 01 â€” Schema 2 Blockers (5-field)', () => {
  it('blockers has all 5 fields', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(typeof result.blockers.missing, 'number');
    assert.equal(typeof result.blockers.weak, 'number');
    assert.equal(typeof result.blockers.conflict, 'number');
    assert.equal(typeof result.blockers.needs_exact_match, 'number');
    assert.equal(typeof result.blockers.search_exhausted, 'number');
  });

  it('needs_exact_match defaults to 0 (no exact_match rules exist)', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.blockers.needs_exact_match, 0);
  });

  it('search_exhausted defaults to 0 on round 0', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.blockers.search_exhausted, 0);
  });
});

describe('Phase 01 â€” Schema 2 fields[] per-field shape', () => {
  it('each field entry has the full Schema 2 shape', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: {
        weight: { value: '58g', confidence: 0.4, pass_target: 0.8, evidence: [{ url: 'https://a.com', tier: 2 }] }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField, 'weight should be in fields[]');

    // Top-level field properties
    assert.equal(typeof wField.label, 'string');
    assert.equal(typeof wField.required_level, 'string');
    assert.equal(typeof wField.state, 'string');
    assert.equal(typeof wField.value, 'string');
    assert.equal(typeof wField.confidence, 'number');
    assert.equal(typeof wField.effective_confidence, 'number');
    assert.equal(typeof wField.refs_found, 'number');
    assert.equal(typeof wField.min_refs, 'number');
    assert.equal(typeof wField.pass_target, 'number');
    assert.equal(typeof wField.meets_pass_target, 'boolean');
    assert.equal(typeof wField.exact_match_required, 'boolean');
    assert.equal(typeof wField.need_score, 'number');

    // idx block
    assert.ok(wField.idx, 'idx must exist');
    assert.equal(typeof wField.idx.min_evidence_refs, 'number');
    assert.ok(Array.isArray(wField.idx.query_terms));
    assert.ok(Array.isArray(wField.idx.domain_hints));
    assert.ok(Array.isArray(wField.idx.content_types));

    // reasons array
    assert.ok(Array.isArray(wField.reasons));

    // history block
    assert.ok(wField.history, 'history must exist');
    assert.ok(Array.isArray(wField.history.existing_queries));
    assert.ok(Array.isArray(wField.history.domains_tried));
    assert.ok(Array.isArray(wField.history.host_classes_tried));
    assert.ok(Array.isArray(wField.history.evidence_classes_tried));
    assert.equal(typeof wField.history.query_count, 'number');
    assert.equal(typeof wField.history.urls_examined_count, 'number');
    assert.equal(typeof wField.history.no_value_attempts, 'number');
    assert.equal(typeof wField.history.duplicate_attempts_suppressed, 'number');
  });

  it('covered field has state=accepted in fields[]', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: {
        weight: { value: '58g', confidence: 0.95, pass_target: 0.8, evidence: [{ url: 'a', tier: 1 }] }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField, 'weight must be in fields[]');
    assert.equal(wField.state, 'accepted');
  });

  it('missing field has state=unknown in fields[]', () => {
    const result = computeNeedSet(makeBaseInput());
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField);
    assert.equal(wField.state, 'unknown');
  });

  it('weak field has state=weak in fields[]', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: { weight: { value: '58g', confidence: 0.4, pass_target: 0.8 } }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField);
    assert.equal(wField.state, 'weak');
  });
});

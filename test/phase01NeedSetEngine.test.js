import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNeedSet,
  normalizeFieldKey,
  buildAllAliases,
  shardAliases,
  availabilityRank,
  difficultyRank,
  requiredLevelRank,
  deriveQueryFamilies,
} from '../src/indexlab/needsetEngine.js';

// --- Factories ---

function makeIdentityLocked() {
  return {
    status: 'locked',
    confidence: 0.99,
    identity_gate_validated: true,
    extraction_gate_open: true,
    publishable: true,
    family_model_count: 1,
    ambiguity_level: 'easy',
    publish_blockers: [],
    reason_codes: [],
    page_count: 3,
    max_match_score: 0.99
  };
}

function makeIdentityUnlocked() {
  return {
    status: 'unlocked',
    confidence: 0.3,
    identity_gate_validated: false,
    extraction_gate_open: false,
    publishable: false,
    family_model_count: 5,
    ambiguity_level: 'hard',
    publish_blockers: ['identity_not_validated'],
    reason_codes: [],
    page_count: 0,
    max_match_score: 0.3
  };
}

function makeIdentityConflict() {
  return {
    status: 'conflict',
    confidence: 0.32,
    identity_gate_validated: false,
    extraction_gate_open: false,
    publishable: false,
    family_model_count: 5,
    ambiguity_level: 'hard',
    publish_blockers: ['identity_conflict'],
    reason_codes: ['identity_conflict'],
    page_count: 0,
    max_match_score: 0.32
  };
}

function makeBaseRules() {
  return {
    weight: {
      required_level: 'required', min_evidence_refs: 2,
      evidence: { tier_preference: [1, 2] },
      search_hints: {
        query_terms: ['weight', 'grams'],
        preferred_content_types: ['spec_sheet', 'product_page'],
        domain_hints: ['rtings.com']
      }
    },
    sensor: {
      required_level: 'critical', min_evidence_refs: 2,
      evidence: { tier_preference: [1] },
      search_hints: {
        query_terms: ['sensor', 'optical sensor'],
        preferred_content_types: ['spec_sheet', 'review'],
        domain_hints: ['sensor.fyi', 'techpowerup.com']
      }
    },
    dpi_max: {
      required_level: 'required', min_evidence_refs: 1,
      evidence: { tier_preference: [1, 2] },
      search_hints: {
        query_terms: ['dpi', 'max dpi', 'cpi'],
        preferred_content_types: ['spec_sheet'],
        domain_hints: []
      }
    },
    rgb: {
      required_level: 'optional', min_evidence_refs: 1,
      search_hints: {
        query_terms: ['rgb', 'lighting'],
        preferred_content_types: ['product_page'],
        domain_hints: []
      }
    },
    brand: {
      required_level: 'identity', min_evidence_refs: 1,
      evidence: { tier_preference: [1] },
      search_hints: {
        query_terms: ['brand', 'manufacturer'],
        preferred_content_types: ['product_page'],
        domain_hints: []
      }
    }
  };
}

function makeBaseInput(overrides = {}) {
  return {
    runId: 'r_test',
    category: 'mouse',
    productId: 'test-mouse',
    fieldOrder: ['weight', 'sensor', 'dpi_max', 'rgb', 'brand'],
    provenance: {},
    fieldRules: makeBaseRules(),
    fieldReasoning: {},
    constraintAnalysis: {},
    identityContext: makeIdentityLocked(),
    now: '2026-02-20T00:00:00Z',
    ...overrides
  };
}

// --- Test groups ---

describe('Phase 01 — Field State Derivation', () => {
  it('missing field → state=missing when no provenance value', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: makeBaseRules().weight }
    }));
    const row = result.rows.find((r) => r.field_key === 'weight');
    assert.ok(row, 'missing weight should appear in rows');
    assert.equal(row.state, 'missing');
  });

  it('unk/unknown tokens → state=missing', () => {
    for (const unknownToken of ['unk', 'unknown', 'n/a', 'none', '', 'null', 'undefined', 'na']) {
      const result = computeNeedSet(makeBaseInput({
        fieldOrder: ['weight'],
        fieldRules: { weight: makeBaseRules().weight },
        provenance: { weight: { value: unknownToken, confidence: 0.9, pass_target: 0.8, evidence: [] } }
      }));
      const row = result.rows.find((r) => r.field_key === 'weight');
      assert.ok(row, `"${unknownToken}" should produce a row`);
      assert.equal(row.state, 'missing', `"${unknownToken}" should be state=missing`);
    }
  });

  it('weak field → state=weak when confidence < pass_target', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: makeBaseRules().weight },
      provenance: {
        weight: {
          value: '58g', confidence: 0.4, pass_target: 0.8,
          evidence: [{ url: 'https://a.com', tier: 1 }, { url: 'https://b.com', tier: 1 }]
        }
      }
    }));
    const row = result.rows.find((r) => r.field_key === 'weight');
    assert.ok(row, 'weak weight should appear in rows');
    assert.equal(row.state, 'weak');
  });

  it('conflict field → state=conflict when fieldReasoning has constraint_conflict', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: makeBaseRules().weight },
      provenance: {
        weight: {
          value: '58g', confidence: 0.9, pass_target: 0.8,
          evidence: [{ url: 'https://a.com', tier: 1 }, { url: 'https://b.com', tier: 1 }]
        }
      },
      fieldReasoning: { weight: { reasons: ['constraint_conflict'] } }
    }));
    const row = result.rows.find((r) => r.field_key === 'weight');
    assert.ok(row, 'conflicting weight should appear in rows');
    assert.equal(row.state, 'conflict');
  });

  it('conflict field → state=conflict when constraintAnalysis has contradictions', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: makeBaseRules().weight },
      provenance: {
        weight: {
          value: '58g', confidence: 0.9, pass_target: 0.8,
          evidence: [{ url: 'https://a.com', tier: 1 }, { url: 'https://b.com', tier: 1 }]
        }
      },
      constraintAnalysis: { contradictions: [{ fields: ['weight'], message: 'conflict' }] }
    }));
    const row = result.rows.find((r) => r.field_key === 'weight');
    assert.ok(row, 'contradiction weight should appear in rows');
    assert.equal(row.state, 'conflict');
  });

  it('covered field → excluded from rows', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required', min_evidence_refs: 1 } },
      provenance: {
        weight: {
          value: '58g', confidence: 0.95, pass_target: 0.8, meets_pass_target: true,
          evidence: [{ url: 'https://a.com', tier: 1 }]
        }
      }
    }));
    const row = result.rows.find((r) => r.field_key === 'weight');
    assert.equal(row, undefined, 'covered field should NOT appear in rows');
  });
});

describe('Phase 01 — Priority Bucket Mapping', () => {
  it('identity required_level → core bucket', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['brand'],
      fieldRules: { brand: { required_level: 'identity' } }
    }));
    const row = result.rows.find((r) => r.field_key === 'brand');
    assert.ok(row);
    assert.equal(row.priority_bucket, 'core');
  });

  it('critical required_level → core bucket', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['sensor'],
      fieldRules: { sensor: { required_level: 'critical' } }
    }));
    const row = result.rows.find((r) => r.field_key === 'sensor');
    assert.ok(row);
    assert.equal(row.priority_bucket, 'core');
  });

  it('required required_level → core bucket', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required' } }
    }));
    const row = result.rows.find((r) => r.field_key === 'weight');
    assert.ok(row);
    assert.equal(row.priority_bucket, 'core');
  });

  it('expected required_level → secondary bucket', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['polling_rate'],
      fieldRules: { polling_rate: { required_level: 'expected' } }
    }));
    const row = result.rows.find((r) => r.field_key === 'polling_rate');
    assert.ok(row);
    assert.equal(row.priority_bucket, 'secondary');
  });

  it('optional required_level → optional bucket', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['rgb'],
      fieldRules: { rgb: { required_level: 'optional' } }
    }));
    const row = result.rows.find((r) => r.field_key === 'rgb');
    assert.ok(row);
    assert.equal(row.priority_bucket, 'optional');
  });
});

describe('Phase 01 — Bundle Formation', () => {
  it('fields with shared search_hints are grouped into the same bundle', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight', 'dpi_max'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { query_terms: ['weight'], preferred_content_types: ['spec_sheet'], domain_hints: [] }
        },
        dpi_max: {
          required_level: 'required',
          search_hints: { query_terms: ['dpi'], preferred_content_types: ['spec_sheet'], domain_hints: [] }
        }
      }
    }));
    assert.ok(result.bundles.length >= 1, 'should have at least one bundle');
    // Fields sharing spec_sheet content type and same bucket should be bundled together
    const bundle = result.bundles.find((b) => b.fields.includes('weight') && b.fields.includes('dpi_max'));
    assert.ok(bundle, 'weight and dpi_max should be in the same bundle (shared spec_sheet + core bucket)');
  });

  it('fields with different priority_buckets are in different bundles', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['sensor', 'rgb'],
      fieldRules: {
        sensor: {
          required_level: 'critical',
          search_hints: { query_terms: ['sensor'], preferred_content_types: ['spec_sheet'], domain_hints: [] }
        },
        rgb: {
          required_level: 'optional',
          search_hints: { query_terms: ['rgb'], preferred_content_types: ['spec_sheet'], domain_hints: [] }
        }
      }
    }));
    assert.ok(result.bundles.length >= 2, 'core and optional should be in separate bundles');
    const sensorBundle = result.bundles.find((b) => b.fields.includes('sensor'));
    const rgbBundle = result.bundles.find((b) => b.fields.includes('rgb'));
    assert.ok(sensorBundle);
    assert.ok(rgbBundle);
    assert.notEqual(sensorBundle.bundle_id, rgbBundle.bundle_id, 'different buckets → different bundles');
  });

  it('each bundle has required metadata fields', () => {
    const result = computeNeedSet(makeBaseInput());
    for (const bundle of result.bundles) {
      assert.ok(bundle.bundle_id, 'bundle must have bundle_id');
      assert.ok(bundle.label, 'bundle must have label');
      assert.ok(bundle.priority_bucket, 'bundle must have priority_bucket');
      assert.ok(Array.isArray(bundle.fields), 'bundle must have fields array');
      assert.ok(bundle.fields.length > 0, 'bundle must have at least one field');
      assert.ok(Array.isArray(bundle.preferred_content_types), 'bundle must have preferred_content_types');
      assert.ok(Array.isArray(bundle.query_terms), 'bundle must have query_terms');
      assert.ok(Array.isArray(bundle.domain_hints), 'bundle must have domain_hints');
      assert.ok(Array.isArray(bundle.planned_query_families), 'bundle must have planned_query_families');
    }
  });
});

describe('Phase 01 — Profile Mix Derivation', () => {
  it('profile_mix has correct keys', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(result.profile_mix, 'profile_mix must exist');
    const keys = Object.keys(result.profile_mix);
    for (const expected of ['manufacturer_html', 'manual_pdf', 'support_docs', 'fallback_web', 'targeted_single_field']) {
      assert.ok(keys.includes(expected), `profile_mix must include ${expected}`);
    }
  });

  it('profile_mix values are non-negative integers', () => {
    const result = computeNeedSet(makeBaseInput());
    for (const [key, val] of Object.entries(result.profile_mix)) {
      assert.ok(Number.isInteger(val) && val >= 0, `profile_mix.${key} should be non-negative integer, got ${val}`);
    }
  });
});

describe('Phase 01 — Focus Fields', () => {
  it('focus_fields contains top core unresolved fields', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(Array.isArray(result.focus_fields), 'focus_fields must be an array');
    assert.ok(result.focus_fields.length > 0, 'should have focus fields when fields are missing');
    // All focus_fields should be in rows
    for (const f of result.focus_fields) {
      const row = result.rows.find((r) => r.field_key === f);
      assert.ok(row, `focus field "${f}" must exist in rows`);
    }
  });

  it('focus_fields prioritizes core bucket fields', () => {
    const result = computeNeedSet(makeBaseInput());
    const focusRows = result.focus_fields.map((f) => result.rows.find((r) => r.field_key === f));
    const coreCount = focusRows.filter((r) => r.priority_bucket === 'core').length;
    const optionalCount = focusRows.filter((r) => r.priority_bucket === 'optional').length;
    assert.ok(coreCount >= optionalCount, 'focus_fields should prefer core fields');
  });
});

describe('Phase 01 — Summary Counts', () => {
  it('summary has correct structure and counts', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(result.summary, 'summary must exist');
    assert.equal(typeof result.summary.core_unresolved, 'number');
    assert.equal(typeof result.summary.secondary_unresolved, 'number');
    assert.equal(typeof result.summary.optional_unresolved, 'number');
    assert.equal(typeof result.summary.conflicts, 'number');
    assert.equal(typeof result.summary.bundles_planned, 'number');
  });

  it('summary counts match row data', () => {
    const result = computeNeedSet(makeBaseInput());
    const coreRows = result.rows.filter((r) => r.priority_bucket === 'core');
    const secondaryRows = result.rows.filter((r) => r.priority_bucket === 'secondary');
    const optionalRows = result.rows.filter((r) => r.priority_bucket === 'optional');
    const conflictRows = result.rows.filter((r) => r.state === 'conflict');
    assert.equal(result.summary.core_unresolved, coreRows.length);
    assert.equal(result.summary.secondary_unresolved, secondaryRows.length);
    assert.equal(result.summary.optional_unresolved, optionalRows.length);
    assert.equal(result.summary.conflicts, conflictRows.length);
    assert.equal(result.summary.bundles_planned, result.bundles.length);
  });
});

describe('Phase 01 — Row Output Shape', () => {
  it('every row has required fields', () => {
    const result = computeNeedSet(makeBaseInput());
    for (const row of result.rows) {
      assert.ok(row.field_key, 'row must have field_key');
      assert.ok(row.required_level, 'row must have required_level');
      assert.ok(row.priority_bucket, 'row must have priority_bucket');
      assert.ok(['missing', 'weak', 'conflict', 'covered'].includes(row.state), `row state must be valid, got "${row.state}"`);
      assert.ok(row.bundle_id, 'row must have bundle_id');
    }
  });

  it('rows are sorted by priority_bucket then field_key', () => {
    const result = computeNeedSet(makeBaseInput());
    const bucketOrder = { core: 0, secondary: 1, optional: 2 };
    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1];
      const curr = result.rows[i];
      const prevOrder = bucketOrder[prev.priority_bucket] ?? 3;
      const currOrder = bucketOrder[curr.priority_bucket] ?? 3;
      assert.ok(
        prevOrder < currOrder || (prevOrder === currOrder && prev.field_key <= curr.field_key),
        `rows must be sorted: ${prev.field_key}(${prev.priority_bucket}) should come before ${curr.field_key}(${curr.priority_bucket})`
      );
    }
  });
});

describe('Phase 01 — Edge Cases', () => {
  it('empty provenance — all fields become rows', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.rows.length, 5, 'all 5 fields should be in rows when provenance is empty');
    assert.equal(result.total_fields, 5);
  });

  it('all covered — no rows, no bundles', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: {
        weight: { value: '58g', confidence: 0.95, pass_target: 0.8, evidence: [{ url: 'a', tier: 1 }, { url: 'b', tier: 1 }] },
        sensor: { value: 'PAW3950', confidence: 0.95, pass_target: 0.8, evidence: [{ url: 'a', tier: 1 }, { url: 'b', tier: 1 }] },
        dpi_max: { value: '30000', confidence: 0.95, pass_target: 0.8, evidence: [{ url: 'a', tier: 1 }] },
        rgb: { value: 'yes', confidence: 0.95, pass_target: 0.8, evidence: [{ url: 'a', tier: 1 }] },
        brand: { value: 'Razer', confidence: 0.95, pass_target: 0.8, evidence: [{ url: 'a', tier: 1 }] }
      }
    }));
    assert.equal(result.rows.length, 0, 'no rows when all covered');
    assert.equal(result.bundles.length, 0, 'no bundles when all covered');
    assert.equal(result.summary.core_unresolved, 0);
  });

  it('all missing — all fields in rows', () => {
    const result = computeNeedSet(makeBaseInput({ provenance: {} }));
    assert.equal(result.rows.length, 5);
    for (const row of result.rows) {
      assert.equal(row.state, 'missing');
    }
  });

  it('no field rules — graceful empty result', () => {
    const result = computeNeedSet(makeBaseInput({ fieldRules: {}, fieldOrder: [] }));
    assert.equal(result.rows.length, 0);
    assert.equal(result.bundles.length, 0);
    assert.equal(result.total_fields, 0);
  });

  it('no search hints — fields still get rows and bundles', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required' } }
    }));
    assert.ok(result.rows.length >= 1);
    assert.ok(result.bundles.length >= 1);
  });

  it('handles empty/null/undefined inputs gracefully', () => {
    const result = computeNeedSet({});
    assert.equal(result.rows.length, 0);
    assert.equal(result.bundles.length, 0);
    assert.equal(result.total_fields, 0);
    assert.ok(result.summary);
    assert.ok(result.debug);
  });
});

describe('Phase 01 — Output Shape Verification (post-legacy-removal)', () => {
  it('rows.length matches summary counts', () => {
    const result = computeNeedSet(makeBaseInput());
    const missingCount = result.rows.filter((r) => r.state === 'missing').length;
    const weakCount = result.rows.filter((r) => r.state === 'weak').length;
    const conflictCount = result.rows.filter((r) => r.state === 'conflict').length;
    assert.equal(result.blockers.missing, missingCount);
    assert.equal(result.blockers.weak, weakCount);
    assert.equal(result.blockers.conflict, conflictCount);
  });

  it('summary reflects bucket counts', () => {
    const result = computeNeedSet(makeBaseInput());
    const coreCount = result.rows.filter((r) => r.priority_bucket === 'core').length;
    const secondaryCount = result.rows.filter((r) => r.priority_bucket === 'secondary').length;
    const optionalCount = result.rows.filter((r) => r.priority_bucket === 'optional').length;
    assert.equal(result.summary.core_unresolved, coreCount);
    assert.equal(result.summary.secondary_unresolved, secondaryCount);
    assert.equal(result.summary.optional_unresolved, optionalCount);
  });

  it('no legacy fields present on output', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.needs, undefined, 'needs[] must not exist');
    assert.equal(result.needset_size, undefined, 'needset_size must not exist');
    assert.equal(result.reason_counts, undefined, 'reason_counts must not exist');
    assert.equal(result.required_level_counts, undefined, 'required_level_counts must not exist');
    assert.equal(result.snapshots, undefined, 'snapshots must not exist');
    assert.equal(result.identity_lock_state, undefined, 'identity_lock_state must not exist');
  });
});

describe('Phase 01 — Identity Context in Debug', () => {
  it('identityContext is preserved in debug.identity_context', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(result.debug.identity_context, 'debug.identity_context must exist');
    assert.equal(result.debug.identity_context.status, 'locked');
  });

  it('identity state NOT used for scoring — no score impact from identity status', () => {
    // Same field, same provenance, different identity statuses should produce same state
    const locked = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required' } },
      identityContext: makeIdentityLocked()
    }));
    const unlocked = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required' } },
      identityContext: makeIdentityUnlocked()
    }));
    const lockedRow = locked.rows.find((r) => r.field_key === 'weight');
    const unlockedRow = unlocked.rows.find((r) => r.field_key === 'weight');
    assert.ok(lockedRow, 'weight in locked result');
    assert.ok(unlockedRow, 'weight in unlocked result');
    assert.equal(lockedRow.state, unlockedRow.state, 'state should be same regardless of identity');
    assert.equal(lockedRow.priority_bucket, unlockedRow.priority_bucket, 'bucket should be same regardless of identity');
  });
});

describe('Phase 01 — Schema 2 need_score in fields[]', () => {
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

describe('Phase 01 — Determinism', () => {
  it('same inputs produce identical bundle ordering', () => {
    const input = makeBaseInput();
    const result1 = computeNeedSet(input);
    const result2 = computeNeedSet(input);
    assert.deepEqual(
      result1.bundles.map((b) => b.bundle_id),
      result2.bundles.map((b) => b.bundle_id),
      'bundle ordering must be deterministic'
    );
    assert.deepEqual(
      result1.rows.map((r) => r.field_key),
      result2.rows.map((r) => r.field_key),
      'row ordering must be deterministic'
    );
  });
});

describe('Phase 01 — Top-Level Output Shape', () => {
  it('output has all required top-level keys', () => {
    const result = computeNeedSet(makeBaseInput());
    const requiredKeys = [
      'run_id', 'category', 'product_id', 'generated_at', 'total_fields',
      'summary', 'blockers', 'focus_fields', 'bundles', 'profile_mix',
      'rows', 'debug',
      // Schema 2 additions
      'schema_version', 'round', 'identity', 'fields', 'planner_seed'
    ];
    for (const key of requiredKeys) {
      assert.ok(key in result, `output must have "${key}"`);
    }
  });

  it('debug section has expected fields', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(result.debug, 'debug must exist');
    assert.ok(Array.isArray(result.debug.suppressed_duplicate_rows), 'debug.suppressed_duplicate_rows must be array');
    assert.ok(result.debug.state_inputs !== undefined, 'debug.state_inputs must exist');
    assert.ok(Array.isArray(result.debug.bundle_assignment_notes), 'debug.bundle_assignment_notes must be array');
    assert.ok(result.debug.identity_context !== undefined, 'debug.identity_context must exist');
  });
});

describe('Phase 01 — NeedSet Event Payload Shape (via runtimeBridge)', () => {
  it('needset_computed event payload matches new NeedSet output shape', async () => {
    const { createAuditHarness, makeRunStartedEvent, makeNeedsetComputedEvent } = await import('./helpers/phase00AuditHarness.js');
    const harness = createAuditHarness();
    const bridge = await harness.setup();
    const runId = 'r_needset_event_test';

    await harness.feedEvents([
      makeRunStartedEvent(runId),
      makeNeedsetComputedEvent(runId, {
        total_fields: 60,
        fields: [
          { field_key: 'weight', required_level: 'required', state: 'missing', need_score: 10 }
        ],
        rows: [
          { field_key: 'weight', required_level: 'required', priority_bucket: 'core', state: 'missing', bundle_id: '' }
        ],
        focus_fields: ['weight'],
        bundles: [],
        summary: { core_unresolved: 1, secondary_unresolved: 0, optional_unresolved: 0, conflicts: 0, bundles_planned: 0 },
        blockers: { missing: 1, weak: 0, conflict: 0 },
        profile_mix: { manufacturer_html: 0, manual_pdf: 0, support_docs: 0, fallback_web: 0, targeted_single_field: 0 }
      })
    ]);

    const events = await harness.getEmittedEvents();
    const ncEvent = events.find((e) => e.event === 'needset_computed');
    assert.ok(ncEvent, 'needset_computed event should exist');

    const requiredPayloadKeys = [
      'total_fields', 'summary', 'blockers', 'focus_fields',
      'bundles', 'rows', 'needset_size', 'fields'
    ];
    const missing = requiredPayloadKeys.filter((k) => !(k in ncEvent.payload));
    assert.deepStrictEqual(missing, [], `needset_computed payload missing: ${missing.join(', ')}`);
    assert.equal(ncEvent.payload.total_fields, 60);
    // needset_size is backward-compat derived from rows.length
    assert.equal(ncEvent.payload.needset_size, 1);
    assert.equal(ncEvent.stage, 'index');

    await harness.cleanup();
  });

  it('runtimeBridge preserves identity in artifact via passthrough', async () => {
    const { createAuditHarness, makeRunStartedEvent, makeNeedsetComputedEvent } = await import('./helpers/phase00AuditHarness.js');
    const harness = createAuditHarness();
    await harness.setup();
    const runId = 'r_needset_identity_breakdown';

    await harness.feedEvents([
      makeRunStartedEvent(runId),
      makeNeedsetComputedEvent(runId, {
        total_fields: 10,
        rows: [],
        fields: [],
        focus_fields: [],
        bundles: [],
        identity: {
          state: 'conflict',
          confidence: 0.32,
          manufacturer: 'TestBrand',
          model: 'TestModel'
        }
      })
    ]);

    const needsetArtifact = await harness.getNeedSet();
    assert.ok(needsetArtifact, 'needset artifact should be written');
    assert.equal(needsetArtifact.identity?.state, 'conflict');
    assert.equal(needsetArtifact.identity?.confidence, 0.32);

    await harness.cleanup();
  });
});

// --- Schema 2 output shape tests ---

describe('Phase 01 — Schema 2 Top-Level Shape', () => {
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

describe('Phase 01 — Schema 2 Identity Block', () => {
  it('locked identity with high confidence → state=locked, source_label_state=matched', () => {
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

  it('unlocked identity with low confidence → state=unknown, source_label_state=unknown', () => {
    const result = computeNeedSet(makeBaseInput({
      identityContext: makeIdentityUnlocked()
    }));
    assert.equal(result.identity.state, 'unknown');
    assert.equal(result.identity.source_label_state, 'unknown');
  });

  it('conflict identity → state=conflict, source_label_state=different', () => {
    const result = computeNeedSet(makeBaseInput({
      identityContext: makeIdentityConflict()
    }));
    assert.equal(result.identity.state, 'conflict');
    assert.equal(result.identity.source_label_state, 'different');
  });
});

describe('Phase 01 — Schema 2 Summary (9-field)', () => {
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

  it('all fields missing → resolved=0, total=5', () => {
    const result = computeNeedSet(makeBaseInput({ provenance: {} }));
    assert.equal(result.summary.total, 5);
    assert.equal(result.summary.resolved, 0);
  });

  it('all fields covered → resolved=5, unresolved all 0', () => {
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

describe('Phase 01 — Schema 2 Blockers (5-field)', () => {
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

describe('Phase 01 — Schema 2 fields[] per-field shape', () => {
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
    assert.ok(Array.isArray(wField.idx.preferred_content_types));

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

describe('Phase 01 — Schema 2 reasons[] derivation', () => {
  it('missing field → reasons includes "missing"', () => {
    const result = computeNeedSet(makeBaseInput());
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField.reasons.includes('missing'));
  });

  it('conflict field → reasons includes "conflict"', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: { weight: { value: '58g', confidence: 0.9, pass_target: 0.8 } },
      fieldReasoning: { weight: { reasons: ['constraint_conflict'] } }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField.reasons.includes('conflict'));
  });

  it('low confidence → reasons includes "low_conf"', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: { weight: { value: '58g', confidence: 0.4, pass_target: 0.8 } }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField.reasons.includes('low_conf'));
  });

  it('insufficient refs → reasons includes "min_refs_fail"', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required', min_evidence_refs: 3 } },
      provenance: { weight: { value: '58g', confidence: 0.95, pass_target: 0.8, evidence: [{ url: 'a', tier: 1 }] } }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(wField.reasons.includes('min_refs_fail'),
      `reasons should include min_refs_fail, got: ${JSON.stringify(wField.reasons)}`);
  });

  it('accepted field → empty reasons', () => {
    const result = computeNeedSet(makeBaseInput({
      provenance: {
        weight: { value: '58g', confidence: 0.95, pass_target: 0.8, evidence: [{ url: 'a', tier: 1 }, { url: 'b', tier: 1 }] }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepEqual(wField.reasons, []);
  });
});

describe('Phase 01 — Schema 2 planner_seed', () => {
  it('missing_critical_fields includes identity/critical fields that are unresolved', () => {
    const result = computeNeedSet(makeBaseInput());
    // brand is identity, sensor is critical — both missing
    assert.ok(result.planner_seed.missing_critical_fields.includes('brand'));
    assert.ok(result.planner_seed.missing_critical_fields.includes('sensor'));
    // weight is required, not critical — should NOT be in missing_critical
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

describe('Phase 01 — Schema 2 history (round 0)', () => {
  it('round 0 → all history fields are empty/zero', () => {
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

describe('Phase 01 — Schema 2 history (round 1+ carry-forward)', () => {
  it('round 1 with evidence → domains_tried populated from evidence', () => {
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

describe('Phase 01 — Schema 2 backward compat', () => {
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
// GAP-1: Logic Box 1 — idx hint normalization
// ============================================================

describe('Phase 01 — Logic Box 1: idx hint normalization', () => {
  it('query_terms are lowercased and trimmed', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { query_terms: ['  Weight ', 'GRAMS', 'Mouse Weight'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.query_terms, ['weight', 'grams', 'mouse weight']);
  });

  it('query_terms are deduplicated after normalization', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { query_terms: ['weight', 'Weight', 'WEIGHT', ' weight '] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.query_terms, ['weight']);
  });

  it('domain_hints are normalized to canonical host form (no protocol, no path)', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { domain_hints: ['https://rtings.com/mouse/reviews', 'HTTP://LOGITECHG.COM', 'sensor.fyi'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.domain_hints, ['rtings.com', 'logitechg.com', 'sensor.fyi']);
  });

  it('domain_hints are deduplicated after normalization', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { domain_hints: ['rtings.com', 'https://rtings.com', 'RTINGS.COM'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.domain_hints, ['rtings.com']);
  });

  it('preferred_content_types are deduplicated', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { preferred_content_types: ['spec_sheet', 'product_page', 'spec_sheet', 'product_page'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.preferred_content_types, ['spec_sheet', 'product_page']);
  });

  it('preferred_content_types are lowercased and trimmed', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { preferred_content_types: [' Spec_Sheet ', 'PRODUCT_PAGE'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.deepStrictEqual(wField.idx.preferred_content_types, ['spec_sheet', 'product_page']);
  });

  it('empty strings are removed from query_terms', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: {
        weight: {
          required_level: 'required',
          search_hints: { query_terms: ['weight', '', '  ', null, 'grams'] }
        }
      }
    }));
    const wField = result.fields.find((f) => f.field_key === 'weight');
    assert.ok(!wField.idx.query_terms.includes(''));
    assert.ok(!wField.idx.query_terms.includes(null));
    assert.equal(wField.idx.query_terms.length, 2);
  });
});

// ============================================================
// GAP-2: blockers.search_exhausted derivation
// ============================================================

describe('Phase 01 — blockers.search_exhausted derivation', () => {
  it('search_exhausted = 0 when no field history (round 0)', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.blockers.search_exhausted, 0);
  });

  it('search_exhausted counts fields with high no_value_attempts and diverse evidence classes', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight', 'sensor'],
      fieldRules: {
        weight: { required_level: 'required', search_hints: {} },
        sensor: { required_level: 'critical', search_hints: {} }
      },
      round: 3,
      previousFieldHistories: {
        weight: {
          existing_queries: ['q1', 'q2', 'q3'],
          domains_tried: ['a.com', 'b.com', 'c.com'],
          host_classes_tried: ['official', 'review', 'retailer'],
          evidence_classes_tried: ['manufacturer_html', 'review', 'retailer'],
          query_count: 3,
          urls_examined_count: 6,
          no_value_attempts: 3,
          duplicate_attempts_suppressed: 0
        },
        sensor: {
          existing_queries: ['q1'],
          domains_tried: ['a.com'],
          host_classes_tried: ['official'],
          evidence_classes_tried: ['manufacturer_html'],
          query_count: 1,
          urls_examined_count: 1,
          no_value_attempts: 1,
          duplicate_attempts_suppressed: 0
        }
      }
    }));
    // weight: 3 no_value_attempts + 3 evidence classes → exhausted
    // sensor: only 1 no_value_attempt + 1 evidence class → NOT exhausted
    assert.equal(result.blockers.search_exhausted, 1);
  });

  it('search_exhausted = 0 when field has value despite many attempts', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required', search_hints: {} } },
      provenance: { weight: { value: '58g', confidence: 0.95, pass_target: 0.8 } },
      round: 3,
      previousFieldHistories: {
        weight: {
          existing_queries: ['q1', 'q2', 'q3'],
          domains_tried: ['a.com', 'b.com'],
          host_classes_tried: ['official', 'review'],
          evidence_classes_tried: ['manufacturer_html', 'review', 'retailer'],
          query_count: 3,
          urls_examined_count: 5,
          no_value_attempts: 3,
          duplicate_attempts_suppressed: 0
        }
      }
    }));
    // field is covered → not exhausted
    assert.equal(result.blockers.search_exhausted, 0);
  });
});

// ── V4: normalizeFieldKey ──

describe('V4 — normalizeFieldKey', () => {
  it('replaces underscores with spaces', () => {
    assert.equal(normalizeFieldKey('battery_hours'), 'battery hours');
  });

  it('lowercases', () => {
    assert.equal(normalizeFieldKey('DPI_Max'), 'dpi max');
  });

  it('trims whitespace', () => {
    assert.equal(normalizeFieldKey('  weight  '), 'weight');
  });

  it('single word unchanged except lowercase', () => {
    assert.equal(normalizeFieldKey('rgb'), 'rgb');
  });

  it('empty/null → empty string', () => {
    assert.equal(normalizeFieldKey(''), '');
    assert.equal(normalizeFieldKey(null), '');
    assert.equal(normalizeFieldKey(undefined), '');
  });

  it('multiple underscores', () => {
    assert.equal(normalizeFieldKey('feet_material_type'), 'feet material type');
  });
});

// ── V4: buildAllAliases ──

describe('V4 — buildAllAliases', () => {
  it('unions all sources, dedupes, sorts', () => {
    const result = buildAllAliases({
      normalizedKey: 'battery hours',
      displayName: 'Battery Life (Hours)',
      fieldAliases: ['battery life', 'battery runtime'],
      queryTerms: ['battery life', 'battery hours', 'runtime'],
    });
    assert.deepStrictEqual(result, [
      'battery hours',
      'battery life',
      'battery life (hours)',
      'battery runtime',
      'runtime',
    ]);
  });

  it('case-insensitive dedup', () => {
    const result = buildAllAliases({
      normalizedKey: 'dpi',
      displayName: 'DPI',
      fieldAliases: ['dpi', 'CPI'],
      queryTerms: ['DPI', 'cpi', 'max dpi'],
    });
    assert.ok(!result.some((a, i) => result.indexOf(a) !== i), 'no duplicates');
    assert.ok(result.includes('dpi'));
    assert.ok(result.includes('cpi'));
    assert.ok(result.includes('max dpi'));
  });

  it('empty inputs → empty array', () => {
    const result = buildAllAliases({
      normalizedKey: '',
      displayName: '',
      fieldAliases: [],
      queryTerms: [],
    });
    assert.deepStrictEqual(result, []);
  });

  it('filters out empty strings', () => {
    const result = buildAllAliases({
      normalizedKey: 'weight',
      displayName: '',
      fieldAliases: ['', '  '],
      queryTerms: ['weight'],
    });
    assert.ok(!result.includes(''));
    assert.ok(result.includes('weight'));
  });
});

// ── V4: shardAliases ──

describe('V4 — shardAliases', () => {
  it('short alias list → single shard', () => {
    const aliases = ['weight', 'mass', 'grams'];
    const result = shardAliases(aliases, 8);
    assert.equal(result.length, 1);
    assert.deepStrictEqual(result[0], aliases);
  });

  it('long alias list → multiple shards at whole alias boundaries', () => {
    const aliases = ['motion to photon latency', 'click delay', 'input lag', 'response time ms'];
    const result = shardAliases(aliases, 5);
    // "motion to photon latency" = 4 words → fits in shard 1
    // "click delay" = 2 words → would make shard 1 = 6 words, over limit → shard 2
    assert.equal(result.length, 3);
    assert.deepStrictEqual(result[0], ['motion to photon latency']);
    assert.deepStrictEqual(result[1], ['click delay', 'input lag']);
    assert.deepStrictEqual(result[2], ['response time ms']);
  });

  it('never splits a multi-word alias across shards', () => {
    const aliases = ['very long alias with many words here'];
    const result = shardAliases(aliases, 3);
    // Single alias exceeds limit but must stay intact in its own shard
    assert.equal(result.length, 1);
    assert.deepStrictEqual(result[0], ['very long alias with many words here']);
  });

  it('empty aliases → empty array', () => {
    assert.deepStrictEqual(shardAliases([], 8), []);
  });

  it('respects custom maxTokensPerShard', () => {
    const aliases = ['a', 'b', 'c', 'd', 'e'];
    const result = shardAliases(aliases, 2);
    assert.equal(result.length, 3);
    assert.deepStrictEqual(result[0], ['a', 'b']);
    assert.deepStrictEqual(result[1], ['c', 'd']);
    assert.deepStrictEqual(result[2], ['e']);
  });
});

// ── V4: Ranking helpers ──

describe('V4 — availabilityRank', () => {
  it('always=0, expected=1, sometimes=2, rare=3, editorial_only=4', () => {
    assert.equal(availabilityRank('always'), 0);
    assert.equal(availabilityRank('expected'), 1);
    assert.equal(availabilityRank('sometimes'), 2);
    assert.equal(availabilityRank('rare'), 3);
    assert.equal(availabilityRank('editorial_only'), 4);
  });

  it('unknown → highest rank (least available)', () => {
    assert.equal(availabilityRank('bogus'), 4);
    assert.equal(availabilityRank(''), 4);
  });
});

describe('V4 — difficultyRank', () => {
  it('easy=0, medium=1, hard=2', () => {
    assert.equal(difficultyRank('easy'), 0);
    assert.equal(difficultyRank('medium'), 1);
    assert.equal(difficultyRank('hard'), 2);
  });

  it('unknown → highest rank', () => {
    assert.equal(difficultyRank('impossible'), 2);
  });
});

describe('V4 — requiredLevelRank', () => {
  it('identity=0, critical=1, required=2, expected=3, optional=4', () => {
    assert.equal(requiredLevelRank('identity'), 0);
    assert.equal(requiredLevelRank('critical'), 1);
    assert.equal(requiredLevelRank('required'), 2);
    assert.equal(requiredLevelRank('expected'), 3);
    assert.equal(requiredLevelRank('optional'), 4);
  });
});

// ── V4: Schema 2 field entry additions ──

describe('V4 — Schema 2 field entries carry V4 fields', () => {
  it('every field has normalized_key, all_aliases, alias_shards, availability, difficulty', () => {
    const result = computeNeedSet(makeBaseInput());
    for (const f of result.fields) {
      assert.ok(typeof f.normalized_key === 'string', `${f.field_key} missing normalized_key`);
      assert.ok(Array.isArray(f.all_aliases), `${f.field_key} missing all_aliases`);
      assert.ok(Array.isArray(f.alias_shards), `${f.field_key} missing alias_shards`);
      assert.ok(typeof f.availability === 'string', `${f.field_key} missing availability`);
      assert.ok(typeof f.difficulty === 'string', `${f.field_key} missing difficulty`);
      assert.ok(typeof f.repeat_count === 'number', `${f.field_key} missing repeat_count`);
      assert.ok(Array.isArray(f.query_modes_tried_for_key), `${f.field_key} missing query_modes_tried_for_key`);
      assert.ok(Array.isArray(f.domains_tried_for_key), `${f.field_key} missing domains_tried_for_key`);
      assert.ok(Array.isArray(f.content_types_tried_for_key), `${f.field_key} missing content_types_tried_for_key`);
    }
  });

  it('normalized_key derives correctly from field_key', () => {
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['dpi_max'], fieldRules: { dpi_max: makeBaseRules().dpi_max } }));
    const f = result.fields.find((x) => x.field_key === 'dpi_max');
    assert.equal(f.normalized_key, 'dpi max');
  });

  it('all_aliases unions display_name + normalized_key + rule.aliases + query_terms', () => {
    const rules = {
      weight: {
        required_level: 'required', display_name: 'Weight',
        aliases: ['mass'], min_evidence_refs: 1,
        search_hints: { query_terms: ['weight', 'grams'], preferred_content_types: ['spec'], domain_hints: [] }
      }
    };
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['weight'], fieldRules: rules }));
    const f = result.fields.find((x) => x.field_key === 'weight');
    assert.ok(f.all_aliases.includes('weight'));
    assert.ok(f.all_aliases.includes('mass'));
    assert.ok(f.all_aliases.includes('grams'));
  });

  it('repeat_count = 0 on round 0', () => {
    const result = computeNeedSet(makeBaseInput({ round: 0 }));
    for (const f of result.fields) {
      assert.equal(f.repeat_count, 0);
    }
  });

  it('repeat_count carries from history on round 1+', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: makeBaseRules().weight },
      round: 2,
      previousFieldHistories: { weight: { query_count: 5, existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], urls_examined_count: 0, no_value_attempts: 1, duplicate_attempts_suppressed: 0, query_modes_tried_for_key: ['key_search'] } }
    }));
    const f = result.fields.find((x) => x.field_key === 'weight');
    assert.equal(f.repeat_count, 5);
    assert.deepStrictEqual(f.query_modes_tried_for_key, ['key_search']);
  });

  it('query_modes_tried_for_key empty on round 0', () => {
    const result = computeNeedSet(makeBaseInput({ round: 0 }));
    const f = result.fields[0];
    assert.deepStrictEqual(f.query_modes_tried_for_key, []);
  });
});

// ── V4: search_intent per field ──

describe('V4 — search_intent is per-field, not per-group', () => {
  it('exact_match_required=true → search_intent=exact_match', () => {
    const rules = {
      f1: { required_level: 'required', contract: { exact_match: true }, search_hints: { query_terms: ['x'], domain_hints: [] } }
    };
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['f1'], fieldRules: rules }));
    const f = result.fields.find((x) => x.field_key === 'f1');
    assert.equal(f.search_intent, 'exact_match');
  });

  it('exact_match_required=false → search_intent=broad', () => {
    const result = computeNeedSet(makeBaseInput());
    const f = result.fields[0];
    assert.equal(f.search_intent, 'broad');
  });
});

// ── V4: Schema version bump ──

describe('V4 — schema version', () => {
  it('schema_version is needset_output.v2.1', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.schema_version, 'needset_output.v2.1');
  });
});

// ── V4: sorted_unresolved_keys ──

describe('V4 — sorted_unresolved_keys', () => {
  it('exists on output and is an array', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(Array.isArray(result.sorted_unresolved_keys));
  });

  it('contains only unresolved field_keys', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight', 'sensor'],
      fieldRules: { weight: makeBaseRules().weight, sensor: makeBaseRules().sensor },
      provenance: { weight: { value: '58g', confidence: 0.95, pass_target: 0.8 } }
    }));
    // weight is resolved, sensor is unresolved
    assert.ok(!result.sorted_unresolved_keys.includes('weight'));
    assert.ok(result.sorted_unresolved_keys.includes('sensor'));
  });

  it('sorts by availability first (easy-to-find fields first)', () => {
    const rules = {
      rare_field: { required_level: 'expected', priority: { availability: 'rare', difficulty: 'easy' }, search_hints: { query_terms: ['x'], domain_hints: [] } },
      always_field: { required_level: 'expected', priority: { availability: 'always', difficulty: 'easy' }, search_hints: { query_terms: ['y'], domain_hints: [] } },
    };
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['rare_field', 'always_field'], fieldRules: rules }));
    const idx_always = result.sorted_unresolved_keys.indexOf('always_field');
    const idx_rare = result.sorted_unresolved_keys.indexOf('rare_field');
    assert.ok(idx_always < idx_rare, 'always should sort before rare');
  });

  it('same availability → sorts by difficulty (easy before hard)', () => {
    const rules = {
      hard_field: { required_level: 'expected', priority: { availability: 'expected', difficulty: 'hard' }, search_hints: { query_terms: ['x'], domain_hints: [] } },
      easy_field: { required_level: 'expected', priority: { availability: 'expected', difficulty: 'easy' }, search_hints: { query_terms: ['y'], domain_hints: [] } },
    };
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['hard_field', 'easy_field'], fieldRules: rules }));
    const idx_easy = result.sorted_unresolved_keys.indexOf('easy_field');
    const idx_hard = result.sorted_unresolved_keys.indexOf('hard_field');
    assert.ok(idx_easy < idx_hard, 'easy should sort before hard');
  });

  it('required_level is tie-breaker only', () => {
    const rules = {
      optional_easy: { required_level: 'optional', priority: { availability: 'always', difficulty: 'easy' }, search_hints: { query_terms: ['x'], domain_hints: [] } },
      critical_hard: { required_level: 'critical', priority: { availability: 'rare', difficulty: 'hard' }, search_hints: { query_terms: ['y'], domain_hints: [] } },
    };
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['optional_easy', 'critical_hard'], fieldRules: rules }));
    const idx_opt = result.sorted_unresolved_keys.indexOf('optional_easy');
    const idx_crit = result.sorted_unresolved_keys.indexOf('critical_hard');
    // optional_easy has availability=always, difficulty=easy → sorts first despite being optional
    assert.ok(idx_opt < idx_crit, 'availability/difficulty should outrank required_level');
  });

  it('backward compat: rows still sorted by bucket then field_key', () => {
    const result = computeNeedSet(makeBaseInput());
    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1];
      const curr = result.rows[i];
      const prevBucket = prev.priority_bucket === 'core' ? 0 : prev.priority_bucket === 'secondary' ? 1 : 2;
      const currBucket = curr.priority_bucket === 'core' ? 0 : curr.priority_bucket === 'secondary' ? 1 : 2;
      assert.ok(prevBucket <= currBucket, 'rows should still be sorted by bucket');
    }
  });
});

// ---------------------------------------------------------------------------
// deriveQueryFamilies — exact-match routing
// ---------------------------------------------------------------------------

describe('deriveQueryFamilies', () => {
  const cases = [
    // Existing tokens (should stay green)
    { contentTarget: ['manual'],       domainHints: [], expected: ['manual_pdf'] },
    { contentTarget: ['pdf'],          domainHints: [], expected: ['manual_pdf'] },
    { contentTarget: ['support'],      domainHints: [], expected: ['support_docs'] },
    { contentTarget: ['spec'],         domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['product_page'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['review'],       domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['lab_review'],   domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['spec_sheet'],   domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['manual_pdf'],   domainHints: [], expected: ['manual_pdf'] },

    // Missing tokens — currently fall to fallback_web (RED tests)
    { contentTarget: ['benchmark'],    domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['teardown'],     domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['lab'],          domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['datasheet'],    domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['comparison'],   domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['reference'],    domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['doc'],          domainHints: [], expected: ['support_docs'] },
    { contentTarget: ['documentation'], domainHints: [], expected: ['support_docs'] },
    { contentTarget: ['datasheet_pdf'], domainHints: [], expected: ['manual_pdf'] },
    { contentTarget: ['spec_pdf'],     domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['teardown_review'], domainHints: [], expected: ['manufacturer_html'] },

    // Fallback / edge cases
    { contentTarget: ['unknown_token'], domainHints: [], expected: ['fallback_web'] },
    { contentTarget: [],                domainHints: [], expected: ['fallback_web'] },
    { contentTarget: [],                domainHints: ['rtings.com'], expected: ['manufacturer_html'] },
    { contentTarget: ['manual', 'spec'], domainHints: [], expected: ['manual_pdf', 'manufacturer_html'] },

    // Normalization
    { contentTarget: ['  SPEC  '],     domainHints: [], expected: ['manufacturer_html'] },
  ];

  for (const { contentTarget, domainHints, expected } of cases) {
    it(`routes ${JSON.stringify(contentTarget)} + hints=${domainHints.length} → ${JSON.stringify(expected)}`, () => {
      const result = deriveQueryFamilies(contentTarget, domainHints);
      assert.deepStrictEqual(result, expected);
    });
  }
});

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

describe('Phase 01 â€” Field State Derivation', () => {
  it('missing field â†’ state=missing when no provenance value', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: makeBaseRules().weight }
    }));
    const row = result.rows.find((r) => r.field_key === 'weight');
    assert.ok(row, 'missing weight should appear in rows');
    assert.equal(row.state, 'missing');
  });

  it('unk/unknown tokens â†’ state=missing', () => {
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

  it('weak field â†’ state=weak when confidence < pass_target', () => {
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

  it('conflict field â†’ state=conflict when fieldReasoning has constraint_conflict', () => {
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

  it('conflict field â†’ state=conflict when constraintAnalysis has contradictions', () => {
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

  it('covered field â†’ excluded from rows', () => {
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

describe('Phase 01 â€” Priority Bucket Mapping', () => {
  it('identity required_level â†’ core bucket', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['brand'],
      fieldRules: { brand: { required_level: 'identity' } }
    }));
    const row = result.rows.find((r) => r.field_key === 'brand');
    assert.ok(row);
    assert.equal(row.priority_bucket, 'core');
  });

  it('critical required_level â†’ core bucket', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['sensor'],
      fieldRules: { sensor: { required_level: 'critical' } }
    }));
    const row = result.rows.find((r) => r.field_key === 'sensor');
    assert.ok(row);
    assert.equal(row.priority_bucket, 'core');
  });

  it('required required_level â†’ core bucket', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: { required_level: 'required' } }
    }));
    const row = result.rows.find((r) => r.field_key === 'weight');
    assert.ok(row);
    assert.equal(row.priority_bucket, 'core');
  });

  it('expected required_level â†’ secondary bucket', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['polling_rate'],
      fieldRules: { polling_rate: { required_level: 'expected' } }
    }));
    const row = result.rows.find((r) => r.field_key === 'polling_rate');
    assert.ok(row);
    assert.equal(row.priority_bucket, 'secondary');
  });

  it('optional required_level â†’ optional bucket', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['rgb'],
      fieldRules: { rgb: { required_level: 'optional' } }
    }));
    const row = result.rows.find((r) => r.field_key === 'rgb');
    assert.ok(row);
    assert.equal(row.priority_bucket, 'optional');
  });
});

describe('Phase 01 â€” Bundle Formation', () => {
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
    assert.notEqual(sensorBundle.bundle_id, rgbBundle.bundle_id, 'different buckets â†’ different bundles');
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

describe('Phase 01 â€” Profile Mix Derivation', () => {
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

describe('Phase 01 â€” Focus Fields', () => {
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

describe('Phase 01 â€” Summary Counts', () => {
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

describe('Phase 01 â€” Row Output Shape', () => {
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

describe('Phase 01 â€” Edge Cases', () => {
  it('empty provenance â€” all fields become rows', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.rows.length, 5, 'all 5 fields should be in rows when provenance is empty');
    assert.equal(result.total_fields, 5);
  });

  it('all covered â€” no rows, no bundles', () => {
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

  it('all missing â€” all fields in rows', () => {
    const result = computeNeedSet(makeBaseInput({ provenance: {} }));
    assert.equal(result.rows.length, 5);
    for (const row of result.rows) {
      assert.equal(row.state, 'missing');
    }
  });

  it('no field rules â€” graceful empty result', () => {
    const result = computeNeedSet(makeBaseInput({ fieldRules: {}, fieldOrder: [] }));
    assert.equal(result.rows.length, 0);
    assert.equal(result.bundles.length, 0);
    assert.equal(result.total_fields, 0);
  });

  it('no search hints â€” fields still get rows and bundles', () => {
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

describe('Phase 01 â€” blockers.search_exhausted derivation', () => {
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
    // weight: 3 no_value_attempts + 3 evidence classes â†’ exhausted
    // sensor: only 1 no_value_attempt + 1 evidence class â†’ NOT exhausted
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
    // field is covered â†’ not exhausted
    assert.equal(result.blockers.search_exhausted, 0);
  });
});

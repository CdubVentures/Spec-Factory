// Retirement proof: conflict_policy_hold flag and conflict_policy field are removed.
// These tests are RED until the conflict_policy knob is deleted from reviewGridHelpers.
// See: docs/implementation/field-rules-studio/evidence-knob-retirement-roadmap.md

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferFlags,
  normalizeFieldContract,
  REAL_FLAG_CODES,
} from '../reviewGridHelpers.js';

// --- Retirement proof: conflict_policy_hold removed from flag codes ---

test('REAL_FLAG_CODES does not include conflict_policy_hold', () => {
  assert.equal(
    REAL_FLAG_CODES.has('conflict_policy_hold'),
    false,
    'conflict_policy_hold should be removed from REAL_FLAG_CODES',
  );
});

// --- Retirement proof: normalizeFieldContract no longer outputs conflict_policy ---

test('normalizeFieldContract output does not include conflict_policy', () => {
  const result = normalizeFieldContract({
    contract: { type: 'number', shape: 'scalar' },
    evidence: { conflict_policy: 'preserve_all_candidates', min_evidence_refs: 1 },
  });
  assert.equal(
    'conflict_policy' in result,
    false,
    'normalizeFieldContract should not output conflict_policy',
  );
});

// --- Retirement proof: inferFlags never produces conflict_policy_hold ---

test('inferFlags never produces conflict_policy_hold regardless of input', () => {
  const flags = inferFlags({
    reasonCodes: [],
    fieldRule: { conflict_policy: 'preserve_all_candidates', min_evidence_refs: 1 },
    candidates: [
      { value: 'value_a', source_id: 'src1' },
      { value: 'value_b', source_id: 'src2' },
    ],
    overridden: false,
  });
  assert.equal(
    flags.includes('conflict_policy_hold'),
    false,
    'conflict_policy_hold should never be produced',
  );
});

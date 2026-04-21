// Retirement proof: compiled field rules no longer emit evidence_required or conflict_policy.
// These tests are RED until the knobs are removed from the compiler.
// See: docs/implementation/field-rules-studio/evidence-knob-retirement-roadmap.md

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFieldRulesForPhase1 } from '../compiler.js';

function compileTestField(overrides = {}) {
  const input = {
    category: 'mouse',
    fields: {
      test_field: {
        required_level: 'non_mandatory',
        contract: { type: 'number', shape: 'scalar' },
        ...overrides,
      },
    },
  };
  const result = normalizeFieldRulesForPhase1(input);
  return result.fields.test_field;
}

// --- Retirement proof: evidence block contains only surviving keys ---

test('compiled evidence block does not contain required key', () => {
  const rule = compileTestField();
  assert.equal(
    'required' in rule.evidence,
    false,
    'evidence.required should not be emitted after retirement',
  );
});

test('compiled evidence block does not contain conflict_policy key', () => {
  const rule = compileTestField({
    evidence: { conflict_policy: 'preserve_all_candidates' },
  });
  assert.equal(
    'conflict_policy' in rule.evidence,
    false,
    'evidence.conflict_policy should not be emitted after retirement',
  );
});

// --- Retirement proof: flat evidence_required key no longer exists ---

test('compiled field rules do not have flat evidence_required key', () => {
  const rule = compileTestField();
  assert.equal(
    rule.evidence_required,
    undefined,
    'evidence_required should not exist on compiled rules',
  );
});

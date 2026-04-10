// Forward contract: evidence enforcement is controlled by min_evidence_refs alone.
// evidence_required is being retired — this test does NOT use it.
// See: docs/implementation/field-rules-studio/evidence-knob-retirement-roadmap.md

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FieldRulesEngine } from '../fieldRulesEngine.js';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import {
  writeJson,
  goodProvenance,
  goodEvidencePack,
} from './helpers/runtimeGateHarness.js';

// --- Fixture: fields vary only by min_evidence_refs (no evidence_required key) ---

async function createEvidenceContractFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'evidence-contract-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      field_a: {
        required_level: 'expected',
        difficulty: 'easy',
        availability: 'always',
        evidence: { min_evidence_refs: 1, tier_preference: ['tier1', 'tier2', 'tier3'] },
        contract: { type: 'number', shape: 'scalar' },
      },
      field_b: {
        required_level: 'required',
        difficulty: 'easy',
        availability: 'always',
        evidence: { min_evidence_refs: 2, tier_preference: ['tier1', 'tier2', 'tier3'] },
        contract: { type: 'number', shape: 'scalar' },
      },
      field_c: {
        required_level: 'optional',
        difficulty: 'easy',
        availability: 'always',
        evidence: { min_evidence_refs: 0, tier_preference: ['tier1', 'tier2', 'tier3'] },
        contract: { type: 'number', shape: 'scalar' },
      },
    },
  });

  await writeJson(path.join(generatedRoot, 'known_values.json'), { category: 'mouse', enums: {} });
  await writeJson(path.join(generatedRoot, 'parse_templates.json'), { category: 'mouse', templates: {} });
  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), { category: 'mouse', rules: [] });
  await writeJson(path.join(generatedRoot, 'key_migrations.json'), {
    version: '1.0.0', previous_version: '1.0.0', bump: 'patch',
    summary: { added_count: 0, removed_count: 0, changed_count: 0 },
    key_map: {}, migrations: [],
  });
  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category: 'mouse',
    fields: [
      { key: 'field_a', group: 'test' },
      { key: 'field_b', group: 'test' },
      { key: 'field_c', group: 'test' },
    ],
  });

  return { root, helperRoot };
}

// --- Setup ---

const fixture = await createEvidenceContractFixture();
const engine = await FieldRulesEngine.create('mouse', {
  config: { categoryAuthorityRoot: fixture.helperRoot },
});

test.after(async () => {
  await fs.rm(fixture.root, { recursive: true, force: true });
});

// --- Contract tests ---

test('min_evidence_refs >= 1 enforces evidence audit — missing provenance sets field to unk', () => {
  const result = applyRuntimeFieldRules({
    engine,
    fields: { field_a: 42 },
    provenance: {},
    fieldOrder: ['field_a'],
    enforceEvidence: false,
    evidencePack: goodEvidencePack,
  });
  assert.equal(result.fields.field_a, null, 'field_a should be null without evidence');
  assert.ok(
    result.failures.some(f => f.field === 'field_a' && f.stage === 'evidence'),
    'should record evidence failure for field_a',
  );
});

test('min_evidence_refs >= 1 passes with good evidence', () => {
  const result = applyRuntimeFieldRules({
    engine,
    fields: { field_a: 42 },
    provenance: { field_a: goodProvenance('field_a') },
    fieldOrder: ['field_a'],
    enforceEvidence: false,
    evidencePack: goodEvidencePack,
  });
  assert.equal(result.fields.field_a, 42, 'field_a should be preserved with good evidence');
});

test('min_evidence_refs = 0 skips evidence audit — field passes without provenance', () => {
  const result = applyRuntimeFieldRules({
    engine,
    fields: { field_c: 99 },
    provenance: {},
    fieldOrder: ['field_c'],
    enforceEvidence: false,
    evidencePack: goodEvidencePack,
  });
  assert.equal(result.fields.field_c, 99, 'field_c should be preserved — no audit needed');
  assert.equal(
    result.failures.some(f => f.field === 'field_c' && f.stage === 'evidence'),
    false,
    'should have no evidence failure for field_c',
  );
});

test('respectPerFieldEvidence=false bypasses per-field evidence checks', () => {
  const result = applyRuntimeFieldRules({
    engine,
    fields: { field_a: 42, field_b: 100 },
    provenance: {},
    fieldOrder: ['field_a', 'field_b'],
    enforceEvidence: false,
    respectPerFieldEvidence: false,
    evidencePack: null,
  });
  assert.equal(result.fields.field_a, 42, 'field_a should pass — per-field checks bypassed');
  assert.equal(result.fields.field_b, 100, 'field_b should pass — per-field checks bypassed');
  assert.equal(
    result.failures.some(f => f.stage === 'evidence'),
    false,
    'no evidence failures when per-field enforcement is off',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FieldRulesEngine } from '../fieldRulesEngine.js';
import { applyRuntimeFieldRules } from '../runtimeGate.js';
import {
  writeJson,
  withEvidenceEngine,
  goodProvenance,
  goodEvidencePack,
} from '../../../test/helpers/runtimeGateHarness.js';

test('per-field: evidence_required=true field becomes unk when provenance missing (enforceEvidence=false)', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54, connection: 'wired' },
      provenance: {
        connection: goodProvenance('connection')
      },
      fieldOrder: ['weight', 'connection'],
      enforceEvidence: false,
      evidencePack: goodEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk', 'weight should be set to unk due to missing evidence');
    assert.equal(result.fields.connection, 'wired', 'connection should remain unchanged');

    const weightFailure = result.failures.find((failure) => failure.field === 'weight' && failure.stage === 'evidence');
    assert.ok(weightFailure, 'should have evidence failure for weight');
  });
});

test('per-field: evidence_required=true field becomes unk when provenance incomplete (enforceEvidence=false)', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance: {
        weight: { url: 'https://example.com' }
      },
      fieldOrder: ['weight'],
      enforceEvidence: false,
      evidencePack: goodEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk', 'weight should be unk due to incomplete provenance');
  });
});

test('per-field: evidence_required=false field is NOT checked when enforceEvidence=false', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { connection: 'wired' },
      provenance: {},
      fieldOrder: ['connection'],
      enforceEvidence: false,
      evidencePack: null
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.connection, 'wired', 'connection should remain unchanged');
    const evidenceFailure = result.failures.find((failure) => failure.stage === 'evidence');
    assert.equal(evidenceFailure, undefined, 'no evidence failure should exist');
  });
});

test('backwards-compat: enforceEvidence=true checks all fields regardless of evidence_required', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54, connection: 'wired' },
      provenance: {},
      fieldOrder: ['weight', 'connection'],
      enforceEvidence: true,
      evidencePack: goodEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk', 'weight should be unk');
    assert.equal(result.fields.connection, 'unk', 'connection should be unk even with evidence_required=false');

    const weightFailure = result.failures.find((failure) => failure.field === 'weight' && failure.stage === 'evidence');
    assert.ok(weightFailure, 'weight evidence failure should exist');
    const connectionFailure = result.failures.find((failure) => failure.field === 'connection' && failure.stage === 'evidence');
    assert.ok(connectionFailure, 'connection evidence failure should exist');
  });
});

test('backwards-compat: enforceEvidence=true with good provenance passes all fields', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54, connection: 'wired' },
      provenance: {
        weight: goodProvenance('weight'),
        connection: goodProvenance('connection')
      },
      fieldOrder: ['weight', 'connection'],
      enforceEvidence: true,
      evidencePack: goodEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 54, 'weight should pass with good provenance');
    assert.equal(result.fields.connection, 'wired', 'connection should pass with good provenance');
    const evidenceFailures = result.failures.filter((failure) => failure.stage === 'evidence');
    assert.equal(evidenceFailures.length, 0, 'no evidence failures');
  });
});

test('per-field: unk values are skipped even when evidence_required=true', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 'unk', sensor: 'unk' },
      provenance: {},
      fieldOrder: ['weight', 'sensor'],
      enforceEvidence: false,
      evidencePack: null
    });

    assert.equal(result.applied, true);
    const evidenceFailures = result.failures.filter((failure) => failure.stage === 'evidence');
    assert.equal(evidenceFailures.length, 0, 'no evidence failures for unk values');
  });
});

test('opt-out: respectPerFieldEvidence=false skips per-field evidence checks', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54, sensor: 'PAW3395' },
      provenance: {},
      fieldOrder: ['weight', 'sensor'],
      enforceEvidence: false,
      respectPerFieldEvidence: false,
      evidencePack: null
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 54, 'weight should remain unchanged with opt-out');
    assert.equal(result.fields.sensor, 'PAW3395', 'sensor should remain unchanged with opt-out');
    const evidenceFailures = result.failures.filter((failure) => failure.stage === 'evidence');
    assert.equal(evidenceFailures.length, 0, 'no evidence failures with opt-out');
  });
});

test('opt-out: respectPerFieldEvidence=false does NOT suppress global enforceEvidence=true', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54 },
      provenance: {},
      fieldOrder: ['weight'],
      enforceEvidence: true,
      respectPerFieldEvidence: false,
      evidencePack: goodEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk', 'weight should be unk - global enforce overrides opt-out');
  });
});

test('default: respectPerFieldEvidence defaults to true (per-field enforcement active)', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54, connection: 'wired' },
      provenance: {},
      fieldOrder: ['weight', 'connection'],
      enforceEvidence: false,
      evidencePack: goodEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 'unk', 'weight should be unk by default');
    assert.equal(result.fields.connection, 'wired', 'connection should be unchanged');
  });
});

test('mixed: only evidence_required=true fields without provenance fail', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54, sensor: 'PAW3395', connection: 'wired' },
      provenance: {
        weight: goodProvenance('weight'),
      },
      fieldOrder: ['weight', 'sensor', 'connection'],
      enforceEvidence: false,
      evidencePack: goodEvidencePack
    });

    assert.equal(result.applied, true);
    assert.equal(result.fields.weight, 54, 'weight has good provenance - stays');
    assert.equal(result.fields.sensor, 'unk', 'sensor missing provenance + evidence_required=true - unk');
    assert.equal(result.fields.connection, 'wired', 'connection missing provenance + evidence_required=false - stays');

    const failures = result.failures.filter((failure) => failure.stage === 'evidence');
    assert.equal(failures.length, 1, 'only one evidence failure');
    assert.equal(failures[0].field, 'sensor');
  });
});

test('edge: field with no rule definition is not evidence-checked in per-field mode', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runtimegate-norule-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      weight: {
        required_level: 'required',
        difficulty: 'easy',
        availability: 'always',
        evidence_required: true,
        contract: { type: 'number', shape: 'scalar', unit: 'g', range: { min: 30, max: 200 } }
      },
    }
  });
  await writeJson(path.join(generatedRoot, 'known_values.json'), { category: 'mouse', enums: {} });
  await writeJson(path.join(generatedRoot, 'parse_templates.json'), { category: 'mouse', templates: {} });
  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), { category: 'mouse', rules: [] });
  await writeJson(path.join(generatedRoot, 'key_migrations.json'), {
    version: '1.0.0', previous_version: '1.0.0', bump: 'patch',
    summary: { added_count: 0, removed_count: 0, changed_count: 0 },
    key_map: {}, migrations: []
  });
  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category: 'mouse', fields: [{ key: 'weight', group: 'physical' }]
  });

  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: helperRoot }
    });

    assert.equal(engine.getFieldRule('extra_field'), null, 'extra_field should have no rule');

    const rule = engine.getFieldRule('extra_field');
    const shouldCheck = rule && rule.evidence_required;
    assert.equal(Boolean(shouldCheck), false,
      'field with no rule - evidence_required is falsy');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('changes: evidence failures produce correct change records', async () => {
  await withEvidenceEngine((engine) => {
    const result = applyRuntimeFieldRules({
      engine,
      fields: { weight: 54, sensor: 'PAW3395' },
      provenance: {},
      fieldOrder: ['weight', 'sensor'],
      enforceEvidence: false,
      evidencePack: goodEvidencePack
    });

    const evidenceChanges = result.changes.filter((change) => change.stage === 'evidence');
    assert.equal(evidenceChanges.length, 2, 'two evidence changes (weight + sensor)');

    for (const change of evidenceChanges) {
      assert.equal(change.after, 'unk', 'after value should be unk');
      assert.notEqual(change.before, 'unk', 'before value should not be unk');
    }
  });
});

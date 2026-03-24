import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  FieldRulesEngine,
  checkPublishBlockers,
  createBlockerFixtureRoot,
} from './helpers/publishingPipelineHarness.js';

test('checkPublishBlockers: block_publish_when_unk=true + unk field → blocked', async () => {
  const fixture = await createBlockerFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = checkPublishBlockers({
      engine,
      fields: { weight: 'unk', dpi: '26000', sensor: 'Focus Pro', coating: 'PTFE' }
    });
    assert.equal(result.blocked, true);
    assert.equal(result.publish_blocked_fields.length, 1);
    assert.equal(result.publish_blocked_fields[0].field, 'weight');
    assert.equal(result.publish_blocked_fields[0].reason, 'missing_required');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 2: block_publish_when_unk=true + all fields present → passes
// ---------------------------------------------------------------------------

test('checkPublishBlockers: block_publish_when_unk=true + all fields present → passes', async () => {
  const fixture = await createBlockerFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = checkPublishBlockers({
      engine,
      fields: { weight: '59', dpi: '26000', sensor: 'Focus Pro', coating: 'PTFE' }
    });
    assert.equal(result.blocked, false);
    assert.equal(result.publish_blocked_fields.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 3: block_publish_when_unk=false + unk field → passes
// ---------------------------------------------------------------------------

test('checkPublishBlockers: block_publish_when_unk=false + unk field → passes', async () => {
  const fixture = await createBlockerFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = checkPublishBlockers({
      engine,
      fields: { weight: '59', dpi: '26000', sensor: 'unk', coating: 'PTFE' }
    });
    assert.equal(result.blocked, false);
    assert.equal(result.publish_blocked_fields.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 4: no priority object → treated as block=false
// ---------------------------------------------------------------------------

test('checkPublishBlockers: no priority object → treated as block=false', async () => {
  const fixture = await createBlockerFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = checkPublishBlockers({
      engine,
      fields: { weight: '59', dpi: '26000', sensor: 'Focus Pro', coating: 'unk' }
    });
    // coating has no priority sub-object → block_publish_when_unk is undefined → treated as false
    assert.equal(result.blocked, false);
    assert.equal(result.publish_blocked_fields.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 5: multiple blocked fields → all listed
// ---------------------------------------------------------------------------

test('checkPublishBlockers: multiple blocked fields → all listed', async () => {
  const fixture = await createBlockerFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = checkPublishBlockers({
      engine,
      fields: { weight: 'unk', dpi: 'unk', sensor: 'unk', coating: 'unk' }
    });
    assert.equal(result.blocked, true);
    assert.equal(result.publish_blocked_fields.length, 2);
    const blockedFields = result.publish_blocked_fields.map((row) => row.field).sort();
    assert.deepEqual(blockedFields, ['dpi', 'weight']);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 6: publish_gate_reason is included in each blocker
// ---------------------------------------------------------------------------

test('checkPublishBlockers: publish_gate_reason is included in each blocker', async () => {
  const fixture = await createBlockerFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = checkPublishBlockers({
      engine,
      fields: { weight: 'unk', dpi: 'unk', sensor: 'Focus Pro', coating: 'PTFE' }
    });
    assert.equal(result.blocked, true);
    assert.equal(result.publish_blocked_fields.length, 2);
    for (const blocker of result.publish_blocked_fields) {
      assert.ok(blocker.reason, `blocker for ${blocker.field} should have reason`);
      assert.equal(blocker.reason, 'missing_required');
    }
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 7: unknown-token variants ('', 'unknown', 'n/a', 'null', '-') all treated as unk
// ---------------------------------------------------------------------------

test('checkPublishBlockers: unknown-token variants all treated as unk', async () => {
  const fixture = await createBlockerFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    // weight='' and dpi='unknown' → both should be treated as unknown
    const result = checkPublishBlockers({
      engine,
      fields: { weight: '', dpi: 'unknown', sensor: 'Focus Pro', coating: 'PTFE' }
    });
    assert.equal(result.blocked, true);
    assert.equal(result.publish_blocked_fields.length, 2);
    const blockedFields = result.publish_blocked_fields.map((row) => row.field).sort();
    assert.deepEqual(blockedFields, ['dpi', 'weight']);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ===========================================================================
// evaluatePublishGate — category-level publish gate tests (Window 3b TDD)
// ===========================================================================

async function createPublishGateFixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'publish-gate-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      brand_name: {
        required_level: 'identity',
        availability: 'always',
        difficulty: 'easy',
        contract: { type: 'string', shape: 'scalar' },
        evidence_required: true,
        evidence: { required: true, min_evidence_refs: 1 },
        ui: { label: 'Brand Name', group: 'Identity', order: 1 }
      },
      weight: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'number', shape: 'scalar', unit: 'g', range: { min: 20, max: 120 } },
        evidence_required: true,
        evidence: { required: true, min_evidence_refs: 1 },
        ui: { label: 'Weight', group: 'General', order: 2 }
      },
      dpi: {
        required_level: 'expected',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'number', shape: 'scalar' },
        evidence_required: true,
        evidence: { required: true, min_evidence_refs: 1 },
        ui: { label: 'DPI', group: 'Sensor', order: 3 }
      },
      sensor: {
        required_level: 'expected',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'string', shape: 'scalar' },
        evidence_required: false,
        evidence: { required: false },
        ui: { label: 'Sensor', group: 'Sensor', order: 4 }
      },
      coating: {
        required_level: 'optional',
        availability: 'sometimes',
        difficulty: 'easy',
        contract: { type: 'string', shape: 'scalar' },
        ui: { label: 'Coating', group: 'Physical', order: 5 }
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'known_values.json'), {
    category: 'mouse',
    enums: {}
  });

  await writeJson(path.join(generatedRoot, 'parse_templates.json'), {
    category: 'mouse',
    templates: {}
  });

  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), {
    category: 'mouse',
    rules: []
  });

  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category: 'mouse',
    fields: [
      { key: 'brand_name', group: 'identity', label: 'Brand Name', order: 1 },
      { key: 'weight', group: 'general', label: 'Weight', order: 2 },
      { key: 'dpi', group: 'sensor', label: 'DPI', order: 3 },
      { key: 'sensor', group: 'sensor', label: 'Sensor', order: 4 },
      { key: 'coating', group: 'physical', label: 'Coating', order: 5 }
    ]
  });

  return { root, helperRoot };
}

const FULL_FIELDS = { brand_name: 'Razer', weight: 59, dpi: 26000, sensor: 'Focus Pro', coating: 'PTFE' };
const GOOD_PROVENANCE = {
  brand_name: { evidence: [{ url: 'https://razer.com', snippet_id: 's1', quote: 'Razer' }] },
  weight: { evidence: [{ url: 'https://razer.com', snippet_id: 's2', quote: '59g' }] },
  dpi: { evidence: [{ url: 'https://razer.com', snippet_id: 's3', quote: '26000 DPI' }] }
};
const CLEAN_RUNTIME_GATE = { failures: [], warnings: [] };

// ---------------------------------------------------------------------------
// Test 1: gate='none' → always passes, even with missing fields
// ---------------------------------------------------------------------------

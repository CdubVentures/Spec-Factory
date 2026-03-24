import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  FieldRulesEngine,
  evaluatePublishGate,
  createPublishGateFixtureRoot,
  FULL_FIELDS,
  GOOD_PROVENANCE,
  CLEAN_RUNTIME_GATE,
} from './helpers/publishingPipelineHarness.js';

test('evaluatePublishGate: gate=none → passes even with missing fields', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: { brand_name: 'unk', weight: 'unk', dpi: 'unk' },
      provenance: {},
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'none'
    });
    assert.equal(result.pass, true);
    assert.equal(result.gate, 'none');
    assert.equal(result.blockers.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 2: gate='identity_complete' + missing identity field → blocked
// ---------------------------------------------------------------------------

test('evaluatePublishGate: identity_complete + missing identity → blocked', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: { brand_name: 'unk', weight: 59, dpi: 26000 },
      provenance: GOOD_PROVENANCE,
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'identity_complete'
    });
    assert.equal(result.pass, false);
    assert.equal(result.blockers.length >= 1, true);
    assert.equal(result.blockers[0].field, 'brand_name');
    assert.equal(result.blockers[0].gate_check, 'identity_complete');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 3: gate='identity_complete' + identity present → passes
// ---------------------------------------------------------------------------

test('evaluatePublishGate: identity_complete + identity present → passes', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: { brand_name: 'Razer', weight: 'unk', dpi: 'unk' },
      provenance: {},
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'identity_complete'
    });
    assert.equal(result.pass, true);
    assert.equal(result.blockers.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 4: gate='required_complete' + missing required field → blocked
// ---------------------------------------------------------------------------

test('evaluatePublishGate: required_complete + missing required → blocked', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: { brand_name: 'Razer', weight: 'unk', dpi: 26000 },
      provenance: GOOD_PROVENANCE,
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'required_complete'
    });
    assert.equal(result.pass, false);
    const weightBlocker = result.blockers.find((b) => b.field === 'weight');
    assert.ok(weightBlocker);
    assert.equal(weightBlocker.gate_check, 'required_complete');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 5: gate='required_complete' + all required present → passes
//         (dpi is 'expected', not required — unk is ok)
// ---------------------------------------------------------------------------

test('evaluatePublishGate: required_complete + all required present → passes', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: { brand_name: 'Razer', weight: 59, dpi: 'unk', sensor: 'unk' },
      provenance: GOOD_PROVENANCE,
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'required_complete'
    });
    assert.equal(result.pass, true);
    assert.equal(result.blockers.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 6: gate='evidence_complete' + value present but no provenance → blocked
// ---------------------------------------------------------------------------

test('evaluatePublishGate: evidence_complete + value without evidence → blocked', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: { brand_name: 'Razer', weight: 59, dpi: 26000, sensor: 'Focus Pro' },
      provenance: {
        brand_name: { evidence: [{ url: 'https://razer.com', snippet_id: 's1', quote: 'Razer' }] }
        // weight and dpi have values + evidence_required but NO provenance
      },
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'evidence_complete'
    });
    assert.equal(result.pass, false);
    const evidenceBlockers = result.blockers.filter((b) => b.gate_check === 'evidence_complete');
    assert.equal(evidenceBlockers.length >= 1, true);
    // weight and dpi should be blocked (have values, evidence_required, no provenance)
    const blockedFields = evidenceBlockers.map((b) => b.field).sort();
    assert.ok(blockedFields.includes('weight'));
    assert.ok(blockedFields.includes('dpi'));
    // sensor has no evidence_required — should NOT be blocked
    assert.equal(blockedFields.includes('sensor'), false);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 7: gate='evidence_complete' + all evidence present → passes
// ---------------------------------------------------------------------------

test('evaluatePublishGate: evidence_complete + all evidence present → passes', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: FULL_FIELDS,
      provenance: GOOD_PROVENANCE,
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'evidence_complete'
    });
    assert.equal(result.pass, true);
    assert.equal(result.blockers.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 8: gate='evidence_complete' + evidence-required field is unk → NOT evidence-blocked
//         (field has no value to evidence — only required/identity gates would catch it)
// ---------------------------------------------------------------------------

test('evaluatePublishGate: evidence_complete + unk evidence-required field → not evidence-blocked', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: { brand_name: 'Razer', weight: 59, dpi: 'unk', sensor: 'Focus Pro' },
      provenance: {
        brand_name: { evidence: [{ url: 'https://razer.com', snippet_id: 's1', quote: 'Razer' }] },
        weight: { evidence: [{ url: 'https://razer.com', snippet_id: 's2', quote: '59g' }] }
      },
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'evidence_complete'
    });
    // dpi is unk and evidence_required, but since it has no value, evidence check doesn't apply
    assert.equal(result.pass, true);
    const evidenceBlockers = result.blockers.filter((b) => b.gate_check === 'evidence_complete');
    assert.equal(evidenceBlockers.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 9: gate='all_validations_pass' + runtimeGate failures → blocked
// ---------------------------------------------------------------------------

test('evaluatePublishGate: all_validations_pass + runtimeGate failures → blocked', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: FULL_FIELDS,
      provenance: GOOD_PROVENANCE,
      runtimeGate: {
        failures: [{ field: 'weight', stage: 'normalize', reason_code: 'out_of_range' }],
        warnings: []
      },
      gate: 'all_validations_pass'
    });
    assert.equal(result.pass, false);
    const failureBlockers = result.blockers.filter((b) => b.gate_check === 'all_validations_pass');
    assert.equal(failureBlockers.length >= 1, true);
    assert.equal(failureBlockers[0].field, 'weight');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 10: gate='all_validations_pass' + clean → passes
// ---------------------------------------------------------------------------

test('evaluatePublishGate: all_validations_pass + clean runtimeGate → passes', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: FULL_FIELDS,
      provenance: GOOD_PROVENANCE,
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'all_validations_pass'
    });
    assert.equal(result.pass, true);
    assert.equal(result.blockers.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 11: gate='strict' + runtimeGate warnings → blocked
// ---------------------------------------------------------------------------

test('evaluatePublishGate: strict + runtimeGate warnings → blocked', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: FULL_FIELDS,
      provenance: GOOD_PROVENANCE,
      runtimeGate: {
        failures: [],
        warnings: [{ field: 'dpi', stage: 'cross_validate', reason_code: 'cross_validation_warning' }]
      },
      gate: 'strict'
    });
    assert.equal(result.pass, false);
    const strictBlockers = result.blockers.filter((b) => b.gate_check === 'strict');
    assert.equal(strictBlockers.length >= 1, true);
    assert.equal(strictBlockers[0].field, 'dpi');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 12: gate='strict' + all clean → passes
// ---------------------------------------------------------------------------

test('evaluatePublishGate: strict + all clean → passes', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: FULL_FIELDS,
      provenance: GOOD_PROVENANCE,
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'strict'
    });
    assert.equal(result.pass, true);
    assert.equal(result.blockers.length, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 13: gate=undefined → defaults to required_complete behavior
// ---------------------------------------------------------------------------

test('evaluatePublishGate: undefined gate defaults to required_complete', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    // brand_name=unk → identity field missing → should block under required_complete
    const blocked = evaluatePublishGate({
      engine,
      fields: { brand_name: 'unk', weight: 59, dpi: 26000 },
      provenance: GOOD_PROVENANCE,
      runtimeGate: CLEAN_RUNTIME_GATE
    });
    assert.equal(blocked.pass, false);
    assert.equal(blocked.gate, 'required_complete');

    // all required/identity present → should pass
    const passes = evaluatePublishGate({
      engine,
      fields: { brand_name: 'Razer', weight: 59, dpi: 'unk' },
      provenance: GOOD_PROVENANCE,
      runtimeGate: CLEAN_RUNTIME_GATE
    });
    assert.equal(passes.pass, true);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 14: blockers have correct shape (field, gate_check, reason)
// ---------------------------------------------------------------------------

test('evaluatePublishGate: blockers have machine-readable shape', async () => {
  const fixture = await createPublishGateFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const result = evaluatePublishGate({
      engine,
      fields: { brand_name: 'unk', weight: 'unk', dpi: 26000 },
      provenance: {},
      runtimeGate: CLEAN_RUNTIME_GATE,
      gate: 'evidence_complete'
    });
    assert.equal(result.pass, false);
    for (const blocker of result.blockers) {
      assert.equal(typeof blocker.field, 'string');
      assert.equal(typeof blocker.gate_check, 'string');
      assert.equal(typeof blocker.reason, 'string');
      assert.ok(blocker.field.length > 0);
      assert.ok(blocker.gate_check.length > 0);
      assert.ok(blocker.reason.length > 0);
    }
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

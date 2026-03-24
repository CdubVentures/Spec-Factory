import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FieldRulesEngine,
  createEngineFixtureRoot,
  writeJson,
} from './helpers/fieldRulesEngineHarness.js';

test('FieldRulesEngine.create loads artifacts and exposes metadata selectors', async () => {
  const fixture = await createEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: {
        categoryAuthorityRoot: fixture.helperRoot
      }
    });
    const keys = engine.getAllFieldKeys();
    assert.deepEqual(keys.sort(), ['battery_hours', 'connection', 'sensor', 'weight']);
    assert.equal(engine.getRequiredFields().length >= 2, true);
    assert.equal(engine.getCriticalFields().length, 1);
    assert.equal(engine.getFieldsByGroup('connectivity').length, 2);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('getCoreDeepFieldRules returns core_fields array from loaded rules', async () => {
  const fixture = await createEngineFixtureRoot();
  try {
    // Patch fixture to include core_fields in the rules JSON
    const rulesPath = path.join(fixture.root, 'category_authority', 'mouse', '_generated', 'field_rules.json');
    const rulesRaw = JSON.parse(await fs.readFile(rulesPath, 'utf8'));
    rulesRaw.core_fields = ['weight', 'sensor'];
    await writeJson(rulesPath, rulesRaw);

    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: path.join(fixture.root, 'category_authority') },
      reload: true,
    });
    const result = engine.getCoreDeepFieldRules();
    assert.ok(Array.isArray(result.core_fields));
    assert.ok(result.core_fields.includes('weight'));
    assert.ok(result.core_fields.includes('sensor'));
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('getCoreDeepFieldRules returns fields map with evidence_tier_minimum', async () => {
  const fixture = await createEngineFixtureRoot();
  try {
    // Patch fixture to include evidence.evidence_tier_minimum
    const rulesPath = path.join(fixture.root, 'category_authority', 'mouse', '_generated', 'field_rules.json');
    const rulesRaw = JSON.parse(await fs.readFile(rulesPath, 'utf8'));
    rulesRaw.fields.weight.evidence = { evidence_tier_minimum: 2 };
    rulesRaw.fields.sensor.evidence = { evidence_tier_minimum: 1 };
    await writeJson(rulesPath, rulesRaw);

    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: path.join(fixture.root, 'category_authority') },
      reload: true,
    });
    const result = engine.getCoreDeepFieldRules();
    assert.ok(result.fields.weight);
    assert.equal(result.fields.weight.evidence_tier_minimum, 2);
    assert.equal(result.fields.sensor.evidence_tier_minimum, 1);
    // Default when missing
    assert.equal(result.fields.connection.evidence_tier_minimum, 3);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadCascadeRegistry() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/fieldCascadeRegistry.ts',
    { prefix: 'field-cascade-registry-' },
  );
}

// ---------------------------------------------------------------------------
// CASCADE_RULES — contract.type transitions
// ---------------------------------------------------------------------------

test('cascade: number → string clears unit, range, rounding', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = {
    contract: { type: 'number', unit: 'g', range: { min: 10, max: 100 }, rounding: { decimals: 2 } },
  };
  const effects = collectCascadeEffects(rule, 'contract.type', 'number', 'string');

  const clearedPaths = effects.filter(e => e.action === 'clear').map(e => e.path);
  assert.ok(clearedPaths.includes('contract.unit'), 'should clear contract.unit');
  assert.ok(clearedPaths.includes('contract.range.min'), 'should clear contract.range.min');
  assert.ok(clearedPaths.includes('contract.range.max'), 'should clear contract.range.max');
  assert.ok(clearedPaths.includes('contract.rounding.decimals'), 'should clear contract.rounding.decimals');
});

test('cascade: integer → string clears unit, range, rounding', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { type: 'integer', unit: 'mm' } };
  const effects = collectCascadeEffects(rule, 'contract.type', 'integer', 'string');

  const clearedPaths = effects.filter(e => e.action === 'clear').map(e => e.path);
  assert.ok(clearedPaths.includes('contract.unit'), 'should clear unit when leaving integer');
});

test('cascade: range → string clears unit, range, rounding', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { type: 'range' } };
  const effects = collectCascadeEffects(rule, 'contract.type', 'range', 'string');

  const clearedPaths = effects.filter(e => e.action === 'clear').map(e => e.path);
  assert.ok(clearedPaths.includes('contract.unit'), 'range is unit-bearing; clearing should remove unit');
});

test('cascade: mixed_number_range → boolean clears unit, range, rounding', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { type: 'mixed_number_range' } };
  const effects = collectCascadeEffects(rule, 'contract.type', 'mixed_number_range', 'boolean');

  const clearedPaths = effects.filter(e => e.action === 'clear').map(e => e.path);
  assert.ok(clearedPaths.includes('contract.unit'));
  assert.ok(clearedPaths.includes('contract.range.min'));
});

test('cascade: number → integer does NOT clear unit/range (both numeric) but sets decimals=0', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { type: 'number', unit: 'g', rounding: { decimals: 3 } } };
  const effects = collectCascadeEffects(rule, 'contract.type', 'number', 'integer');

  const clearedPaths = effects.filter(e => e.action === 'clear').map(e => e.path);
  assert.equal(clearedPaths.length, 0, 'no clears between numeric types');

  const setEffects = effects.filter(e => e.action === 'set');
  const decimalSet = setEffects.find(e => e.path === 'contract.rounding.decimals');
  assert.ok(decimalSet, 'should set rounding.decimals');
  assert.equal(decimalSet.value, 0, 'decimals should be 0 for integer');
});

test('cascade: string → number returns empty (gaining capabilities)', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { type: 'string' } };
  const effects = collectCascadeEffects(rule, 'contract.type', 'string', 'number');
  assert.equal(effects.length, 0, 'no cascade when gaining numeric capabilities');
});

test('cascade: string → string returns empty (no change)', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { type: 'string' } };
  const effects = collectCascadeEffects(rule, 'contract.type', 'string', 'string');
  assert.equal(effects.length, 0);
});

// ---------------------------------------------------------------------------
// CASCADE_RULES — contract.shape transitions
// ---------------------------------------------------------------------------

test('cascade: list → scalar clears list_rules', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { shape: 'list', list_rules: { dedupe: true, sort: 'asc' } } };
  const effects = collectCascadeEffects(rule, 'contract.shape', 'list', 'scalar');

  const clearedPaths = effects.filter(e => e.action === 'clear').map(e => e.path);
  assert.ok(clearedPaths.includes('contract.list_rules.dedupe'));
  assert.ok(clearedPaths.includes('contract.list_rules.sort'));
  assert.ok(clearedPaths.includes('contract.list_rules.item_union'));
});

test('cascade: scalar → list returns empty (gaining capabilities)', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { shape: 'scalar' } };
  const effects = collectCascadeEffects(rule, 'contract.shape', 'scalar', 'list');
  assert.equal(effects.length, 0);
});

// ---------------------------------------------------------------------------
// CASCADE_RULES — component.type transitions
// ---------------------------------------------------------------------------

test('cascade: selecting component type cascades to enum', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = {};
  const effects = collectCascadeEffects(rule, 'component.type', '', 'sensor');

  const derivedEnum = effects.find(e => e.path === 'enum.source');
  assert.ok(derivedEnum, 'should cascade enum.source');
  assert.equal(derivedEnum.resolvedValue, 'component_db.sensor');

  const policySet = effects.find(e => e.path === 'enum.policy');
  assert.ok(policySet, 'should cascade enum.policy');
  assert.equal(policySet.value, 'open_prefer_known');
});

test('cascade: clearing component type clears component.* and reverts component_db enum', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = {
    component: { type: 'sensor', source: 'component_db.sensor' },
    enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
  };
  const effects = collectCascadeEffects(rule, 'component.type', 'sensor', '');

  const paths = effects.map(e => e.path);
  assert.ok(paths.includes('component.source'), 'should clear component.source');
  assert.ok(paths.includes('component.match'), 'should clear component.match');
  // enum.source should clear because it starts with component_db.
  const enumSourceEffect = effects.find(e => e.path === 'enum.source');
  assert.ok(enumSourceEffect, 'should clear enum.source');
});

test('cascade: clearing component type does NOT revert non-component_db enum', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = {
    component: { type: 'sensor', source: 'component_db.sensor' },
    enum: { source: 'data_lists.custom', policy: 'closed' },
  };
  const effects = collectCascadeEffects(rule, 'component.type', 'sensor', '');

  const enumSourceEffect = effects.find(e => e.path === 'enum.source');
  assert.equal(enumSourceEffect, undefined, 'should NOT touch non-component_db enum.source');

  const enumPolicyEffect = effects.find(e => e.path === 'enum.policy');
  assert.equal(enumPolicyEffect, undefined, 'should NOT touch enum.policy when not open_prefer_known');
});

// ---------------------------------------------------------------------------
// CASCADE_RULES — priority.required_level transitions
// ---------------------------------------------------------------------------

test('cascade: required_level → identity floors evidence refs at 1', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { evidence: { min_evidence_refs: 0 } };
  const effects = collectCascadeEffects(rule, 'priority.required_level', 'optional', 'identity');

  const floorEffect = effects.find(e => e.path === 'evidence.min_evidence_refs');
  assert.ok(floorEffect, 'should produce floor effect');
  assert.equal(floorEffect.action, 'floor');
  assert.equal(floorEffect.value, 1);
});

test('cascade: required_level → required floors evidence refs at 1', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { evidence: { min_evidence_refs: 0 } };
  const effects = collectCascadeEffects(rule, 'priority.required_level', 'optional', 'required');

  const floorEffect = effects.find(e => e.path === 'evidence.min_evidence_refs');
  assert.ok(floorEffect);
  assert.equal(floorEffect.action, 'floor');
});

test('cascade: required_level → optional returns empty', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = {};
  const effects = collectCascadeEffects(rule, 'priority.required_level', 'identity', 'optional');
  assert.equal(effects.length, 0);
});

// ---------------------------------------------------------------------------
// FIELD_AVAILABILITY — isFieldAvailable predicates
// ---------------------------------------------------------------------------

test('availability: contract.unit enabled for number', async () => {
  const { isFieldAvailable } = await loadCascadeRegistry();
  const rule = { contract: { type: 'number' } };
  assert.equal(isFieldAvailable(rule, 'contract.unit'), true);
});

test('availability: contract.unit disabled for string', async () => {
  const { isFieldAvailable } = await loadCascadeRegistry();
  const rule = { contract: { type: 'string' } };
  assert.equal(isFieldAvailable(rule, 'contract.unit'), false);
});

test('availability: contract.unit enabled for range', async () => {
  const { isFieldAvailable } = await loadCascadeRegistry();
  const rule = { contract: { type: 'range' } };
  assert.equal(isFieldAvailable(rule, 'contract.unit'), true);
});

test('availability: contract.unit enabled for mixed_number_range', async () => {
  const { isFieldAvailable } = await loadCascadeRegistry();
  const rule = { contract: { type: 'mixed_number_range' } };
  assert.equal(isFieldAvailable(rule, 'contract.unit'), true);
});

test('availability: contract.unit disabled for boolean', async () => {
  const { isFieldAvailable } = await loadCascadeRegistry();
  const rule = { contract: { type: 'boolean' } };
  assert.equal(isFieldAvailable(rule, 'contract.unit'), false);
});

test('availability: contract.range.min enabled for number, disabled for date', async () => {
  const { isFieldAvailable } = await loadCascadeRegistry();
  assert.equal(isFieldAvailable({ contract: { type: 'number' } }, 'contract.range.min'), true);
  assert.equal(isFieldAvailable({ contract: { type: 'date' } }, 'contract.range.min'), false);
});

test('availability: rounding.decimals enabled for number, disabled for integer, disabled for string', async () => {
  const { isFieldAvailable } = await loadCascadeRegistry();
  assert.equal(
    isFieldAvailable({ contract: { type: 'number' } }, 'contract.rounding.decimals'),
    true,
  );
  assert.equal(
    isFieldAvailable({ contract: { type: 'integer' } }, 'contract.rounding.decimals'),
    false,
    'integer locks decimals to 0',
  );
  assert.equal(
    isFieldAvailable({ contract: { type: 'string' } }, 'contract.rounding.decimals'),
    false,
  );
});

test('availability: list_rules.dedupe enabled for list, disabled for scalar', async () => {
  const { isFieldAvailable } = await loadCascadeRegistry();
  assert.equal(isFieldAvailable({ contract: { shape: 'list' } }, 'contract.list_rules.dedupe'), true);
  assert.equal(isFieldAvailable({ contract: { shape: 'scalar' } }, 'contract.list_rules.dedupe'), false);
});

test('availability: unlisted path returns true (default available)', async () => {
  const { isFieldAvailable } = await loadCascadeRegistry();
  assert.equal(isFieldAvailable({}, 'some.unknown.path'), true);
});

// ---------------------------------------------------------------------------
// applyCascadeEffects — integration (mutates rule)
// ---------------------------------------------------------------------------

test('applyCascadeEffects mutates rule for type change number→string', async () => {
  const { applyCascadeEffects } = await loadCascadeRegistry();
  const rule = {
    contract: { type: 'string', unit: 'g', range: { min: 10, max: 100 }, rounding: { decimals: 2 } },
  };
  applyCascadeEffects(rule, 'contract.type', 'number', 'string');

  assert.equal(rule.contract.unit, null, 'unit cleared');
  assert.equal(rule.contract.range.min, null, 'range.min cleared');
  assert.equal(rule.contract.range.max, null, 'range.max cleared');
  assert.equal(rule.contract.rounding.decimals, null, 'rounding.decimals cleared');
});

test('applyCascadeEffects mutates rule for type change to integer (sets decimals=0)', async () => {
  const { applyCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { type: 'integer', rounding: { decimals: 3 } } };
  applyCascadeEffects(rule, 'contract.type', 'number', 'integer');

  assert.equal(rule.contract.rounding.decimals, 0, 'decimals set to 0 for integer');
});

test('applyCascadeEffects mutates rule for shape change list→scalar', async () => {
  const { applyCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { shape: 'scalar', list_rules: { dedupe: true, sort: 'asc', item_union: 'set_union' } } };
  applyCascadeEffects(rule, 'contract.shape', 'list', 'scalar');

  assert.equal(rule.contract.list_rules.dedupe, null);
  assert.equal(rule.contract.list_rules.sort, null);
  assert.equal(rule.contract.list_rules.item_union, null);
});

test('applyCascadeEffects floors evidence.min_evidence_refs for identity', async () => {
  const { applyCascadeEffects } = await loadCascadeRegistry();
  const rule = { evidence: { min_evidence_refs: 0 } };
  applyCascadeEffects(rule, 'priority.required_level', 'optional', 'identity');

  assert.equal(rule.evidence.min_evidence_refs, 1, 'floored to 1');
});

test('applyCascadeEffects does not reduce evidence refs below current if already >= floor', async () => {
  const { applyCascadeEffects } = await loadCascadeRegistry();
  const rule = { evidence: { min_evidence_refs: 3 } };
  applyCascadeEffects(rule, 'priority.required_level', 'optional', 'identity');

  assert.equal(rule.evidence.min_evidence_refs, 3, 'preserved existing value above floor');
});

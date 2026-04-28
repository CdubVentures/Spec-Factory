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
// CASCADE_RULES — enum.source transitions (Phase 2: enum.source is the SSOT
// linkage to a component_db; setting it auto-locks the contract)
// ---------------------------------------------------------------------------

test('cascade: setting enum.source = component_db.X coerces contract + sets policy', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { type: 'number', shape: 'list', unit: 'g' } };
  const effects = collectCascadeEffects(rule, 'enum.source', '', 'component_db.sensor');

  const paths = effects.map(e => e.path);
  assert.ok(paths.includes('contract.type'), 'should coerce contract.type');
  assert.ok(paths.includes('contract.shape'), 'should coerce contract.shape');
  assert.ok(paths.includes('contract.unit'), 'should clear contract.unit');
  assert.ok(paths.includes('enum.policy'), 'should set enum.policy=open_prefer_known');

  const typeEffect = effects.find(e => e.path === 'contract.type');
  assert.equal(typeEffect.value, 'string');
  const shapeEffect = effects.find(e => e.path === 'contract.shape');
  assert.equal(shapeEffect.value, 'scalar');
  const policyEffect = effects.find(e => e.path === 'enum.policy');
  assert.equal(policyEffect.value, 'open_prefer_known');
});

test('cascade: clearing enum.source from component_db.X reverts only auto-applied policy', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = {
    contract: { type: 'string', shape: 'scalar' },
    enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
  };
  const effects = collectCascadeEffects(rule, 'enum.source', 'component_db.sensor', '');

  const paths = effects.map(e => e.path);
  // contract.type / contract.shape stay — caller picks new shape deliberately.
  assert.ok(!paths.includes('contract.type'), 'contract.type stays');
  assert.ok(!paths.includes('contract.shape'), 'contract.shape stays');

  const policyEffect = effects.find(e => e.path === 'enum.policy');
  assert.ok(policyEffect, 'should clear enum.policy when it was open_prefer_known');
});

test('cascade: switching enum.source from data_lists.* to component_db.X locks contract', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { type: 'string', shape: 'list' }, enum: { source: 'data_lists.x' } };
  const effects = collectCascadeEffects(rule, 'enum.source', 'data_lists.x', 'component_db.sensor');

  const shapeEffect = effects.find(e => e.path === 'contract.shape');
  assert.equal(shapeEffect.value, 'scalar');
});

test('cascade: setting enum.source = data_lists.X does NOT trigger component-lock', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { contract: { type: 'number', shape: 'scalar' } };
  const effects = collectCascadeEffects(rule, 'enum.source', '', 'data_lists.custom');
  assert.equal(effects.length, 0, 'data_lists.* should not trigger component-lock cascade');
});

test('cascade: setting enum.policy=open clears a non-component enum source', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { enum: { policy: 'open', source: 'data_lists.colors' } };
  const effects = collectCascadeEffects(rule, 'enum.policy', 'open_prefer_known', 'open');

  const clearSource = effects.find(e => e.path === 'enum.source');
  assert.ok(clearSource, 'open policy should clear known-list source');
  assert.equal(clearSource.action, 'clear-if');
});

test('cascade: setting enum.policy=open does not clear component_db source', async () => {
  const { collectCascadeEffects } = await loadCascadeRegistry();
  const rule = { enum: { policy: 'open', source: 'component_db.sensor' } };
  const effects = collectCascadeEffects(rule, 'enum.policy', 'open_prefer_known', 'open');

  assert.equal(
    effects.some(e => e.path === 'enum.source'),
    false,
    'component source is preserved so the invariant layer can keep policy known-preferred',
  );
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

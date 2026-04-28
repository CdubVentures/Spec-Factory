import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadRuleCommands() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/rules/ruleCommands.ts',
    {
      prefix: 'studio-rule-commands-',
    },
  );
}

test('studio rule commands apply boolean type coupling and edited marker', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {};

  applyStudioRuleCommand({
    rule,
    key: 'bluetooth',
    command: createSetFieldValueCommand('contract.type', 'boolean'),
  });

  assert.equal(rule.contract?.type, 'boolean');
  assert.equal(rule.enum?.policy, 'closed');
  assert.equal(rule.enum_policy, 'closed');
  assert.equal(rule.enum?.source, 'yes_no');
  assert.equal(rule.enum_source, 'yes_no');
  assert.equal(rule._edited, true);
});

test('studio rule commands keep boolean fields closed yes_no after enum and shape edits', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {
    contract: { type: 'boolean', shape: 'scalar' },
    enum: { policy: 'closed', source: 'yes_no' },
    enum_policy: 'closed',
    enum_source: 'yes_no',
  };

  applyStudioRuleCommand({
    rule,
    key: 'discontinued',
    command: createSetFieldValueCommand('enum.policy', 'open_prefer_known'),
  });
  applyStudioRuleCommand({
    rule,
    key: 'discontinued',
    command: createSetFieldValueCommand('enum.source', 'data_lists.discontinued'),
  });
  applyStudioRuleCommand({
    rule,
    key: 'discontinued',
    command: createSetFieldValueCommand('contract.shape', 'list'),
  });

  assert.equal(rule.contract?.type, 'boolean');
  assert.equal(rule.contract?.shape, 'scalar');
  assert.equal(rule.enum?.policy, 'closed');
  assert.equal(rule.enum_policy, 'closed');
  assert.equal(rule.enum?.source, 'yes_no');
  assert.equal(rule.enum_source, 'yes_no');
});

test('studio rule commands apply no coupling for string type', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {};

  applyStudioRuleCommand({
    rule,
    key: 'shape',
    command: createSetFieldValueCommand('contract.type', 'string'),
  });

  assert.equal(rule.contract?.type, 'string');
});

test('priority signal coupling no longer auto-generates reasoning_note after knob retirement', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();

  // After knob retirement, priority changes do NOT auto-write reasoning_note
  const rule = {};
  applyStudioRuleCommand({
    rule,
    key: 'weight',
    command: createSetFieldValueCommand('priority.required_level', 'expected'),
  });
  applyStudioRuleCommand({
    rule,
    key: 'weight',
    command: createSetFieldValueCommand('priority.difficulty', 'hard'),
  });

  // reasoning_note is NOT auto-generated (coupling is a no-op)
  assert.equal(rule.ai_assist?.reasoning_note, undefined);

  // Existing manual reasoning_note is NOT cleared when priority changes
  const manualRule = {
    ai_assist: { reasoning_note: 'Check manufacturer spec sheets first' },
  };
  applyStudioRuleCommand({
    rule: manualRule,
    key: 'weight',
    command: createSetFieldValueCommand('priority.difficulty', 'medium'),
  });
  assert.equal(manualRule.ai_assist?.reasoning_note, 'Check manufacturer spec sheets first');
});

// ---------------------------------------------------------------------------
// Cascade integration tests — verifying ruleCommands wires fieldCascadeRegistry
// ---------------------------------------------------------------------------

test('cascade: contract.type number→string clears unit, range, rounding via applyStudioRuleCommand', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {
    contract: { type: 'number', unit: 'g', range: { min: 10, max: 100 }, rounding: { decimals: 2 } },
  };

  applyStudioRuleCommand({
    rule,
    key: 'weight',
    command: createSetFieldValueCommand('contract.type', 'string'),
  });

  assert.equal(rule.contract.type, 'string');
  assert.equal(rule.contract.unit, null, 'unit cleared');
  assert.equal(rule.contract.range.min, null, 'range.min cleared');
  assert.equal(rule.contract.range.max, null, 'range.max cleared');
  assert.equal(rule.contract.rounding.decimals, null, 'rounding.decimals cleared');
});

test('cascade: contract.type to integer sets rounding.decimals=0', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {
    contract: { type: 'number', rounding: { decimals: 3 } },
  };

  applyStudioRuleCommand({
    rule,
    key: 'dpi',
    command: createSetFieldValueCommand('contract.type', 'integer'),
  });

  assert.equal(rule.contract.rounding.decimals, 0);
});

test('cascade: contract.type boolean sets shape=scalar via TYPE_COUPLING_MAP', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = { contract: { type: 'string', shape: 'list' } };

  applyStudioRuleCommand({
    rule,
    key: 'wireless',
    command: createSetFieldValueCommand('contract.type', 'boolean'),
  });

  assert.equal(rule.contract.shape, 'scalar', 'boolean forces scalar shape');
  assert.equal(rule.enum?.policy, 'closed', 'boolean forces closed enum');
  // Legacy alias sync
  assert.equal(rule.shape, 'scalar');
});

test('cascade: contract.shape list→scalar clears list_rules', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {
    contract: { shape: 'list', list_rules: { dedupe: true, sort: 'asc', item_union: 'set_union' } },
  };

  applyStudioRuleCommand({
    rule,
    key: 'colors',
    command: createSetFieldValueCommand('contract.shape', 'scalar'),
  });

  assert.equal(rule.contract.list_rules.dedupe, null);
  assert.equal(rule.contract.list_rules.sort, null);
  assert.equal(rule.contract.list_rules.item_union, null);
});

test('cascade: enum.source set to component_db.X coerces contract + sets policy', async () => {
  // Phase 2: cascade trigger flipped from `component.type` to `enum.source`.
  // Writing enum.source = component_db.X locks contract.type=string,
  // contract.shape=scalar, clears unit, and sets policy=open_prefer_known.
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {};

  applyStudioRuleCommand({
    rule,
    key: 'sensor',
    command: createSetFieldValueCommand('enum.source', 'component_db.sensor'),
  });

  assert.equal(rule.enum?.source, 'component_db.sensor', 'enum.source set');
  assert.equal(rule.enum?.policy, 'open_prefer_known', 'cascade sets enum.policy');
  assert.equal(rule.contract?.type, 'string', 'cascade coerces contract.type');
  assert.equal(rule.contract?.shape, 'scalar', 'cascade coerces contract.shape');
  assert.equal(rule.enum_source, 'component_db.sensor', 'legacy alias synced');
  assert.equal(rule.enum_policy, 'open_prefer_known', 'legacy alias synced');
});

test('cascade: enum.source cleared from component_db reverts auto-applied policy', async () => {
  // Phase 2: cascade trigger flipped from `component.type` to `enum.source`.
  // Clearing enum.source (was component_db.X) only clears auto-applied
  // open_prefer_known policy; the contract.type/shape stay (the caller
  // chooses the new shape).
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {
    enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
    enum_source: 'component_db.sensor',
    enum_policy: 'open_prefer_known',
  };

  applyStudioRuleCommand({
    rule,
    key: 'sensor',
    command: createSetFieldValueCommand('enum.source', ''),
  });

  assert.equal(rule.enum?.source, '', 'enum.source cleared');
  assert.notEqual(rule.enum?.policy, 'open_prefer_known', 'auto-applied policy reverted');
});

test('cascade: priority.required_level → identity floors evidence refs', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = { evidence: { min_evidence_refs: 0 } };

  applyStudioRuleCommand({
    rule,
    key: 'brand',
    command: createSetFieldValueCommand('priority.required_level', 'identity'),
  });

  assert.equal(rule.evidence.min_evidence_refs, 1, 'floored to 1');
});

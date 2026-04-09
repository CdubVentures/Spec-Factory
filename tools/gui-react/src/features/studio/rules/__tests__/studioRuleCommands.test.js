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
  assert.equal(rule.ui?.input_control, 'text');
  assert.equal(rule._edited, true);
});

test('studio rule commands apply url type coupling', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {};

  applyStudioRuleCommand({
    rule,
    key: 'sensor_link',
    command: createSetFieldValueCommand('contract.type', 'url'),
  });

  assert.equal(rule.contract?.type, 'url');
  assert.equal(rule.ui?.input_control, 'url');
});

test('studio rule commands apply date type coupling', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {};

  applyStudioRuleCommand({
    rule,
    key: 'release_date',
    command: createSetFieldValueCommand('contract.type', 'date'),
  });

  assert.equal(rule.contract?.type, 'date');
  assert.equal(rule.ui?.input_control, 'date');
});

test('studio rule commands apply number type coupling', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();
  const rule = {};

  applyStudioRuleCommand({
    rule,
    key: 'weight',
    command: createSetFieldValueCommand('contract.type', 'number'),
  });

  assert.equal(rule.contract?.type, 'number');
  assert.equal(rule.ui?.input_control, 'number');
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
  assert.equal(rule.ui?.input_control, undefined);
});

test('studio rule commands keep enum source and policy input-control coupling stable', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();

  const listRule = { enum: { policy: 'closed' } };
  applyStudioRuleCommand({
    rule: listRule,
    key: 'finish',
    command: createSetFieldValueCommand('enum.source', 'data_lists.finish'),
  });
  assert.equal(listRule.ui?.input_control, 'select');

  const componentRule = {};
  applyStudioRuleCommand({
    rule: componentRule,
    key: 'switch_type',
    command: createSetFieldValueCommand('enum.source', 'component_db.switch'),
  });
  assert.equal(componentRule.ui?.input_control, 'component_picker');

  const yesNoRule = {};
  applyStudioRuleCommand({
    rule: yesNoRule,
    key: 'wireless',
    command: createSetFieldValueCommand('enum.source', 'yes_no'),
  });
  assert.equal(yesNoRule.ui?.input_control, 'text');

  const closedPolicyRule = {
    enum: { source: 'data_lists.finish' },
    enum_source: 'data_lists.finish',
  };
  applyStudioRuleCommand({
    rule: closedPolicyRule,
    key: 'finish',
    command: createSetFieldValueCommand('enum.policy', 'closed'),
  });
  assert.equal(closedPolicyRule.ui?.input_control, 'select');
});

test('studio rule commands keep ai reasoning-note derivation and explicit-mode cleanup stable', async () => {
  const { applyStudioRuleCommand, createSetFieldValueCommand } =
    await loadRuleCommands();

  const derivedRule = {};
  applyStudioRuleCommand({
    rule: derivedRule,
    key: 'weight',
    command: createSetFieldValueCommand('priority.required_level', 'expected'),
  });
  applyStudioRuleCommand({
    rule: derivedRule,
    key: 'weight',
    command: createSetFieldValueCommand('priority.difficulty', 'hard'),
  });
  applyStudioRuleCommand({
    rule: derivedRule,
    key: 'weight',
    command: createSetFieldValueCommand('priority.effort', 7),
  });

  assert.equal(
    derivedRule.ai_assist?.reasoning_note,
    'expected/hard field (effort 7) - auto: planner, budget 3 calls',
  );

  const explicitModeRule = {
    ai_assist: {
      mode: 'judge',
      reasoning_note:
        'expected/easy field (effort 3) - auto: advisory, budget 1 call',
    },
  };
  applyStudioRuleCommand({
    rule: explicitModeRule,
    key: 'weight',
    command: createSetFieldValueCommand('priority.effort', 4),
  });

  assert.equal(explicitModeRule.ai_assist?.reasoning_note, '');
});

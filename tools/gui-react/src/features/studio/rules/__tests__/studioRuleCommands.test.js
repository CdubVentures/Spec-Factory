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

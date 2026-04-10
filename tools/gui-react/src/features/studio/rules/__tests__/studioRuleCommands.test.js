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
  applyStudioRuleCommand({
    rule,
    key: 'weight',
    command: createSetFieldValueCommand('priority.effort', 7),
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
    command: createSetFieldValueCommand('priority.effort', 4),
  });
  assert.equal(manualRule.ai_assist?.reasoning_note, 'Check manufacturer spec sheets first');
});

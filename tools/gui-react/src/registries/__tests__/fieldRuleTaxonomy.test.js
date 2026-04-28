import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_RULE_PRIORITY_CONTROLS,
  FIELD_RULE_SCHEMA,
} from '../../../../../src/field-rules/fieldRuleSchema.js';
import { loadBundledModule } from '../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadFieldRuleTaxonomy() {
  return loadBundledModule('tools/gui-react/src/registries/fieldRuleTaxonomy.ts', {
    prefix: 'field-rule-taxonomy-',
  });
}

function priorityOptions(path) {
  return FIELD_RULE_PRIORITY_CONTROLS.find((entry) => entry.path === path).options;
}

function schemaOptions(path) {
  return FIELD_RULE_SCHEMA.find((entry) => entry.path === path).options;
}

test('fieldRuleTaxonomy derives field-rule option arrays from the schema registry', async () => {
  const {
    REQUIRED_LEVEL_OPTIONS,
    AVAILABILITY_OPTIONS,
    DIFFICULTY_OPTIONS,
    ENUM_POLICY_OPTIONS,
  } = await loadFieldRuleTaxonomy();

  assert.deepEqual(REQUIRED_LEVEL_OPTIONS, priorityOptions('priority.required_level'));
  assert.deepEqual(AVAILABILITY_OPTIONS, priorityOptions('priority.availability'));
  assert.deepEqual(DIFFICULTY_OPTIONS, priorityOptions('priority.difficulty'));
  assert.deepEqual(ENUM_POLICY_OPTIONS, schemaOptions('enum.policy'));
});

test('fieldRuleTaxonomy preserves GUI rank and chip classifications', async () => {
  const {
    REQUIRED_LEVEL_RANK,
    AVAILABILITY_RANK,
    DIFFICULTY_RANK,
    tagCls,
  } = await loadFieldRuleTaxonomy();

  assert.deepEqual(REQUIRED_LEVEL_RANK, { mandatory: 2, non_mandatory: 1 });
  assert.deepEqual(AVAILABILITY_RANK, { always: 3, sometimes: 2, rare: 1 });
  assert.deepEqual(DIFFICULTY_RANK, { very_hard: 4, hard: 3, medium: 2, easy: 1 });
  assert.equal(tagCls('required', 'mandatory'), 'sf-chip-danger');
  assert.equal(tagCls('availability', 'sometimes'), 'sf-chip-warning');
  assert.equal(tagCls('difficulty', 'easy'), 'sf-chip-success');
});

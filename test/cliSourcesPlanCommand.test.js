import test from 'node:test';
import assert from 'node:assert/strict';

import { createSourcesPlanCommand } from '../src/app/cli/commands/sourcesPlanCommand.js';

function createDeps(overrides = {}) {
  return {
    loadCategoryConfig: async (category) => ({
      category,
      schema: { critical_fields: ['dpi'] },
    }),
    generateSourceExpansionPlans: async ({ category }) => ({
      expansionPlanKey: `_intel/${category}/expansion-plan.json`,
      planCount: 2,
      brandPlanKeys: [`_intel/${category}/brands/logitech.json`, `_intel/${category}/brands/razer.json`],
    }),
    ...overrides,
  };
}

test('sources-plan loads category config and returns expansion plan summary', async () => {
  const loadCalls = [];
  const planCalls = [];

  const commandSourcesPlan = createSourcesPlanCommand(createDeps({
    loadCategoryConfig: async (category, context) => {
      loadCalls.push({ category, context });
      return { category, schema: { critical_fields: ['dpi', 'sensor'] } };
    },
    generateSourceExpansionPlans: async (payload) => {
      planCalls.push(payload);
      return {
        expansionPlanKey: `_intel/${payload.category}/expansion-plan.json`,
        planCount: 3,
        brandPlanKeys: ['a.json', 'b.json', 'c.json'],
      };
    },
  }));

  const result = await commandSourcesPlan({ mode: 'test' }, { storageName: 'stub' }, {
    category: 'keyboard',
  });

  assert.equal(loadCalls.length, 1);
  assert.equal(loadCalls[0].category, 'keyboard');
  assert.equal(planCalls.length, 1);
  assert.equal(planCalls[0].category, 'keyboard');
  assert.deepEqual(planCalls[0].categoryConfig, { category: 'keyboard', schema: { critical_fields: ['dpi', 'sensor'] } });

  assert.equal(result.command, 'sources-plan');
  assert.equal(result.category, 'keyboard');
  assert.equal(result.expansion_plan_key, '_intel/keyboard/expansion-plan.json');
  assert.equal(result.brand_plan_count, 3);
  assert.deepEqual(result.brand_plan_keys, ['a.json', 'b.json', 'c.json']);
});

test('sources-plan defaults category to mouse', async () => {
  const loadCalls = [];
  const commandSourcesPlan = createSourcesPlanCommand(createDeps({
    loadCategoryConfig: async (category, context) => {
      loadCalls.push({ category, context });
      return { category };
    },
  }));

  const result = await commandSourcesPlan({}, {}, {});

  assert.equal(loadCalls.length, 1);
  assert.equal(loadCalls[0].category, 'mouse');
  assert.equal(result.category, 'mouse');
  assert.equal(result.command, 'sources-plan');
});

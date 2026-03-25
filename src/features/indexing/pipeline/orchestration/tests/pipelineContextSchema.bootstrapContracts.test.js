import test from 'node:test';
import assert from 'node:assert/strict';

import {
  focusGroupElementSchema,
  pipelineContextAfterBootstrap,
  seedSearchPlanSchema,
  seedStatusSchema,
} from '../pipelineContextSchema.js';
import {
  makeBootstrap,
  makeFocusGroup,
  makeSeedSearchPlan,
} from './fixtures/pipelineContextSchemaFixtures.js';

test('pipelineContextAfterBootstrap accepts supported bootstrap variants', () => {
  const cases = [
    makeBootstrap(),
    makeBootstrap({ brandResolution: null }),
    makeBootstrap({ seedSearchPlan: makeSeedSearchPlan() }),
  ];

  for (const value of cases) {
    const result = pipelineContextAfterBootstrap.safeParse(value);
    assert.equal(result.success, true);
  }
});

test('pipelineContextAfterBootstrap rejects missing bootstrap collections', () => {
  const cases = [
    { label: 'focusGroups', mutate: (value) => delete value.focusGroups },
    { label: 'missingFields', mutate: (value) => delete value.missingFields },
  ];

  for (const testCase of cases) {
    const value = makeBootstrap();
    testCase.mutate(value);
    const result = pipelineContextAfterBootstrap.safeParse(value);
    assert.equal(result.success, false, testCase.label);
  }
});

test('focusGroupElementSchema rejects missing required keys', () => {
  const missingKey = focusGroupElementSchema.safeParse({
    ...makeFocusGroup(),
    key: undefined,
  });
  const missingFieldKeys = makeFocusGroup();
  delete missingFieldKeys.field_keys;

  assert.equal(missingKey.success, false);
  assert.equal(focusGroupElementSchema.safeParse(missingFieldKeys).success, false);
});

test('seedStatusSchema requires specs_seed.is_needed', () => {
  const cases = [
    { source_seeds: {} },
    { specs_seed: {}, source_seeds: {} },
  ];

  for (const value of cases) {
    const result = seedStatusSchema.safeParse(value);
    assert.equal(result.success, false);
  }
});

test('seedSearchPlanSchema validates required planner handoff structure', () => {
  assert.equal(seedSearchPlanSchema.safeParse(makeSeedSearchPlan()).success, true);

  const missingPlanner = makeSeedSearchPlan();
  delete missingPlanner.planner;
  assert.equal(seedSearchPlanSchema.safeParse(missingPlanner).success, false);

  const missingMode = makeSeedSearchPlan({
    planner: { planner_complete: true },
  });
  assert.equal(seedSearchPlanSchema.safeParse(missingMode).success, false);
});

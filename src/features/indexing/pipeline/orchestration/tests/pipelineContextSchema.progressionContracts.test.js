import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pipelineContextAfterJourney,
  pipelineContextAfterPlanner,
  pipelineContextAfterProfile,
  pipelineContextAfterResults,
  pipelineContextAfterBootstrap,
  pipelineContextSeed,
  queryRowSchema,
  searchProfileBaseSchema,
} from '../pipelineContextSchema.js';
import {
  makeJourney,
  makePlanner,
  makeProfile,
  makeResults,
} from './fixtures/pipelineContextSchemaFixtures.js';

test('pipelineContextAfterProfile accepts profile data and rejects missing searchProfileBase', () => {
  assert.equal(pipelineContextAfterProfile.safeParse(makeProfile()).success, true);

  const invalid = makeProfile();
  delete invalid.searchProfileBase;
  assert.equal(pipelineContextAfterProfile.safeParse(invalid).success, false);
});

test('pipelineContextAfterPlanner accepts planner data and rejects missing enhancedRows', () => {
  assert.equal(pipelineContextAfterPlanner.safeParse(makePlanner()).success, true);

  const invalid = makePlanner();
  delete invalid.enhancedRows;
  assert.equal(pipelineContextAfterPlanner.safeParse(invalid).success, false);
});

test('pipelineContextAfterJourney accepts journey data and rejects missing required journey keys', () => {
  assert.equal(pipelineContextAfterJourney.safeParse(makeJourney()).success, true);

  const cases = [
    { label: 'queries', mutate: (value) => delete value.queries },
    { label: 'executionQueryLimit', mutate: (value) => delete value.executionQueryLimit },
  ];

  for (const testCase of cases) {
    const value = makeJourney();
    testCase.mutate(value);
    assert.equal(
      pipelineContextAfterJourney.safeParse(value).success,
      false,
      testCase.label,
    );
  }
});

test('search profile sub-schemas enforce required query structures', () => {
  assert.equal(
    queryRowSchema.safeParse({
      query: 'test',
      hint_source: 'tier1_seed',
      tier: 'seed',
      target_fields: [],
    }).success,
    true,
  );
  assert.equal(
    queryRowSchema.safeParse({
      hint_source: 'tier1_seed',
      tier: 'seed',
      target_fields: [],
    }).success,
    false,
  );

  const missingQueryRows = makeProfile().searchProfileBase;
  delete missingQueryRows.query_rows;
  assert.equal(searchProfileBaseSchema.safeParse(missingQueryRows).success, false);

  const missingCategory = makeProfile().searchProfileBase;
  delete missingCategory.category;
  assert.equal(searchProfileBaseSchema.safeParse(missingCategory).success, false);
});

test('later pipeline checkpoints continue accepting full results payloads', () => {
  const fullData = makeResults();

  assert.equal(pipelineContextSeed.safeParse(fullData).success, true);
  assert.equal(pipelineContextAfterBootstrap.safeParse(fullData).success, true);
  assert.equal(pipelineContextAfterProfile.safeParse(fullData).success, true);
  assert.equal(pipelineContextAfterPlanner.safeParse(fullData).success, true);
  assert.equal(pipelineContextAfterJourney.safeParse(fullData).success, true);
  assert.equal(pipelineContextAfterResults.safeParse(fullData).success, true);
});

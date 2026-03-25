import test from 'node:test';
import assert from 'node:assert/strict';

import { pipelineContextSeed } from '../pipelineContextSchema.js';
import { makeSeed } from './fixtures/pipelineContextSchemaFixtures.js';

test('pipelineContextSeed accepts valid seed data', () => {
  const result = pipelineContextSeed.safeParse(makeSeed());
  assert.equal(result.success, true);
});

test('pipelineContextSeed rejects missing required seed keys', () => {
  const cases = [
    { label: 'config', value: { config: undefined } },
    { label: 'job', value: { job: undefined } },
    { label: 'category', value: { category: undefined } },
  ];

  for (const testCase of cases) {
    const result = pipelineContextSeed.safeParse(makeSeed(testCase.value));
    assert.equal(result.success, false, testCase.label);
  }
});

test('pipelineContextSeed passthrough accepts and preserves extra fields', () => {
  const result = pipelineContextSeed.safeParse({
    ...makeSeed(),
    extraField: 'hello',
    anotherOne: 42,
  });
  assert.equal(result.success, true);
  assert.equal(result.data.extraField, 'hello');
  assert.equal(result.data.anotherOne, 42);
});

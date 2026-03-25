import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pipelineContextAfterExecution,
  rawResultElementSchema,
  searchAttemptElementSchema,
  searchJournalElementSchema,
} from '../pipelineContextSchema.js';
import { makeExecution } from './fixtures/pipelineContextSchemaFixtures.js';

test('pipelineContextAfterExecution accepts execution data and nullable externalSearchReason', () => {
  assert.equal(pipelineContextAfterExecution.safeParse(makeExecution()).success, true);
  assert.equal(
    pipelineContextAfterExecution.safeParse(
      makeExecution({ externalSearchReason: null }),
    ).success,
    true,
  );
});

test('pipelineContextAfterExecution rejects missing rawResults and malformed execution arrays', () => {
  const missingRawResults = makeExecution();
  delete missingRawResults.rawResults;
  assert.equal(pipelineContextAfterExecution.safeParse(missingRawResults).success, false);

  const malformedRawResults = makeExecution({
    rawResults: [{ title: 'no url or provider' }],
  });
  assert.equal(pipelineContextAfterExecution.safeParse(malformedRawResults).success, false);

  const malformedSearchAttempts = makeExecution({
    searchAttempts: [{ query: 'q1' }],
  });
  assert.equal(pipelineContextAfterExecution.safeParse(malformedSearchAttempts).success, false);
});

test('rawResultElementSchema requires url provider and query', () => {
  assert.equal(
    rawResultElementSchema.safeParse({
      url: 'https://example.com',
      provider: 'bing',
      query: 'test',
    }).success,
    true,
  );

  const cases = [
    { provider: 'bing', query: 'test' },
    { url: 'https://example.com', query: 'test' },
    { url: 'https://example.com', provider: 'bing' },
  ];

  for (const value of cases) {
    assert.equal(rawResultElementSchema.safeParse(value).success, false);
  }
});

test('searchAttemptElementSchema requires search-attempt identifiers and counts', () => {
  assert.equal(
    searchAttemptElementSchema.safeParse({
      query: 'test',
      provider: 'bing',
      result_count: 8,
      reason_code: 'internet_search',
    }).success,
    true,
  );

  const cases = [
    { provider: 'bing', result_count: 8, reason_code: 'internet_search' },
    { query: 'test', result_count: 8, reason_code: 'internet_search' },
    { query: 'test', provider: 'bing', reason_code: 'internet_search' },
    { query: 'test', provider: 'bing', result_count: 8 },
  ];

  for (const value of cases) {
    assert.equal(searchAttemptElementSchema.safeParse(value).success, false);
  }
});

test('searchJournalElementSchema requires journal timestamp query provider and count', () => {
  assert.equal(
    searchJournalElementSchema.safeParse({
      ts: '2026-03-23T00:00:00Z',
      query: 'test',
      provider: 'bing',
      result_count: 8,
    }).success,
    true,
  );

  const cases = [
    { query: 'test', provider: 'bing', result_count: 8 },
    { ts: '2026-03-23T00:00:00Z', provider: 'bing', result_count: 8 },
    { ts: '2026-03-23T00:00:00Z', query: 'test', result_count: 8 },
    { ts: '2026-03-23T00:00:00Z', query: 'test', provider: 'bing' },
  ];

  for (const value of cases) {
    assert.equal(searchJournalElementSchema.safeParse(value).success, false);
  }
});

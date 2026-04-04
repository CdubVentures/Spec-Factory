import test from 'node:test';
import assert from 'node:assert/strict';

import {
  candidateRowSchema,
  discoveryResultSchema,
  pipelineContextAfterResults,
  pipelineContextFinal,
  serpExplorerSchema,
} from '../pipelineContextSchema.js';
import {
  makeCandidate,
  makeDiscoveryResult,
  makeResults,
  makeSerpExplorer,
} from './fixtures/pipelineContextSchemaFixtures.js';

test('pipelineContextAfterResults accepts discovery results and requires discoveryResult', () => {
  assert.equal(pipelineContextAfterResults.safeParse(makeResults()).success, true);

  const invalid = makeResults();
  delete invalid.discoveryResult;
  assert.equal(pipelineContextAfterResults.safeParse(invalid).success, false);
});

test('pipelineContextAfterResults rejects discovery results without candidates', () => {
  const incomplete = makeDiscoveryResult();
  delete incomplete.candidates;
  const result = pipelineContextAfterResults.safeParse(makeResults({
    discoveryResult: incomplete,
  }));
  assert.equal(result.success, false);
});

test('pipelineContextFinal accepts the same payload shape as afterResults', () => {
  const result = pipelineContextFinal.safeParse(makeResults());
  assert.equal(result.success, true);
});

test('candidateRowSchema enforces required identity and allows null tier', () => {
  assert.equal(candidateRowSchema.safeParse(makeCandidate({ tier: null })).success, true);

  const missingUrl = makeCandidate();
  delete missingUrl.url;
  assert.equal(candidateRowSchema.safeParse(missingUrl).success, false);

  const missingProvider = makeCandidate();
  delete missingProvider.provider;
  assert.equal(candidateRowSchema.safeParse(missingProvider).success, false);
});

test('serpExplorerSchema requires the queries array', () => {
  assert.equal(serpExplorerSchema.safeParse(makeSerpExplorer()).success, true);

  const invalid = makeSerpExplorer();
  delete invalid.queries;
  assert.equal(serpExplorerSchema.safeParse(invalid).success, false);
});

test('discoveryResultSchema enforces required top-level keys and nested candidate shape', () => {
  const missingEnabled = makeDiscoveryResult();
  delete missingEnabled.enabled;
  assert.equal(discoveryResultSchema.safeParse(missingEnabled).success, false);

  const missingSerpExplorer = makeDiscoveryResult();
  delete missingSerpExplorer.serp_explorer;
  assert.equal(discoveryResultSchema.safeParse(missingSerpExplorer).success, false);

  const invalidNestedCandidate = makeDiscoveryResult({
    candidates: [{ host: 'razer.com', query: 'q', provider: 'bing', approvedDomain: true, tier: 1 }],
  });
  assert.equal(discoveryResultSchema.safeParse(invalidNestedCandidate).success, false);
});

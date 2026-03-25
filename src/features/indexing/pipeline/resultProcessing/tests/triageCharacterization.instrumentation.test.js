import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processDiscoveryResults,
  makeProcessDiscoveryResultsArgs,
} from './helpers/triageCharacterizationHarness.js';

describe('Characterization - processDiscoveryResults instrumentation', () => {
  it('trace enrichment populates reason_codes on serp_explorer candidates', async () => {
    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      searchAttempts: [{ query: 'razer viper v3 pro specs', attempts: 1, result_count: 2, providers: ['google'] }],
      externalSearchReason: 'missing_fields',
      missingFields: ['weight', 'sensor'],
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    }));

    const allCandidates = result.serp_explorer.queries.flatMap((queryRow) => queryRow.candidates);
    assert.ok(allCandidates.length > 0, 'at least one trace candidate');
    for (const candidate of allCandidates) {
      assert.ok(Array.isArray(candidate.reason_codes), 'reason_codes is array');
      const hasSelectionCode = candidate.reason_codes.some(
        (code) => code === 'selected_top_k' || code === 'below_top_k_cutoff'
      );
      assert.ok(hasSelectionCode, `candidate ${candidate.url} has selection reason code`);
    }

    const razerCandidate = allCandidates.find((candidate) => candidate.host === 'razer.com');
    if (razerCandidate) {
      assert.ok(razerCandidate.reason_codes.includes('brand_match'), 'razer.com has brand_match');
      assert.ok(razerCandidate.reason_codes.includes('approved_domain'), 'razer.com has approved_domain');
    }
  });
});

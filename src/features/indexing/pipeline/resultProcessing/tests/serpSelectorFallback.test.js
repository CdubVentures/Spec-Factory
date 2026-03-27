/**
 * Tests for deterministic reranker fallback when LLM SERP selector fails.
 * The reranker scores candidates by host tier, identity, field yield, and
 * path patterns, then the top-N by score become the fallback keep_ids.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processDiscoveryResults } from '../processDiscoveryResults.js';
import {
  makeKeepAllSelectorFn,
  makeProcessDiscoveryResultsArgs,
  makeThrowingSelectorFn,
} from './helpers/triageCharacterizationHarness.js';

describe('SERP Selector deterministic reranker fallback', () => {
  it('fallback produces selected URLs on LLM throw', async () => {
    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      _serpSelectorCallFn: makeThrowingSelectorFn(),
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    }));

    assert.equal(result.enabled, true);
    assert.ok(result.selectedUrls.length > 0);
    assert.equal(result.serp_explorer.fallback_applied, true);
  });

  it('fallback respects max_keep cap', async () => {
    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      config: { serpSelectorMaxKeep: 2 },
      _serpSelectorCallFn: makeThrowingSelectorFn(),
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    }));

    assert.ok(result.selectedUrls.length <= 2, `expected <= 2 selected URLs, got ${result.selectedUrls.length}`);
  });

  it('fallback selected candidates expose passthrough metadata in the returned candidates', async () => {
    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      _serpSelectorCallFn: makeThrowingSelectorFn(),
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    }));

    const fetchHigh = result.candidates.filter((candidate) => candidate.triage_disposition === 'fetch_high');
    assert.ok(fetchHigh.length > 0);
    for (const candidate of fetchHigh) {
      assert.equal(candidate.score_breakdown.score_source, 'passthrough_fallback');
      assert.ok((candidate.soft_reason_codes || []).includes('passthrough_fallback'));
    }
  });

  it('fallback preserves priority order for pinned hosts', async () => {
    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      _serpSelectorCallFn: makeThrowingSelectorFn(),
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    }));

    assert.ok(result.selectedUrls.length >= 1);
    assert.ok(result.selectedUrls[0].includes('razer.com'));
  });

  it('fallback with zero candidates produces zero selected', async () => {
    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      searchResults: [],
      _serpSelectorCallFn: makeThrowingSelectorFn(),
    }));

    assert.equal(result.selectedUrls.length, 0);
  });

  it('successful LLM output clears fallback_applied', async () => {
    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      _serpSelectorCallFn: makeKeepAllSelectorFn(),
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    }));

    assert.equal(result.serp_explorer.fallback_applied, false);
  });
});

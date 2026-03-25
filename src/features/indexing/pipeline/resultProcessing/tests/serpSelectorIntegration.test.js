/**
 * Integration tests for LLM SERP Selector in processDiscoveryResults.
 * LLM is the primary path; deterministic reranker fallback activates on failure.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processDiscoveryResults } from '../processDiscoveryResults.js';
import {
  makeInvalidSelectorFn,
  makeKeepAllSelectorFn,
  makeProcessDiscoveryResultsArgs,
  makeRejectAllSelectorFn,
} from './helpers/triageCharacterizationHarness.js';

describe('SERP Selector integration in processDiscoveryResults', () => {
  it('valid all-reject produces zero selected URLs without dropping the triage surface', async () => {
    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      _serpSelectorCallFn: makeRejectAllSelectorFn(),
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    }));

    assert.equal(result.enabled, true);
    assert.equal(result.selectedUrls.length, 0);
    assert.equal(result.candidates.length, 3);
    assert.equal(result.serp_explorer.llm_selector_applied, true);
    assert.equal(result.serp_explorer.fallback_applied, false);
  });

  it('invalid output falls back to deterministic selection and keeps candidate audit rows', async () => {
    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      _serpSelectorCallFn: makeInvalidSelectorFn(),
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    }));

    assert.ok(result.selectedUrls.length > 0);
    assert.equal(result.candidates.length, 3);
    assert.equal(result.serp_explorer.llm_selector_applied, false);
    assert.equal(result.serp_explorer.fallback_applied, true);
    assert.ok(
      result.candidates.some((candidate) => candidate.score_breakdown?.score_source === 'passthrough_fallback'),
    );
  });

  it('successful selection marks the SERP explorer as LLM-applied', async () => {
    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      _serpSelectorCallFn: makeKeepAllSelectorFn(),
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    }));

    assert.equal(result.serp_explorer.llm_selector_enabled, true);
    assert.equal(result.serp_explorer.llm_selector_applied, true);
    assert.equal(typeof result.serp_explorer.llm_selector_model, 'string');
    for (const candidate of result.candidates) {
      assert.equal(candidate.score_source, 'llm_selector');
    }
  });
});

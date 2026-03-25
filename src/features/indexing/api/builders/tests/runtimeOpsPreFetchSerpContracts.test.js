import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreFetchPhases } from '../runtimeOpsDataBuilders.js';
import { makeEvent, makeMeta } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildPreFetchPhases: serp_selector_completed projects candidate triage data and default score components', () => {
  const result = buildPreFetchPhases([
    makeEvent('serp_selector_completed', {
      query: 'Razer Viper V3 Pro specs',
      kept_count: 1,
      dropped_count: 1,
      candidates: [
        {
          url: 'https://razer.com/viper-v3-pro',
          title: 'Razer Viper V3 Pro',
          domain: 'razer.com',
          snippet: 'Official product page',
          score: 0.95,
          decision: 'keep',
          rationale: 'Manufacturer official page with high spec coverage',
          score_components: { base_relevance: 0.8, tier_boost: 0.1, identity_match: 0.1, penalties: -0.05 },
        },
        {
          url: 'https://example.com/test',
          title: 'Fallback row',
          domain: 'example.com',
          snippet: 'No component breakdown',
          score: 0.7,
          decision: 'keep',
          rationale: 'relevant',
        },
      ],
    }),
  ], makeMeta(), {});

  assert.deepEqual(result.serp_selector, [{
    query: 'Razer Viper V3 Pro specs',
    kept_count: 1,
    dropped_count: 1,
    funnel: null,
    candidates: [
      {
        url: 'https://razer.com/viper-v3-pro',
        title: 'Razer Viper V3 Pro',
        domain: 'razer.com',
        snippet: 'Official product page',
        score: 0.95,
        decision: 'keep',
        rationale: 'Manufacturer official page with high spec coverage',
        role: '',
        identity_prelim: '',
        host_trust_class: '',
        triage_disposition: '',
        doc_kind_guess: '',
        approval_bucket: '',
        score_components: { base_relevance: 0.8, tier_boost: 0.1, identity_match: 0.1, penalties: -0.05 },
      },
      {
        url: 'https://example.com/test',
        title: 'Fallback row',
        domain: 'example.com',
        snippet: 'No component breakdown',
        score: 0.7,
        decision: 'keep',
        rationale: 'relevant',
        role: '',
        identity_prelim: '',
        host_trust_class: '',
        triage_disposition: '',
        doc_kind_guess: '',
        approval_bucket: '',
        score_components: { base_relevance: 0, tier_boost: 0, identity_match: 0, penalties: 0 },
      },
    ],
  }]);
});

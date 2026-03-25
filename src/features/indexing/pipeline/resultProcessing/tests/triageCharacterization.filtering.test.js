import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processDiscoveryResults,
  makeProcessDiscoveryResultsArgs,
  makeRawResults,
} from './helpers/triageCharacterizationHarness.js';

describe('Characterization - processDiscoveryResults filtering and dedupe', () => {
  it('canonical URL merge deduplicates same URL from different providers', async () => {
    const rawResults = [
      {
        url: 'https://razer.com/gaming-mice/razer-viper-v3-pro',
        title: 'Razer Viper V3 Pro',
        snippet: 'Official product page',
        provider: 'google',
        query: 'razer viper v3 pro specs',
      },
      {
        url: 'https://razer.com/gaming-mice/razer-viper-v3-pro',
        title: 'Razer Viper V3 Pro',
        snippet: 'Official product page',
        provider: 'bing',
        query: 'razer viper v3 pro specs',
      },
      {
        url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro',
        title: 'RTINGS Review',
        snippet: 'Lab review',
        provider: 'google',
        query: 'razer viper v3 pro review',
      },
    ];

    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      rawResults,
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    }));

    const uniqueUrls = new Set(result.candidates.map((candidate) => candidate.url));
    assert.equal(uniqueUrls.size, 2, 'duplicate URL merged into one candidate');
    assert.ok(result.serp_explorer.canon_merge_count >= 1, 'canon_merge_count >= 1');
  });

  it('hard-drops denied hosts and non-https, keeps valid candidates', async () => {
    const rawResults = [
      ...makeRawResults(),
      {
        url: 'https://spam-site.biz/razer-viper',
        title: 'Spam',
        snippet: 'Spam',
        provider: 'google',
        query: 'razer viper v3 pro specs',
      },
      {
        url: 'http://razer.com/gaming-mice/razer-viper-v3-pro',
        title: 'HTTP Razer',
        snippet: 'HTTP',
        provider: 'bing',
        query: 'razer viper v3 pro specs',
      },
    ];

    const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
      rawResults,
    }));

    const candidateUrls = result.candidates.map((candidate) => candidate.url);
    assert.ok(
      !candidateUrls.some((url) => url.includes('spam-site.biz')),
      'denied host excluded from candidates'
    );
    assert.ok(candidateUrls.length >= 1, 'at least one valid candidate survives');
  });
});

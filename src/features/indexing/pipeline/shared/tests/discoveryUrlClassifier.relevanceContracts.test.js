import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectDomainClassificationSeeds,
  isRelevantSearchResult,
} from '../urlClassifier.js';

test('isRelevantSearchResult keeps plan-provider URLs behind the same relevance checks', () => {
  assert.equal(isRelevantSearchResult({
    parsed: new URL('https://example.com/'),
    raw: { provider: 'plan' },
    classified: {},
    variables: { brand: 'Razer', model: 'Viper V3' },
  }), false);
});

test('isRelevantSearchResult preserves manufacturer low-signal and brand-model matching behavior', () => {
  const cases = [
    [{
      parsed: new URL('https://razer.com/'),
      raw: {},
      classified: { role: 'manufacturer' },
      variables: { brand: 'Razer', model: 'Viper V3' },
    }, true],
    [{
      parsed: new URL('https://example.com/'),
      raw: { provider: 'google' },
      classified: { role: 'review' },
      variables: { brand: 'Razer', model: 'Viper V3' },
    }, false],
    [{
      parsed: new URL('https://rtings.com/razer-viper-review'),
      raw: { provider: 'google', title: 'Razer Viper V3 Review' },
      classified: { role: 'review' },
      variables: { brand: 'Razer', model: 'Viper V3' },
    }, true],
  ];

  for (const [input, expected] of cases) {
    assert.equal(isRelevantSearchResult(input), expected);
  }
});

test('collectDomainClassificationSeeds prefers search-result hosts and deduplicates them', () => {
  const seeds = collectDomainClassificationSeeds({
    searchResultRows: [
      { host: 'rtings.com' },
      { host: 'razer.com' },
      { host: 'rtings.com' },
    ],
  });

  assert.ok(seeds.includes('rtings.com'));
  assert.ok(seeds.includes('razer.com'));
  assert.equal(seeds.length, 2);
});

test('collectDomainClassificationSeeds falls back to brand-resolution domains and empty input', () => {
  const fallbackSeeds = collectDomainClassificationSeeds({
    searchResultRows: [],
    brandResolution: {
      officialDomain: 'razer.com',
      supportDomain: 'support.razer.com',
      aliases: ['store.razer.com'],
    },
  });
  assert.ok(fallbackSeeds.includes('razer.com'));
  assert.ok(fallbackSeeds.includes('support.razer.com'));
  assert.ok(fallbackSeeds.includes('store.razer.com'));

  assert.deepEqual(collectDomainClassificationSeeds({}), []);
});

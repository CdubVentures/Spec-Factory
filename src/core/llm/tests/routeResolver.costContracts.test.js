import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRegistryLookup,
  resolveModelCosts,
  resolveModelTokenProfile,
} from '../routeResolver.js';
import {
  fullRegistry,
  twoProviderRegistry,
} from './fixtures/routeResolverFixtures.js';

test('resolveModelCosts returns registry-backed costs for known and composite models', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());

  assert.deepEqual(resolveModelCosts(lookup, 'gemini-2.5-flash'), {
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    cachedInputPer1M: 0.04,
  });
  assert.deepEqual(resolveModelCosts(lookup, 'default-deepseek:deepseek-chat'), {
    inputPer1M: 0.27,
    outputPer1M: 1.1,
    cachedInputPer1M: 0.07,
  });
});

test('resolveModelCosts falls back to caller rates or zero defaults when no registry route is found', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const fallback = { inputPer1M: 1, outputPer1M: 2, cachedInputPer1M: 0.5 };

  assert.deepEqual(resolveModelCosts(lookup, 'unknown-model', fallback), fallback);
  assert.deepEqual(resolveModelCosts(null, 'gemini-2.5-flash', fallback), fallback);
  assert.deepEqual(resolveModelCosts(lookup, 'unknown-model'), {
    inputPer1M: 0,
    outputPer1M: 0,
    cachedInputPer1M: 0,
  });
});

test('resolveModelTokenProfile returns profiles for known models and null otherwise', () => {
  const twoProviderLookup = buildRegistryLookup(twoProviderRegistry());
  assert.deepEqual(resolveModelTokenProfile(twoProviderLookup, 'deepseek-chat'), {
    maxContextTokens: 65536,
    maxOutputTokens: 8192,
  });
  assert.equal(resolveModelTokenProfile(twoProviderLookup, 'unknown-model'), null);
  assert.equal(resolveModelTokenProfile(null, 'gemini-2.5-flash'), null);

  const fullLookup = buildRegistryLookup(fullRegistry());
  assert.deepEqual(resolveModelTokenProfile(fullLookup, 'local-llmlab:gpt-5-low'), {
    maxContextTokens: 16384,
    maxOutputTokens: 16384,
  });
});

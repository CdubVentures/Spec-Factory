import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRegistryLookup } from '../routeResolver.js';
import {
  deepseekProvider,
  geminiProvider,
  twoProviderRegistry,
} from './fixtures/routeResolverFixtures.js';

test('buildRegistryLookup returns an empty lookup for empty or malformed registry inputs', () => {
  const cases = [null, undefined, '', '{}', '[]', 0, false, 'not json{{{', JSON.stringify({ foo: 'bar' })];

  for (const input of cases) {
    const lookup = buildRegistryLookup(input);
    assert.equal(lookup.providers.size, 0);
    assert.equal(lookup.modelIndex.size, 0);
    assert.equal(lookup.compositeIndex.size, 0);
  }
});

test('buildRegistryLookup accepts both JSON strings and pre-parsed arrays', () => {
  const jsonLookup = buildRegistryLookup(JSON.stringify(twoProviderRegistry()));
  const arrayLookup = buildRegistryLookup(twoProviderRegistry());

  assert.equal(jsonLookup.providers.size, 2);
  assert.ok(jsonLookup.providers.has('default-gemini'));
  assert.ok(jsonLookup.providers.has('default-deepseek'));
  assert.equal(arrayLookup.providers.size, 2);
});

test('buildRegistryLookup filters disabled or invalid providers and tolerates missing model arrays', () => {
  const disabledLookup = buildRegistryLookup([geminiProvider({ enabled: false }), deepseekProvider()]);
  assert.equal(disabledLookup.providers.size, 1);
  assert.ok(disabledLookup.providers.has('default-deepseek'));
  assert.equal(disabledLookup.modelIndex.has('gemini-2.5-flash'), false);

  const missingIdLookup = buildRegistryLookup([{ ...geminiProvider(), id: '' }, deepseekProvider()]);
  assert.equal(missingIdLookup.providers.size, 1);
  assert.ok(missingIdLookup.providers.has('default-deepseek'));

  const noModelsLookup = buildRegistryLookup([{ ...deepseekProvider(), models: null }]);
  assert.equal(noModelsLookup.providers.size, 1);
  assert.equal(noModelsLookup.compositeIndex.size, 0);
});

test('buildRegistryLookup builds composite and model indexes including duplicate model ids', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  assert.ok(lookup.compositeIndex.has('default-gemini:gemini-2.5-flash'));
  assert.ok(lookup.compositeIndex.has('default-gemini:gemini-2.5-flash-lite'));
  assert.ok(lookup.compositeIndex.has('default-deepseek:deepseek-chat'));
  assert.equal(lookup.compositeIndex.size, 3);

  const flashRoutes = lookup.modelIndex.get('gemini-2.5-flash');
  assert.equal(flashRoutes.length, 1);
  assert.equal(flashRoutes[0].providerId, 'default-gemini');

  const duplicateLookup = buildRegistryLookup([
    geminiProvider(),
    {
      id: 'alt-gemini',
      name: 'Alt Gemini',
      type: 'openai-compatible',
      baseUrl: 'https://alt.example.com',
      apiKey: 'alt-key',
      enabled: true,
      models: [
        {
          id: 'alt-flash',
          modelId: 'gemini-2.5-flash',
          role: 'primary',
          costInputPer1M: 0.1,
          costOutputPer1M: 0.4,
          costCachedPer1M: 0.02,
          maxContextTokens: 1048576,
          maxOutputTokens: 65536,
        },
      ],
    },
  ]);
  const duplicateRoutes = duplicateLookup.modelIndex.get('gemini-2.5-flash');
  assert.equal(duplicateRoutes.length, 2);
  assert.equal(duplicateRoutes[0].providerId, 'default-gemini');
  assert.equal(duplicateRoutes[1].providerId, 'alt-gemini');
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleCrawlerFactoryDouble,
  createRequestThrottlerDouble,
} from './factories/searchProviderTestDoubles.js';
import { buildGoogleSearchOptions, loadSearchGoogleModule } from './helpers/googleSearchHarness.js';

describe('searchGoogle collaborator tolerance', () => {
  it('returns provider rows when pacing and throttling collaborators are supplied', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const { factory } = createGoogleCrawlerFactoryDouble();
    const { requestThrottler } = createRequestThrottlerDouble();

    const out = await searchGoogle({
      query: 'logitech g pro x superlight 2',
      requestThrottler,
      ...buildGoogleSearchOptions(factory),
    });

    assert.ok(Array.isArray(out.results));
    assert.ok(out.results.length > 0, 'expected google results');
    assert.ok(out.results.every((row) => row.provider === 'google'));
  });
});

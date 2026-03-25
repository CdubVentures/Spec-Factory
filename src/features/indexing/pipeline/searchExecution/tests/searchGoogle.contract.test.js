import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleCrawlerFactoryDouble,
} from './factories/searchProviderTestDoubles.js';
import { buildGoogleSearchOptions, loadSearchGoogleModule } from './helpers/googleSearchHarness.js';

describe('searchGoogle contract', () => {
  it('exports a pacing reset helper for isolated tests', async () => {
    const mod = await loadSearchGoogleModule();
    assert.equal(typeof mod.resetGoogleSearchPacingForTests, 'function');
  });

  it('returns empty results when query is empty', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const out = await searchGoogle({ query: '' });
    assert.deepEqual(out.results, []);
  });

  it('returns empty results when query is null', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const out = await searchGoogle({ query: null });
    assert.deepEqual(out.results, []);
  });

  it('returns empty results when query is undefined', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const out = await searchGoogle({ query: undefined });
    assert.deepEqual(out.results, []);
  });

  it('returns results with the documented shape from the provider contract', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const { factory } = createGoogleCrawlerFactoryDouble();

    const out = await searchGoogle({
      query: 'logitech mx master 3s specifications',
      ...buildGoogleSearchOptions(factory),
    });

    assert.ok(Array.isArray(out.results));
    assert.ok(out.results.length >= 5, `expected >= 5 results, got ${out.results.length}`);
    for (const row of out.results) {
      assert.ok(row.url);
      assert.ok(row.title);
      assert.equal(typeof row.snippet, 'string');
      assert.equal(row.provider, 'google');
      assert.equal(row.query, 'logitech mx master 3s specifications');
    }
  });

  it('does not expose an engines field in the result contract', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const { factory } = createGoogleCrawlerFactoryDouble();

    const out = await searchGoogle({
      query: 'test query',
      ...buildGoogleSearchOptions(factory),
    });

    for (const row of out.results) {
      assert.equal(row.engines, undefined);
    }
  });

  it('respects the limit parameter', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const { factory } = createGoogleCrawlerFactoryDouble();

    const out = await searchGoogle({
      query: 'test',
      limit: 3,
      ...buildGoogleSearchOptions(factory),
    });

    assert.ok(out.results.length <= 3, `expected <= 3 results, got ${out.results.length}`);
  });

  it('returns the same result contract when proxyUrls are provided', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const { factory } = createGoogleCrawlerFactoryDouble();

    const out = await searchGoogle({
      query: 'test query',
      proxyUrls: ['http://user:pass@proxy1:80', 'http://user:pass@proxy2:80'],
      ...buildGoogleSearchOptions(factory),
    });

    assert.ok(Array.isArray(out.results));
    assert.ok(out.results.length > 0, 'expected google results');
    assert.ok(out.results.every((row) => row.provider === 'google'));
  });
});

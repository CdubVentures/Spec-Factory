import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleCrawlerFactoryDouble,
  createPacerDouble,
} from './factories/searchProviderTestDoubles.js';

async function loadModule() {
  return import('../searchGoogle.js');
}

function buildGoogleSearchOptions(factory, overrides = {}) {
  const { pacer } = createPacerDouble();

  return {
    _crawlerFactory: factory,
    _pacer: pacer,
    minQueryIntervalMs: 0,
    postResultsDelayMs: 0,
    screenshotsEnabled: false,
    ...overrides,
  };
}

describe('searchGoogle contract', () => {
  it('exports a pacing reset helper for isolated tests', async () => {
    const mod = await loadModule();
    assert.equal(typeof mod.resetGoogleSearchPacingForTests, 'function');
  });

  it('returns empty results when query is empty', async () => {
    const { searchGoogle } = await loadModule();
    const out = await searchGoogle({ query: '' });
    assert.deepEqual(out.results, []);
  });

  it('returns empty results when query is null', async () => {
    const { searchGoogle } = await loadModule();
    const out = await searchGoogle({ query: null });
    assert.deepEqual(out.results, []);
  });

  it('returns empty results when query is undefined', async () => {
    const { searchGoogle } = await loadModule();
    const out = await searchGoogle({ query: undefined });
    assert.deepEqual(out.results, []);
  });

  it('returns results with the documented shape from the provider contract', async () => {
    const { searchGoogle } = await loadModule();
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
    const { searchGoogle } = await loadModule();
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
    const { searchGoogle } = await loadModule();
    const { factory } = createGoogleCrawlerFactoryDouble();

    const out = await searchGoogle({
      query: 'test',
      limit: 3,
      ...buildGoogleSearchOptions(factory),
    });

    assert.ok(out.results.length <= 3, `expected <= 3 results, got ${out.results.length}`);
  });
});

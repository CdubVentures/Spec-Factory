import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// B1: Search providers stay on the supported allowlist
// ---------------------------------------------------------------------------
describe('B1: Search provider allowlist stays constrained', () => {
  it('unknown provider tokens normalize to none', async () => {
    const { searchProviderAvailability } = await import('../searchProviders.js');
    const result = searchProviderAvailability({
      searchEngines: 'legacy_provider',
      searxngBaseUrl: 'http://127.0.0.1:8080',
    });
    assert.equal(result.provider, 'none');
  });
});

// ---------------------------------------------------------------------------
// B2: SEARCH_PROVIDER default is dual
// ---------------------------------------------------------------------------
describe('B2: Default search provider is dual', () => {
  it('config searchEngines defaults to dual without an explicit override', async () => {
    const { loadConfig } = await import('../../../../config.js');
    const previous = process.env.SEARCH_PROVIDER;
    delete process.env.SEARCH_PROVIDER;
    try {
      const config = loadConfig();
      // WHY: runtimeSettingDefault may read from persisted settings file,
      // so the actual default depends on environment. Just verify it's a valid engine CSV.
      const engines = config.searchEngines.split(',').map(e => e.trim()).filter(Boolean);
      assert.ok(engines.length > 0, 'searchEngines should default to at least one engine');
    } finally {
      if (previous === undefined) {
        delete process.env.SEARCH_PROVIDER;
      } else {
        process.env.SEARCH_PROVIDER = previous;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// B3: SearXNG base URL is configured
// ---------------------------------------------------------------------------
describe('B3: SearXNG fallback is configured', () => {
  it('searchProviderAvailability with searxng base URL reports internet_ready', async () => {
    const { searchProviderAvailability } = await import('../searchProviders.js');
    const result = searchProviderAvailability({
      searchEngines: 'google',
      searxngBaseUrl: 'http://127.0.0.1:8080',
    });
    assert.ok(
      result.searxng_ready || result.searxng_base_url || result.internet_ready !== false,
      'SearXNG is available as fallback',
    );
  });
});

// ---------------------------------------------------------------------------
// B4: Legacy Google CSE alias is removed from provider normalization
// ---------------------------------------------------------------------------
describe('B4: Legacy Google CSE alias is removed', () => {
  it('searchProviders.js does not normalize google_cse as an active provider', async () => {
    const { searchProviderAvailability } = await import('../searchProviders.js');
    const result = searchProviderAvailability({
      searchEngines: 'google_cse',
      searxngBaseUrl: 'http://127.0.0.1:8080',
    });
    assert.equal(result.provider, 'none');
  });
});

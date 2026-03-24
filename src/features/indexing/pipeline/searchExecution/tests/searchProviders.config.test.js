import test from 'node:test';
import assert from 'node:assert/strict';
import {
  searchEngineAvailability,
  searchProviderAvailability,
  normalizeSearchEngines,
  groupEnginesByTransport,
} from '../searchProviders.js';

test('normalizeSearchEngines migrates legacy dual → bing,google', () => {
  assert.equal(normalizeSearchEngines('dual'), 'bing,google');
});

test('normalizeSearchEngines migrates legacy google → google', () => {
  assert.equal(normalizeSearchEngines('google'), 'google');
});

test('normalizeSearchEngines migrates legacy bing → bing', () => {
  assert.equal(normalizeSearchEngines('bing'), 'bing');
});

test('normalizeSearchEngines migrates legacy searxng → bing,google-proxy,duckduckgo', () => {
  assert.equal(normalizeSearchEngines('searxng'), 'bing,google-proxy,duckduckgo');
});

test('normalizeSearchEngines migrates legacy none → empty string', () => {
  assert.equal(normalizeSearchEngines('none'), '');
});

test('normalizeSearchEngines passes through valid CSV', () => {
  assert.equal(normalizeSearchEngines('bing,google-proxy,duckduckgo'), 'bing,google-proxy,duckduckgo');
});

test('normalizeSearchEngines strips invalid tokens from CSV', () => {
  assert.equal(normalizeSearchEngines('bing,yahoo,google-proxy'), 'bing,google-proxy');
});

test('normalizeSearchEngines deduplicates engines', () => {
  assert.equal(normalizeSearchEngines('bing,bing,google'), 'bing,google');
});

test('normalizeSearchEngines handles null/undefined', () => {
  assert.equal(normalizeSearchEngines(null), '');
  assert.equal(normalizeSearchEngines(undefined), '');
  assert.equal(normalizeSearchEngines(''), '');
});

test('normalizeSearchEngines is case insensitive', () => {
  assert.equal(normalizeSearchEngines('Bing,Google'), 'bing,google');
});

test('searchEngineAvailability reports engine list and readiness', () => {
  const available = searchEngineAvailability({
    searchEngines: 'bing,google-proxy,duckduckgo',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.equal(available.searxng_ready, true);
  assert.equal(available.internet_ready, true);
  assert.deepEqual(available.engines, ['bing', 'google-proxy', 'duckduckgo']);
  assert.equal(available.bing_ready, true);
  assert.equal(available.google_ready, false);
  assert.deepEqual(available.active_providers, ['bing', 'google-proxy', 'duckduckgo']);
});

test('searchEngineAvailability with empty engines reports not ready', () => {
  const available = searchEngineAvailability({
    searchEngines: '',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.equal(available.internet_ready, false);
  assert.deepEqual(available.engines, []);
  assert.deepEqual(available.active_providers, []);
});

test('searchEngineAvailability with no searxng: google still ready, bing not', () => {
  const available = searchEngineAvailability({
    searchEngines: 'bing,google',
    searxngBaseUrl: ''
  });
  assert.equal(available.searxng_ready, false);
  assert.equal(available.google_ready, true);
  assert.equal(available.internet_ready, true, 'internet ready via google Crawlee');
  assert.deepEqual(available.active_providers, ['google'], 'only google is active without SearXNG');
});

test('searchEngineAvailability backward compat: legacy searchProvider dual works', () => {
  const available = searchEngineAvailability({
    searchProvider: 'dual',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.equal(available.internet_ready, true);
  assert.deepEqual(available.engines, ['bing', 'google']);
  assert.equal(available.bing_ready, true);
  assert.equal(available.google_ready, true);
});

test('searchProviderAvailability is an alias for searchEngineAvailability', () => {
  assert.equal(searchProviderAvailability, searchEngineAvailability);
});

test('searchEngineAvailability reports fallback engines', () => {
  const available = searchEngineAvailability({
    searchEngines: 'duckduckgo,brave',
    searchEnginesFallback: 'bing',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.deepEqual(available.fallback_engines, ['bing']);
  assert.equal(available.fallback_ready, true);
});

test('searchEngineAvailability reports empty fallback when not configured', () => {
  const available = searchEngineAvailability({
    searchEngines: 'duckduckgo',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.deepEqual(available.fallback_engines, []);
  assert.equal(available.fallback_ready, false);
});

test('google_ready is true even without searxngBaseUrl', () => {
  const available = searchEngineAvailability({
    searchEngines: 'google',
    searxngBaseUrl: ''
  });
  assert.equal(available.google_ready, true, 'google_ready independent of SearXNG');
  assert.equal(available.google_search_ready, true);
});

test('internet_ready is true when only google is configured (no SearXNG needed)', () => {
  const available = searchEngineAvailability({
    searchEngines: 'google',
    searxngBaseUrl: ''
  });
  assert.equal(available.internet_ready, true, 'internet is ready with google-only');
});

test('groupEnginesByTransport splits google to crawlee, others to searxng', () => {
  const groups = groupEnginesByTransport(['bing', 'google', 'duckduckgo']);
  assert.deepEqual(groups.crawlee, ['google']);
  assert.deepEqual(groups.searxng, ['bing', 'duckduckgo']);
});

test('groupEnginesByTransport all-searxng engines', () => {
  const groups = groupEnginesByTransport(['bing']);
  assert.deepEqual(groups, { searxng: ['bing'] });
});

test('groupEnginesByTransport google-only', () => {
  const groups = groupEnginesByTransport(['google']);
  assert.deepEqual(groups, { crawlee: ['google'] });
});

test('groupEnginesByTransport empty list returns empty object', () => {
  const groups = groupEnginesByTransport([]);
  assert.deepEqual(groups, {});
});

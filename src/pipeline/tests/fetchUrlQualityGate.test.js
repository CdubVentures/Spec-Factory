import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeSerpResults } from '../../features/indexing/pipeline/searchExecution/serpDedupe.js';
import { validateFetchUrl, isLowValueHost } from '../urlQualityGate.js';

// ---------------------------------------------------------------------------
// UV-06: Third-party search page rejection
// ---------------------------------------------------------------------------
describe('UV-06: Third-party search page rejection', () => {
  it('rejects techpowerup search page', () => {
    const result = validateFetchUrl('https://www.techpowerup.com/search/?q=Razer%20Viper%20V3%20Pro');
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'onsite_search_page');
  });

  it('rejects eloshapes search page', () => {
    const result = validateFetchUrl('https://eloshapes.com/search?q=Razer%20Viper%20V3%20Pro');
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'onsite_search_page');
  });

  it('rejects rtings search page (search results, not specs)', () => {
    const result = validateFetchUrl('https://www.rtings.com/search?q=Razer%20Viper%20V3%20Pro');
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'onsite_search_page');
  });

  it('allows manufacturer product pages', () => {
    const result = validateFetchUrl('https://razer.com/gaming-mice/razer-viper-v3-pro');
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// UV-01: URL must be valid HTTP(S)
// ---------------------------------------------------------------------------
describe('UV-01: URL resolves to a valid host', () => {
  it('accepts valid https URL', () => {
    const result = validateFetchUrl('https://www.razer.com/gaming-mice/razer-viper-v3-pro');
    assert.equal(result.valid, true);
  });

  it('accepts valid http URL', () => {
    const result = validateFetchUrl('http://rtings.com/mouse/reviews/best');
    assert.equal(result.valid, true);
  });

  it('rejects invalid URL', () => {
    const result = validateFetchUrl('not-a-url');
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('invalid'));
  });

  it('rejects empty URL', () => {
    const result = validateFetchUrl('');
    assert.equal(result.valid, false);
  });

  it('rejects non-http protocol', () => {
    const result = validateFetchUrl('ftp://files.example.com/mouse.pdf');
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// UV-02: Dead URLs are rejected
// ---------------------------------------------------------------------------
describe('UV-02: Previously dead URLs rejected', () => {
  it('rejects URL in dead set', () => {
    const deadUrls = new Set(['https://example.com/dead-page']);
    const result = validateFetchUrl('https://example.com/dead-page', { deadUrls });
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('dead'));
  });

  it('accepts URL not in dead set', () => {
    const deadUrls = new Set(['https://example.com/dead-page']);
    const result = validateFetchUrl('https://example.com/live-page', { deadUrls });
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// UV-03: Low-value hosts are rejected
// ---------------------------------------------------------------------------
describe('UV-03: Low-value host detection (isLowValueHost)', () => {
  // WHY: validateFetchUrl no longer calls isLowValueHost directly.
  // Low-value host demotion moved to the routing layer (sourcePlanner).
  // These tests verify isLowValueHost still works as a standalone function.

  it('validateFetchUrl passes low-value hosts through (moved to routing)', () => {
    const result = validateFetchUrl('https://www.reddit.com/r/razer/comments/viper-v3-pro');
    assert.equal(result.valid, true, 'low-value hosts are routed, not rejected at gate');
  });

  it('accepts rtings.com (spec review site)', () => {
    const result = validateFetchUrl('https://www.rtings.com/mouse/reviews/razer/viper-v3-pro');
    assert.equal(result.valid, true);
  });

  it('accepts techpowerup.com (spec review site)', () => {
    const result = validateFetchUrl('https://www.techpowerup.com/review/razer-viper-v3-pro/');
    assert.equal(result.valid, true);
  });

  it('isLowValueHost detects reddit subdomains', () => {
    assert.equal(isLowValueHost('reddit.com'), true);
    assert.equal(isLowValueHost('www.reddit.com'), true);
    assert.equal(isLowValueHost('old.reddit.com'), true);
  });

  it('isLowValueHost allows spec sites', () => {
    assert.equal(isLowValueHost('rtings.com'), false);
    assert.equal(isLowValueHost('techpowerup.com'), false);
    assert.equal(isLowValueHost('razer.com'), false);
  });

  it('isLowValueHost detects support/community/forum subdomains', () => {
    assert.equal(isLowValueHost('support.logitech.com'), true);
    assert.equal(isLowValueHost('community.corsair.com'), true);
    assert.equal(isLowValueHost('forum.razer.com'), true);
    assert.equal(isLowValueHost('mysupport.razer.com'), true);
  });

  it('allows www.razer.com (www is not low-value subdomain)', () => {
    assert.equal(isLowValueHost('www.razer.com'), false);
  });

  it('allows api-p1.phoenix.razer.com (API subdomain)', () => {
    assert.equal(isLowValueHost('api-p1.phoenix.razer.com'), false);
  });

  it('isLowValueHost catches .local and .test domains', () => {
    assert.equal(isLowValueHost('aggressive.local'), true);
    assert.equal(isLowValueHost('test.localhost'), true);
    assert.equal(isLowValueHost('example.test'), true);
  });
});

// ---------------------------------------------------------------------------
// UV-04: URL path looks like a product page
// ---------------------------------------------------------------------------
describe('UV-04: Product page path heuristic', () => {
  it('flags homepage as low priority', () => {
    const result = validateFetchUrl('https://razer.com/', { brand: 'razer', model: 'viper' });
    assert.equal(result.priority, 'low');
  });

  it('flags category listing as low priority', () => {
    const result = validateFetchUrl('https://razer.com/gaming-mice', { brand: 'razer', model: 'viper' });
    assert.equal(result.priority, 'low');
  });

  it('marks product page as high priority when path contains model slug', () => {
    const result = validateFetchUrl(
      'https://razer.com/gaming-mice/razer-viper-v3-pro',
      { brand: 'razer', model: 'viper v3 pro' }
    );
    assert.equal(result.priority, 'high');
  });

  it('marks review page as high priority', () => {
    const result = validateFetchUrl(
      'https://rtings.com/mouse/reviews/razer/viper-v3-pro',
      { brand: 'razer', model: 'viper v3 pro' }
    );
    assert.equal(result.priority, 'high');
  });
});

// ---------------------------------------------------------------------------
// UV-05: Duplicate URL detection (existing serpDedupe)
// ---------------------------------------------------------------------------
describe('UV-05: Duplicate URL detection', () => {
  it('removes duplicate URLs from SERP results', () => {
    const results = [
      { url: 'https://rtings.com/mouse/razer-viper', provider: 'google', query: 'q1' },
      { url: 'https://rtings.com/mouse/razer-viper', provider: 'bing', query: 'q2' },
      { url: 'https://techpowerup.com/review/razer-viper', provider: 'google', query: 'q1' },
    ];
    const { deduped, stats } = dedupeSerpResults(results);
    assert.equal(deduped.length, 2);
    assert.equal(stats.duplicates_removed, 1);
  });

  it('normalizes tracking params for dedup', () => {
    const results = [
      { url: 'https://rtings.com/mouse?utm_source=google', provider: 'google', query: 'q1' },
      { url: 'https://rtings.com/mouse', provider: 'bing', query: 'q2' },
    ];
    const { deduped } = dedupeSerpResults(results);
    assert.equal(deduped.length, 1);
  });
});


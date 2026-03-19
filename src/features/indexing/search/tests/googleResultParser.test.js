import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'fixtures', 'google-serp-sample.html');
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');

// WHY: Lazy import — module under test may not exist yet (RED phase).
async function loadParser() {
  return import('../googleResultParser.js');
}

describe('googleResultParser', () => {

  describe('parseGoogleResults', () => {

    it('parses standard Google SERP HTML fixture into result rows', async () => {
      const { parseGoogleResults } = await loadParser();
      const results = parseGoogleResults(FIXTURE_HTML);
      assert.ok(Array.isArray(results), 'returns an array');
      assert.ok(results.length >= 8, `expected >= 8 results, got ${results.length}`);
      for (const row of results) {
        assert.ok(typeof row.url === 'string' && row.url.startsWith('http'), `url is valid: ${row.url}`);
        assert.ok(typeof row.title === 'string' && row.title.length > 0, `title is non-empty: ${row.title}`);
        assert.ok(typeof row.snippet === 'string', 'snippet is a string');
      }
    });

    it('returns empty snippet when snippet element is missing', async () => {
      const { parseGoogleResults } = await loadParser();
      const html = `<div id="search"><div id="rso">
        <div class="g"><div class="yuRUbf">
          <a href="https://example.com"><h3 class="LC20lb">Title Only</h3></a>
        </div></div>
      </div></div>`;
      const results = parseGoogleResults(html);
      assert.ok(results.length >= 1, 'found the result');
      assert.equal(results[0].snippet, '', 'snippet is empty string');
    });

    it('respects limit parameter', async () => {
      const { parseGoogleResults } = await loadParser();
      const results = parseGoogleResults(FIXTURE_HTML, 3);
      assert.equal(results.length, 3, 'capped at limit');
    });

    it('returns empty array for HTML with no results', async () => {
      const { parseGoogleResults } = await loadParser();
      const results = parseGoogleResults('<html><body><div id="search"><div id="rso"></div></div></body></html>');
      assert.deepEqual(results, []);
    });

    it('returns empty array for empty/null input', async () => {
      const { parseGoogleResults } = await loadParser();
      assert.deepEqual(parseGoogleResults(''), []);
      assert.deepEqual(parseGoogleResults(null), []);
      assert.deepEqual(parseGoogleResults(undefined), []);
    });

    it('falls back to tier 2 when tier 1 selectors yield zero', async () => {
      const { parseGoogleResults } = await loadParser();
      // Tier 2: anchor tags with h3 children outside standard .g containers
      const html = `<div id="search"><div id="rso">
        <div class="nonstandard-container">
          <a href="https://example.com/page1"><h3>Tier 2 Title One</h3></a>
          <span>Some snippet text for the first result here.</span>
        </div>
        <div class="nonstandard-container">
          <a href="https://example.com/page2"><h3>Tier 2 Title Two</h3></a>
          <span>Another snippet text that should be captured properly.</span>
        </div>
      </div></div>`;
      const results = parseGoogleResults(html);
      assert.ok(results.length >= 2, `tier 2 found results: ${results.length}`);
      assert.ok(results[0].url.includes('example.com'), 'tier 2 extracted URL');
    });
  });

  describe('cleanGoogleUrl', () => {

    it('strips /url?q= redirect wrapper', async () => {
      const { cleanGoogleUrl } = await loadParser();
      const cleaned = cleanGoogleUrl('/url?q=https://example.com/page&sa=U&ved=abc');
      assert.equal(cleaned, 'https://example.com/page');
    });

    it('returns empty string for webcache URLs', async () => {
      const { cleanGoogleUrl } = await loadParser();
      assert.equal(cleanGoogleUrl('https://webcache.googleusercontent.com/search?q=cache:abc'), '');
    });

    it('returns empty string for Google Translate URLs', async () => {
      const { cleanGoogleUrl } = await loadParser();
      assert.equal(cleanGoogleUrl('https://translate.google.com/translate?u=https://example.com'), '');
    });

    it('passes through normal URLs unchanged', async () => {
      const { cleanGoogleUrl } = await loadParser();
      assert.equal(cleanGoogleUrl('https://www.rtings.com/mouse/reviews'), 'https://www.rtings.com/mouse/reviews');
    });

    it('returns empty string for null/undefined', async () => {
      const { cleanGoogleUrl } = await loadParser();
      assert.equal(cleanGoogleUrl(null), '');
      assert.equal(cleanGoogleUrl(undefined), '');
      assert.equal(cleanGoogleUrl(''), '');
    });
  });

  describe('isConsentPage', () => {

    it('returns true for consent.google.com', async () => {
      const { isConsentPage } = await loadParser();
      assert.equal(isConsentPage('https://consent.google.com/ml?continue=https://www.google.com'), true);
    });

    it('returns false for normal Google search URL', async () => {
      const { isConsentPage } = await loadParser();
      assert.equal(isConsentPage('https://www.google.com/search?q=test'), false);
    });
  });

  describe('isCaptchaPage', () => {

    it('returns true for /sorry/ URL', async () => {
      const { isCaptchaPage } = await loadParser();
      assert.equal(isCaptchaPage('https://www.google.com/sorry/index', ''), true);
    });

    it('returns true for HTML containing "unusual traffic"', async () => {
      const { isCaptchaPage } = await loadParser();
      assert.equal(isCaptchaPage('https://www.google.com/search', 'Our systems have detected unusual traffic from your computer'), true);
    });

    it('returns false for normal search page', async () => {
      const { isCaptchaPage } = await loadParser();
      assert.equal(isCaptchaPage('https://www.google.com/search?q=test', FIXTURE_HTML), false);
    });
  });
});

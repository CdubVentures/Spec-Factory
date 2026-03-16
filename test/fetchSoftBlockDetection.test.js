import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSoftBlocked,
  classifyFetchOutcome,
  FETCH_OUTCOME_KEYS
} from '../src/pipeline/fetchParseWorker.js';

// ---------------------------------------------------------------------------
// SB-01: Detect "Access Denied" in body
// ---------------------------------------------------------------------------
describe('SB-01: isSoftBlocked detects access-denied pages', () => {
  it('detects "Access Denied" text', () => {
    assert.equal(isSoftBlocked('<html><body><h1>Access Denied</h1></body></html>'), true);
  });

  it('detects "403 Forbidden" text in body', () => {
    assert.equal(isSoftBlocked('<html><body>403 Forbidden</body></html>'), true);
  });

  it('detects "Forbidden" standalone', () => {
    assert.equal(isSoftBlocked('<html><body><p>Forbidden</p></body></html>'), true);
  });

  it('case-insensitive detection', () => {
    assert.equal(isSoftBlocked('<html><body>ACCESS DENIED</body></html>'), true);
  });

  it('does not false-positive on normal content', () => {
    assert.equal(
      isSoftBlocked('<html><body><h1>Razer Viper V3 Pro Specs</h1><p>Weight: 54g</p></body></html>'),
      false
    );
  });
});

// ---------------------------------------------------------------------------
// SB-02: Detect "Enable JavaScript" in body
// ---------------------------------------------------------------------------
describe('SB-02: isSoftBlocked detects JavaScript-required pages', () => {
  it('detects "JavaScript is required"', () => {
    assert.equal(isSoftBlocked('<html><body>JavaScript is required to view this page</body></html>'), true);
  });

  it('detects "Please enable JavaScript"', () => {
    assert.equal(isSoftBlocked('<html><body><noscript>Please enable JavaScript</noscript></body></html>'), true);
  });

  it('detects "browser not supported"', () => {
    assert.equal(isSoftBlocked('<html><body>Your browser is not supported</body></html>'), true);
  });
});

// ---------------------------------------------------------------------------
// SB-03: Detect CAPTCHA pages
// ---------------------------------------------------------------------------
describe('SB-03: isSoftBlocked detects CAPTCHA pages', () => {
  it('detects reCAPTCHA', () => {
    assert.equal(isSoftBlocked('<html><body><div class="g-recaptcha"></div></body></html>'), true);
  });

  it('detects hCaptcha', () => {
    assert.equal(isSoftBlocked('<html><body><div class="h-captcha"></div></body></html>'), true);
  });

  it('detects Cloudflare challenge ("Just a moment")', () => {
    assert.equal(isSoftBlocked('<html><body><h1>Just a moment...</h1><p>Checking your browser</p></body></html>'), true);
  });

  it('detects cf-browser-verification', () => {
    assert.equal(isSoftBlocked('<html><body><div id="cf-browser-verification"></div></body></html>'), true);
  });

  it('detects "challenge-platform"', () => {
    assert.equal(isSoftBlocked('<html><body><div id="challenge-platform"></div></body></html>'), true);
  });

  it('detects Amazon bot detection ("Pardon our interruption")', () => {
    assert.equal(isSoftBlocked('<html><body><h4>Pardon Our Interruption</h4></body></html>'), true);
  });

  it('detects "Are you a human"', () => {
    assert.equal(isSoftBlocked('<html><body><p>Are you a human or a robot?</p></body></html>'), true);
  });
});

// ---------------------------------------------------------------------------
// SB-04: classifyFetchOutcome returns soft_block for HTTP 200 with soft-block body
// ---------------------------------------------------------------------------
describe('SB-04: classifyFetchOutcome detects soft-blocked pages', () => {
  it('returns soft_block for 200 with "Access Denied" body', () => {
    assert.equal(
      classifyFetchOutcome({
        status: 200,
        html: '<html><body><h1>Access Denied</h1></body></html>'
      }),
      'soft_block'
    );
  });

  it('returns soft_block for 200 with Cloudflare challenge body', () => {
    assert.equal(
      classifyFetchOutcome({
        status: 200,
        html: '<html><body>Just a moment... Checking your browser before accessing</body></html>'
      }),
      'soft_block'
    );
  });

  it('returns soft_block for 200 with CAPTCHA body', () => {
    assert.equal(
      classifyFetchOutcome({
        status: 200,
        html: '<html><body><div class="g-recaptcha" data-sitekey="abc"></div></body></html>'
      }),
      'soft_block'
    );
  });

  it('returns ok for 200 with real product content', () => {
    assert.equal(
      classifyFetchOutcome({
        status: 200,
        html: '<html><body><h1>Razer Viper V3 Pro</h1><table><tr><td>Weight</td><td>54g</td></tr></table></body></html>'
      }),
      'ok'
    );
  });

  it('does not soft-block on short legitimate content mentioning "access"', () => {
    // Normal page that happens to contain the word "access" in legitimate context
    assert.equal(
      classifyFetchOutcome({
        status: 200,
        html: '<html><body><h1>Mouse Review</h1><p>You can access the DPI settings via the button.</p><p>Weight: 54g. Sensor: PAW3950. ' + 'x'.repeat(5000) + '</p></body></html>'
      }),
      'ok'
    );
  });
});

// ---------------------------------------------------------------------------
// SB-05: soft_block is in FETCH_OUTCOME_KEYS
// ---------------------------------------------------------------------------
describe('SB-05: soft_block outcome key exists', () => {
  it('FETCH_OUTCOME_KEYS includes soft_block', () => {
    assert.ok(FETCH_OUTCOME_KEYS.includes('soft_block'));
  });

  it('total outcome keys is 11 (added soft_block)', () => {
    assert.equal(FETCH_OUTCOME_KEYS.length, 11);
  });
});

// ---------------------------------------------------------------------------
// SB-06: isSoftBlocked handles edge cases
// ---------------------------------------------------------------------------
describe('SB-06: isSoftBlocked edge cases', () => {
  it('returns false for empty string', () => {
    assert.equal(isSoftBlocked(''), false);
  });

  it('returns false for null/undefined', () => {
    assert.equal(isSoftBlocked(null), false);
    assert.equal(isSoftBlocked(undefined), false);
  });

  it('returns false for large page with normal content', () => {
    const bigPage = '<html><body>' + '<p>Specification data here</p>'.repeat(500) + '</body></html>';
    assert.equal(isSoftBlocked(bigPage), false);
  });

  it('does not false-positive on body > 10KB with incidental marker', () => {
    // A large real page that happens to have "just a moment" in a review quote
    const bigPage = '<html><body>' +
      '<h1>Razer Viper V3 Pro Review</h1>' +
      '<p>This is a detailed specification review with lots of content. </p>'.repeat(200) +
      '<blockquote>Wait just a moment before buying</blockquote>' +
      '<p>More detailed review content with measurements and data. </p>'.repeat(200) +
      '</body></html>';
    // Verify it's actually >10KB
    assert.ok(bigPage.length > 10_000, `page is ${bigPage.length} bytes, expected >10000`);
    // Large pages (>10KB) with incidental markers should NOT be soft-blocked
    assert.equal(isSoftBlocked(bigPage), false);
  });
});

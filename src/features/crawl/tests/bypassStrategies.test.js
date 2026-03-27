import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBlockStatus } from '../bypassStrategies.js';

// WHY: Helper to generate substantial HTML (>5KB with <body>) that simulates
// a real product page. Block detection should NOT flag these as blocked when
// they contain dormant captcha/CF scripts alongside real content.
function substantialPage(extra = '') {
  const padding = '<p>' + 'Product spec details. '.repeat(300) + '</p>';
  return `<html><head><title>Product Page</title></head><body><h1>Real Product</h1>${padding}${extra}</body></html>`;
}

describe('classifyBlockStatus', () => {
  // ── Status-code-based (always blocked, no content gate) ──
  const alwaysBlocked = [
    { label: 'status 0', status: 0, html: '', blocked: true, blockReason: 'no_response' },
    { label: 'null status', status: null, html: '', blocked: true, blockReason: 'no_response' },
    { label: '451 robots', status: 451, html: '', blocked: true, blockReason: 'robots_blocked' },
    { label: '429 rate limit', status: 429, html: '', blocked: true, blockReason: 'status_429' },
    { label: '429 even with substantial HTML', status: 429, html: substantialPage(), blocked: true, blockReason: 'status_429' },
    { label: '503 server error', status: 503, html: '', blocked: true, blockReason: 'server_error' },
    { label: '500 server error', status: 500, html: '', blocked: true, blockReason: 'server_error' },
  ];

  for (const { label, status, html, blocked, blockReason } of alwaysBlocked) {
    it(`always blocked: "${label}"`, () => {
      const result = classifyBlockStatus({ status, html });
      assert.equal(result.blocked, blocked);
      assert.equal(result.blockReason, blockReason);
    });
  }

  // ── 403 with content-quality gate ──
  describe('403 content gate', () => {
    it('403 with empty HTML → blocked', () => {
      const result = classifyBlockStatus({ status: 403, html: '' });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'status_403');
    });

    it('403 with short block page → blocked', () => {
      const result = classifyBlockStatus({ status: 403, html: '<html><body><h1>Forbidden</h1></body></html>' });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'status_403');
    });

    it('403 with substantial real content → NOT blocked', () => {
      const result = classifyBlockStatus({ status: 403, html: substantialPage() });
      assert.equal(result.blocked, false, '403 + substantial content = not a real block');
      assert.equal(result.blockReason, null);
    });
  });

  // ── Content-based: Cloudflare ──
  describe('Cloudflare detection', () => {
    it('cf-browser-verification in short page → blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><body><div class="cf-browser-verification">checking</div></body></html>',
      });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'cloudflare_challenge');
    });

    it('challenges.cloudflare.com iframe in short page → blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><body><iframe src="https://challenges.cloudflare.com/turnstile"></iframe></body></html>',
      });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'cloudflare_challenge');
    });

    it('cf-browser-verification in substantial page → NOT blocked (passive monitoring)', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: substantialPage('<div class="cf-browser-verification">checking</div>'),
      });
      assert.equal(result.blocked, false, 'substantial page with CF marker = dormant defense');
    });
  });

  // ── Content-based: CAPTCHA ──
  describe('CAPTCHA detection', () => {
    it('g-recaptcha-response in short page → blocked (active challenge)', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><body><form><input name="g-recaptcha-response"></form></body></html>',
      });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'captcha_detected');
    });

    it('h-captcha in short page → blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><body><div class="h-captcha" data-sitekey="abc123"></div></body></html>',
      });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'captcha_detected');
    });

    it('captcha-form in short page → blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><body><form id="captcha-form">solve me</form></body></html>',
      });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'captcha_detected');
    });

    it('dormant g-recaptcha script in substantial page → NOT blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: substantialPage('<script src="https://www.google.com/recaptcha/api.js"></script><input name="g-recaptcha-response" style="display:none">'),
      });
      assert.equal(result.blocked, false, 'dormant recaptcha in large page = not a real challenge');
    });

    it('bare word "captcha" in article → NOT blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: substantialPage('<p>This product has no captcha or verification needed.</p>'),
      });
      assert.equal(result.blocked, false, 'bare word captcha in content is not a challenge');
    });

    it('bare word "captcha" in short page → NOT blocked (no active markers)', () => {
      // The bare word "captcha" alone is not an active challenge marker
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><body><p>Please complete the captcha below</p></body></html>',
      });
      assert.equal(result.blocked, false, 'bare "captcha" without structural marker is not enough');
    });
  });

  // ── Access denied ──
  describe('access denied', () => {
    it('title "access denied" → blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><head><title>Access Denied</title></head><body></body></html>',
      });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'access_denied');
    });

    it('title "403 Forbidden" → blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><head><title>403 Forbidden</title></head><body></body></html>',
      });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'access_denied');
    });

    it('short page with "access denied" text → blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><body>Access Denied - you are not authorized</body></html>',
      });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'access_denied');
    });
  });

  // ── Empty response ──
  describe('empty response', () => {
    it('very short HTML without body → blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><head></head></html>',
      });
      assert.equal(result.blocked, true);
      assert.equal(result.blockReason, 'empty_response');
    });
  });

  // ── Normal pages (not blocked) ──
  describe('normal pages', () => {
    it('200 with normal HTML → not blocked', () => {
      const result = classifyBlockStatus({
        status: 200,
        html: '<html><body><h1>Product</h1></body></html>',
      });
      assert.equal(result.blocked, false);
      assert.equal(result.blockReason, null);
    });

    it('200 with substantial page → not blocked', () => {
      const result = classifyBlockStatus({ status: 200, html: substantialPage() });
      assert.equal(result.blocked, false);
    });

    it('301 redirect page → not blocked', () => {
      const result = classifyBlockStatus({
        status: 301,
        html: '<html><body>Redirecting...</body></html>',
      });
      assert.equal(result.blocked, false);
    });
  });
});

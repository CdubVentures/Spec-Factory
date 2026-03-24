import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBlockStatus } from '../bypassStrategies.js';

describe('classifyBlockStatus', () => {
  const cases = [
    { label: '200 normal HTML', status: 200, html: '<html><body><h1>Product</h1></body></html>', blocked: false, blockReason: null },
    { label: '403', status: 403, html: '', blocked: true, blockReason: 'status_403' },
    { label: '429', status: 429, html: '', blocked: true, blockReason: 'status_429' },
    { label: '451 robots', status: 451, html: '', blocked: true, blockReason: 'robots_blocked' },
    { label: '503 server error', status: 503, html: '', blocked: true, blockReason: 'server_error' },
    { label: 'status 0', status: 0, html: '', blocked: true, blockReason: 'no_response' },
    { label: 'null status', status: null, html: '', blocked: true, blockReason: 'no_response' },
    { label: 'cloudflare challenge', status: 200, html: '<html><body><div class="cf-browser-verification">checking</div></body></html>', blocked: true, blockReason: 'cloudflare_challenge' },
    { label: 'captcha form', status: 200, html: '<html><body><form id="captcha-form">solve me</form></body></html>', blocked: true, blockReason: 'captcha_detected' },
    { label: 'access denied text', status: 200, html: '<html><body>Access Denied - you are not authorized</body></html>', blocked: true, blockReason: 'access_denied' },
    { label: 'empty response', status: 200, html: '<html><head></head></html>', blocked: true, blockReason: 'empty_response' },
  ];

  for (const { label, status, html, blocked, blockReason } of cases) {
    it(`classifies "${label}" correctly`, () => {
      const result = classifyBlockStatus({ status, html });
      assert.equal(result.blocked, blocked, `blocked should be ${blocked}`);
      assert.equal(result.blockReason, blockReason, `blockReason should be ${blockReason}`);
    });
  }
});

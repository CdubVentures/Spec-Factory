import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotsPolicyCache } from '../src/fetcher/robotsPolicy.js';

function makeFetch(responsesByUrl) {
  return async function fetchStub(url) {
    const row = responsesByUrl[String(url)] || responsesByUrl.default;
    if (!row) {
      throw new Error(`Missing mock response for ${url}`);
    }
    return {
      status: row.status ?? 200,
      ok: row.ok ?? ((row.status ?? 200) >= 200 && (row.status ?? 200) < 300),
      async text() {
        return String(row.body || '');
      }
    };
  };
}

test('robots policy blocks disallowed paths and allows allow-listed paths', async () => {
  const cache = new RobotsPolicyCache({
    fetchImpl: makeFetch({
      'https://example.com/robots.txt': {
        status: 200,
        body: [
          'User-agent: *',
          'Disallow: /private',
          'Allow: /private/specs'
        ].join('\n')
      }
    })
  });

  const blocked = await cache.canFetch({
    url: 'https://example.com/private/secret',
    userAgent: 'SpecHarvester/1.0'
  });
  assert.equal(blocked.allowed, false);

  const allowed = await cache.canFetch({
    url: 'https://example.com/private/specs/mouse',
    userAgent: 'SpecHarvester/1.0'
  });
  assert.equal(allowed.allowed, true);
});

test('robots policy defaults to allow when robots file is unavailable', async () => {
  const cache = new RobotsPolicyCache({
    fetchImpl: makeFetch({
      'https://missing.example.com/robots.txt': {
        status: 404,
        body: 'not found'
      }
    })
  });

  const decision = await cache.canFetch({
    url: 'https://missing.example.com/product/mouse',
    userAgent: 'SpecHarvester/1.0'
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'robots_missing_or_unavailable');
});

test('robots policy treats /*?* as query-only block instead of blocking clean paths', async () => {
  const cache = new RobotsPolicyCache({
    fetchImpl: makeFetch({
      'https://example.com/robots.txt': {
        status: 200,
        body: [
          'User-agent: *',
          'Disallow: /*?*'
        ].join('\n')
      }
    })
  });

  const cleanUrlDecision = await cache.canFetch({
    url: 'https://example.com/product/viper-v3-pro',
    userAgent: 'SpecHarvester/1.0'
  });
  assert.equal(cleanUrlDecision.allowed, true);
  assert.equal(cleanUrlDecision.matched_rule, null);

  const queryUrlDecision = await cache.canFetch({
    url: 'https://example.com/product/viper-v3-pro?sku=black',
    userAgent: 'SpecHarvester/1.0'
  });
  assert.equal(queryUrlDecision.allowed, false);
  assert.deepEqual(queryUrlDecision.matched_rule, {
    type: 'disallow',
    path: '/*?*',
    length: 4
  });
});

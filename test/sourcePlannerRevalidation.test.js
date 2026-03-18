import test from 'node:test';
import assert from 'node:assert/strict';
import { revalidateUrl } from '../src/planner/sourcePlannerRevalidation.js';

function makeRevalidationCtx(overrides = {}) {
  return {
    categoryConfig: { denylist: [] },
    blockedHosts: new Set(),
    ...overrides,
  };
}

// --- Table-driven revalidation tests ---

const REVALIDATION_CASES = [
  // Transport-level rejections
  {
    name: 'rejects empty URL',
    url: '',
    expect: { rejected: true, reason: 'empty_url', level: 'transport' },
  },
  {
    name: 'rejects null URL',
    url: null,
    expect: { rejected: true, reason: 'empty_url', level: 'transport' },
  },
  {
    name: 'rejects undefined URL',
    url: undefined,
    expect: { rejected: true, reason: 'empty_url', level: 'transport' },
  },
  {
    name: 'rejects unparseable URL',
    url: 'not-a-url',
    expect: { rejected: true, reason: 'invalid_url', level: 'transport' },
  },
  {
    name: 'rejects ftp protocol',
    url: 'ftp://example.com/file',
    expect: { rejected: true, reason: 'bad_protocol', level: 'transport' },
  },
  {
    name: 'rejects mailto protocol',
    url: 'mailto:user@example.com',
    expect: { rejected: true, reason: 'bad_protocol', level: 'transport' },
  },
  {
    name: 'rejects third-party search page (techpowerup)',
    url: 'https://www.techpowerup.com/search/?q=mouse',
    expect: { rejected: true, reason: 'search_page', level: 'transport' },
  },
  {
    name: 'rejects third-party search page (rtings)',
    url: 'https://www.rtings.com/search?q=logitech',
    expect: { rejected: true, reason: 'search_page', level: 'transport' },
  },

  // Safety-level rejections
  {
    name: 'rejects denied host',
    url: 'https://denied.example.com/product',
    ctxOverrides: {
      categoryConfig: { denylist: ['denied.example.com'] },
    },
    expect: { rejected: true, reason: 'denied_host', level: 'safety' },
  },
  {
    name: 'rejects blocked host',
    url: 'https://blocked.example.com/product',
    ctxOverrides: {
      blockedHosts: new Set(['blocked.example.com']),
    },
    expect: { rejected: true, reason: 'blocked_host', level: 'safety' },
  },

  // Pass-through cases (NOT rejected)
  {
    name: 'passes valid https URL',
    url: 'https://example.com/product/mouse',
    expect: { rejected: false, reason: null, level: null },
  },
  {
    name: 'passes valid http URL',
    url: 'http://example.com/product/mouse',
    expect: { rejected: false, reason: null, level: null },
  },
  {
    name: 'passes low-value host (NOT rejected at revalidation — moved to routing)',
    url: 'https://reddit.com/r/mousereview/comments/abc',
    expect: { rejected: false, reason: null, level: null },
  },
  {
    name: 'passes manufacturer brand mismatch (NOT rejected — moved to routing)',
    url: 'https://other-brand.com/mice/product',
    expect: { rejected: false, reason: null, level: null },
  },
  {
    name: 'passes family/variant page (NOT rejected — moved to routing)',
    url: 'https://manufacturer.com/mice/viper-v3-hyperspeed',
    expect: { rejected: false, reason: null, level: null },
  },
  {
    name: 'passes manufacturer search page (not in KNOWN_SEARCH_404_HOSTS)',
    url: 'https://razer.com/search?q=viper',
    expect: { rejected: false, reason: null, level: null },
  },
];

for (const { name, url, ctxOverrides, expect: expected } of REVALIDATION_CASES) {
  test(`revalidateUrl: ${name}`, () => {
    const ctx = makeRevalidationCtx(ctxOverrides || {});
    const result = revalidateUrl({ url, revalidationCtx: ctx });
    assert.deepStrictEqual(
      { rejected: result.rejected, reason: result.reason, level: result.level },
      expected,
    );
  });
}

// --- Normalized URL and parsed output on pass-through ---

test('revalidateUrl: returns parsed URL and normalized URL on success', () => {
  const ctx = makeRevalidationCtx();
  const result = revalidateUrl({ url: 'https://example.com/path#fragment', revalidationCtx: ctx });
  assert.equal(result.rejected, false);
  assert.ok(result.parsed instanceof URL);
  assert.equal(result.normalizedUrl, 'https://example.com/path');
  assert.equal(result.host, 'example.com');
});

test('revalidateUrl: strips www from host', () => {
  const ctx = makeRevalidationCtx();
  const result = revalidateUrl({ url: 'https://www.example.com/path', revalidationCtx: ctx });
  assert.equal(result.host, 'example.com');
});

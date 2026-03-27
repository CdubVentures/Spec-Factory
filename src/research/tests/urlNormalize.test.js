import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeUrl,
  isTrackingParam,
  pathSignature
} from '../urlNormalize.js';

test('isTrackingParam detects common tracker keys', () => {
  assert.equal(isTrackingParam('utm_source'), true);
  assert.equal(isTrackingParam('gclid'), true);
  assert.equal(isTrackingParam('fbclid'), true);
  assert.equal(isTrackingParam('ref'), false);
});

test('canonicalizeUrl strips tracking params and normalizes host/scheme/trailing slash', () => {
  const out = canonicalizeUrl('HTTPS://WWW.Example.com/product/spec/?utm_source=x&utm_medium=y&b=2&a=1#frag');
  assert.equal(out.canonical_url, 'https://example.com/product/spec?a=1&b=2');
  assert.equal(out.domain, 'example.com');
  assert.equal(out.path_sig, '/product/spec');
});

test('canonicalizeUrl keeps non-tracking params and normalizes AMP/share paths', () => {
  const amp = canonicalizeUrl('https://example.com/amp/product/spec/?id=123&fbclid=abc');
  assert.equal(amp.canonical_url, 'https://example.com/product/spec?id=123');

  const share = canonicalizeUrl('https://example.com/share/product/spec/?id=123');
  assert.equal(share.canonical_url, 'https://example.com/product/spec?id=123');
});

test('canonicalizeUrl strips locale prefixes so locale variants merge', () => {
  const base = canonicalizeUrl('https://rog.asus.com/mice-mouse-pads/mice/ambidextrous/rog-harpe-ii-ace');
  const us = canonicalizeUrl('https://rog.asus.com/us/mice-mouse-pads/mice/ambidextrous/rog-harpe-ii-ace');
  const pt = canonicalizeUrl('https://rog.asus.com/pt/mice-mouse-pads/mice/ambidextrous/rog-harpe-ii-ace');
  const hkEn = canonicalizeUrl('https://rog.asus.com/hk-en/mice-mouse-pads/mice/ambidextrous/rog-harpe-ii-ace');
  const caEn = canonicalizeUrl('https://rog.asus.com/ca-en/mice-mouse-pads/mice/ambidextrous/rog-harpe-ii-ace');
  assert.equal(base.canonical_url, us.canonical_url, 'base and /us/ should be identical');
  assert.equal(base.canonical_url, pt.canonical_url, 'base and /pt/ should be identical');
  assert.equal(base.canonical_url, hkEn.canonical_url, 'base and /hk-en/ should be identical');
  assert.equal(base.canonical_url, caEn.canonical_url, 'base and /ca-en/ should be identical');
});

test('canonicalizeUrl preserves non-locale path segments', () => {
  // "/si/" is a locale, but "/silicon/" is a real path segment — must not strip
  const real = canonicalizeUrl('https://example.com/silicon/chips');
  assert.ok(real.canonical_url.includes('/silicon/chips'), 'non-locale path must be preserved');
});

test('canonicalizeUrl preserves subpaths after locale strip', () => {
  const spec = canonicalizeUrl('https://rog.asus.com/us/mice-mouse-pads/mice/ambidextrous/rog-harpe-ii-ace/spec');
  const specBase = canonicalizeUrl('https://rog.asus.com/mice-mouse-pads/mice/ambidextrous/rog-harpe-ii-ace/spec');
  assert.equal(spec.canonical_url, specBase.canonical_url, '/us/ prefix should be stripped, /spec suffix preserved');
});

test('pathSignature buckets numeric and uuid-like segments', () => {
  assert.equal(pathSignature('/products/12345/specs'), '/products/:num/specs');
  assert.equal(
    pathSignature('/api/v1/item/550e8400-e29b-41d4-a716-446655440000'),
    '/api/v1/item/:id'
  );
});

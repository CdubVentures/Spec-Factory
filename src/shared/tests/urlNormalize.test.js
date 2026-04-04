import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeUrl,
  pathSignature
} from '../urlNormalize.js';

test('canonicalizeUrl strips hash, sorts params, strips trailing slash, forces HTTPS', () => {
  const out = canonicalizeUrl('https://example.com/product/spec/?b=2&a=1#frag');
  assert.equal(out.canonical_url, 'https://example.com/product/spec?a=1&b=2');
  assert.equal(out.domain, 'example.com');
  assert.equal(out.path_sig, '/product/spec');
});

test('canonicalizeUrl forces HTTP to HTTPS', () => {
  const out = canonicalizeUrl('http://example.com/page');
  assert.equal(out.canonical_url, 'https://example.com/page');
});

test('canonicalizeUrl preserves all query params (no tracking-param stripping)', () => {
  const out = canonicalizeUrl('https://example.com/page?utm_source=x&id=123&fbclid=abc');
  assert.equal(out.canonical_url, 'https://example.com/page?fbclid=abc&id=123&utm_source=x');
});

test('canonicalizeUrl preserves www prefix (no www-stripping)', () => {
  const out = canonicalizeUrl('https://www.example.com/page');
  assert.equal(out.domain, 'www.example.com');
  assert.ok(out.canonical_url.includes('www.example.com'));
});

test('canonicalizeUrl preserves locale paths (no locale-stripping)', () => {
  const us = canonicalizeUrl('https://rog.asus.com/us/mice/rog-harpe-ii-ace');
  const base = canonicalizeUrl('https://rog.asus.com/mice/rog-harpe-ii-ace');
  assert.notEqual(us.canonical_url, base.canonical_url, '/us/ path must NOT be stripped');
});

test('canonicalizeUrl preserves AMP and share paths', () => {
  const amp = canonicalizeUrl('https://example.com/amp/product/spec');
  assert.ok(amp.canonical_url.includes('/amp/product/spec'));
});

test('canonicalizeUrl returns empty for invalid input', () => {
  const empty = canonicalizeUrl('');
  assert.equal(empty.canonical_url, '');
  const bad = canonicalizeUrl('not a url');
  assert.equal(bad.canonical_url, '');
});

test('pathSignature buckets numeric and uuid-like segments', () => {
  assert.equal(pathSignature('/products/12345/specs'), '/products/:num/specs');
  assert.equal(
    pathSignature('/api/v1/item/550e8400-e29b-41d4-a716-446655440000'),
    '/api/v1/item/:id'
  );
});

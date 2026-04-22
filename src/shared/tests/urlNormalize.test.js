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

// --- stripTracking option (fetch-layer dedup) ---

test('stripTracking removes srsltid (Google Shopping)', () => {
  const out = canonicalizeUrl(
    'https://www.razer.com/gaming-mice/razer-deathadder-v3?srsltid=AfmBOor8X2q3',
    { stripTracking: true }
  );
  assert.equal(out.canonical_url, 'https://www.razer.com/gaming-mice/razer-deathadder-v3');
});

test('stripTracking removes all utm_* prefix params', () => {
  const out = canonicalizeUrl(
    'https://example.com/p?utm_source=g&utm_medium=cpc&utm_campaign=x&utm_term=y&utm_content=z&utm_id=123',
    { stripTracking: true }
  );
  assert.equal(out.canonical_url, 'https://example.com/p');
});

test('stripTracking does not strip params merely starting with "utm" (e.g. utmz)', () => {
  const out = canonicalizeUrl('https://example.com/p?utmz=keep&utm_source=drop', { stripTracking: true });
  assert.equal(out.canonical_url, 'https://example.com/p?utmz=keep');
});

test('stripTracking removes platform click-ids', () => {
  const out = canonicalizeUrl(
    'https://example.com/p?gclid=a&fbclid=b&yclid=c&msclkid=d&dclid=e',
    { stripTracking: true }
  );
  assert.equal(out.canonical_url, 'https://example.com/p');
});

test('stripTracking removes mailchimp, analytics, and ref_src params', () => {
  const out = canonicalizeUrl(
    'https://example.com/p?mc_cid=1&mc_eid=2&_ga=3&_gl=4&ref_src=tw',
    { stripTracking: true }
  );
  assert.equal(out.canonical_url, 'https://example.com/p');
});

test('stripTracking preserves real product params (id, sku, variant, color)', () => {
  const out = canonicalizeUrl(
    'https://example.com/p?id=123&sku=ABC&variant=red&color=black&utm_source=x&srsltid=y',
    { stripTracking: true }
  );
  assert.equal(out.canonical_url, 'https://example.com/p?color=black&id=123&sku=ABC&variant=red');
});

test('stripTracking yields empty query for tracking-only URL', () => {
  const out = canonicalizeUrl('https://example.com/p?utm_source=x&gclid=y&srsltid=z', { stripTracking: true });
  assert.equal(out.canonical_url, 'https://example.com/p');
  assert.equal(out.query, '');
});

test('stripTracking makes two URLs differing only by tracking produce identical canonical_url', () => {
  const a = canonicalizeUrl('https://www.razer.com/p/deathadder?srsltid=AfmBOor1', { stripTracking: true });
  const b = canonicalizeUrl('https://www.razer.com/p/deathadder?srsltid=AfmBOor2', { stripTracking: true });
  const c = canonicalizeUrl('https://www.razer.com/p/deathadder?utm_source=google', { stripTracking: true });
  assert.equal(a.canonical_url, b.canonical_url);
  assert.equal(a.canonical_url, c.canonical_url);
});

test('default (no option) preserves tracking params (regression safety)', () => {
  const out = canonicalizeUrl('https://example.com/p?srsltid=x&utm_source=y');
  assert.ok(out.canonical_url.includes('srsltid=x'));
  assert.ok(out.canonical_url.includes('utm_source=y'));
});

test('explicit stripTracking:false matches default (parity)', () => {
  const withFlag = canonicalizeUrl('https://example.com/p?srsltid=x&utm_source=y', { stripTracking: false });
  const noFlag = canonicalizeUrl('https://example.com/p?srsltid=x&utm_source=y');
  assert.equal(withFlag.canonical_url, noFlag.canonical_url);
});

test('stripTracking with no query yields clean URL (no trailing ?)', () => {
  const out = canonicalizeUrl('https://example.com/p', { stripTracking: true });
  assert.equal(out.canonical_url, 'https://example.com/p');
});

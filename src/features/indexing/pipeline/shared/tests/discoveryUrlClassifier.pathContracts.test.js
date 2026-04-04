import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductPathTokenSignature,
  detectSiblingManufacturerProductPage,
  isForumLikeManufacturerSubdomain,
  isLowSignalDiscoveryPath,
  resolveProductPathAnchor,
} from '../urlClassifier.js';

test('isLowSignalDiscoveryPath rejects root feed and search paths but allows product paths', () => {
  const lowSignalCases = [
    'https://example.com/',
    'https://example.com/index.html',
    'https://example.com/feed.xml',
    'https://example.com/feed.rss',
    'https://example.com/search?q=test',
    'https://www.amazon.com/s?k=mouse',
    'https://www.amazon.com/gp/search/something',
  ];

  for (const url of lowSignalCases) {
    assert.equal(isLowSignalDiscoveryPath(new URL(url)), true, url);
  }
  assert.equal(
    isLowSignalDiscoveryPath(new URL('https://razer.com/product/viper-v3-pro')),
    false,
  );
});

test('isForumLikeManufacturerSubdomain detects forum-like subdomains and rejects non-forums', () => {
  assert.equal(isForumLikeManufacturerSubdomain('community.razer.com'), true);
  assert.equal(isForumLikeManufacturerSubdomain('forum.logitech.com'), true);
  assert.equal(isForumLikeManufacturerSubdomain('insider.razer.com'), true);
  assert.equal(isForumLikeManufacturerSubdomain('store.razer.com'), false);
  assert.equal(isForumLikeManufacturerSubdomain('razer.com'), false);
  assert.equal(isForumLikeManufacturerSubdomain(''), false);
});

test('resolveProductPathAnchor preserves the last meaningful segment', () => {
  assert.equal(resolveProductPathAnchor('/product/viper-v3-pro'), 'viper-v3-pro');
  assert.equal(resolveProductPathAnchor('/viper-v3-pro/buy'), 'viper-v3-pro-buy');
  assert.equal(resolveProductPathAnchor('/'), '');
  assert.equal(resolveProductPathAnchor(''), '');
});

test('buildProductPathTokenSignature extracts alpha and numeric signatures', () => {
  const sig = buildProductPathTokenSignature('viper-v3-pro');
  assert.ok(sig.alpha instanceof Set);
  assert.ok(sig.numeric instanceof Set);
  assert.ok(sig.alpha.has('viper'));
  assert.ok(sig.numeric.has('3'));
});

test('detectSiblingManufacturerProductPage distinguishes non-manufacturer exact-match and sibling pages', () => {
  const cases = [
    [{
      row: { role: 'review', path: '/product/viper-v2' },
      variables: { base_model: 'Viper V3', variant: 'Pro', brand: 'Razer' },
    }, false],
    [{
      row: { role: 'manufacturer', path: '/product/viper-v2' },
      variables: { base_model: 'Viper V3', variant: 'Pro', brand: 'Razer' },
    }, true],
    [{
      row: { role: 'manufacturer', path: '/product/viper-v3-pro' },
      variables: { base_model: 'Viper V3', variant: 'Pro', brand: 'Razer' },
    }, false],
  ];

  for (const [input, expected] of cases) {
    assert.equal(detectSiblingManufacturerProductPage(input), expected);
  }
});

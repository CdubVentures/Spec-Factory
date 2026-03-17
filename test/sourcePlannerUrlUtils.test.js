import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHost,
  isObject,
  getHost,
  canonicalizeQueueUrl,
  hostInSet,
  tokenize,
  slug,
  slugIdentityTokens,
  countTokenHits,
  countQueueHost,
  urlPath,
  normalizeSourcePath,
  normalizeComparablePath,
  extractCategoryProductSlug,
  extractManufacturerProductishSlug,
  isSitemapLikePath,
  isNonProductSitemapPointer,
  stripLocalePrefix,
  decodeXmlEntities,
  extractFirstHttpUrlToken,
  CATEGORY_PRODUCT_PATH_RE,
  BENIGN_LOCKED_PRODUCT_SUFFIX_TOKENS
} from '../src/planner/sourcePlannerUrlUtils.js';

// --- normalizeHost ---

test('normalizeHost strips www prefix and lowercases', () => {
  const cases = [
    ['www.Example.COM', 'example.com'],
    ['EXAMPLE.COM', 'example.com'],
    ['  www.foo.bar  ', 'foo.bar'],
    ['', ''],
    [null, ''],
    [undefined, ''],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeHost(input), expected, `normalizeHost(${JSON.stringify(input)})`);
  }
});

// --- isObject ---

test('isObject distinguishes plain objects from non-objects', () => {
  const cases = [
    [{ a: 1 }, true],
    [{}, true],
    [[], false],
    [null, false],
    [undefined, false],
    ['string', false],
    [0, false],
    [false, false],
  ];
  for (const [input, expected] of cases) {
    assert.equal(isObject(input), expected, `isObject(${JSON.stringify(input)})`);
  }
});

// --- getHost ---

test('getHost extracts normalized hostname from URL', () => {
  const cases = [
    ['https://www.Example.COM/path', 'example.com'],
    ['https://sub.domain.org/page?q=1', 'sub.domain.org'],
    ['not-a-url', ''],
    ['', ''],
  ];
  for (const [input, expected] of cases) {
    assert.equal(getHost(input), expected, `getHost(${JSON.stringify(input)})`);
  }
});

// --- canonicalizeQueueUrl ---

test('canonicalizeQueueUrl strips fragment', () => {
  const parsed = new URL('https://example.com/page#section');
  assert.equal(canonicalizeQueueUrl(parsed), 'https://example.com/page');
});

test('canonicalizeQueueUrl preserves query string', () => {
  const parsed = new URL('https://example.com/page?q=test#frag');
  assert.equal(canonicalizeQueueUrl(parsed), 'https://example.com/page?q=test');
});

// --- hostInSet ---

test('hostInSet matches exact and subdomain entries', () => {
  const hostSet = new Set(['example.com', 'foo.org']);
  assert.equal(hostInSet('example.com', hostSet), true);
  assert.equal(hostInSet('sub.example.com', hostSet), true);
  assert.equal(hostInSet('other.com', hostSet), false);
  assert.equal(hostInSet('notexample.com', hostSet), false);
});

// --- tokenize ---

test('tokenize splits and filters short tokens', () => {
  assert.deepEqual(tokenize('Logitech G Pro X'), ['logitech', 'pro']);
  assert.deepEqual(tokenize('AB'), []);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
});

// --- slug ---

test('slug creates normalized slugs', () => {
  const cases = [
    ['Logitech G Pro', 'logitech-g-pro'],
    ['  hello world  ', 'hello-world'],
    ['a--b', 'a-b'],
    ['', ''],
    [null, ''],
  ];
  for (const [input, expected] of cases) {
    assert.equal(slug(input), expected, `slug(${JSON.stringify(input)})`);
  }
});

// --- slugIdentityTokens ---

test('slugIdentityTokens includes 2+ char tokens', () => {
  assert.deepEqual(slugIdentityTokens('g-pro-x-superlight-2'), ['pro', 'superlight']);
  assert.deepEqual(slugIdentityTokens('ab-cd'), ['ab', 'cd']);
  assert.deepEqual(slugIdentityTokens(''), []);
});

// --- countTokenHits ---

test('countTokenHits counts matching tokens in text', () => {
  assert.equal(countTokenHits('logitech g pro superlight', ['logitech', 'pro', 'missing']), 2);
  assert.equal(countTokenHits('', ['token']), 0);
  assert.equal(countTokenHits('some text', []), 0);
  assert.equal(countTokenHits('some text', null), 0);
  assert.equal(countTokenHits(null, ['text']), 0);
});

// --- countQueueHost ---

test('countQueueHost counts rows matching host', () => {
  const queue = [
    { host: 'a.com' },
    { host: 'b.com' },
    { host: 'a.com' },
  ];
  assert.equal(countQueueHost(queue, 'a.com'), 2);
  assert.equal(countQueueHost(queue, 'b.com'), 1);
  assert.equal(countQueueHost(queue, 'c.com'), 0);
  assert.equal(countQueueHost(null, 'a.com'), 0);
});

// --- urlPath ---

test('urlPath extracts lowercased pathname', () => {
  assert.equal(urlPath('https://example.com/Foo/Bar'), '/foo/bar');
  assert.equal(urlPath('not-a-url'), '');
});

// --- normalizeSourcePath ---

test('normalizeSourcePath normalizes URL pathnames', () => {
  assert.equal(normalizeSourcePath('https://example.com/foo/bar/'), '/foo/bar');
  assert.equal(normalizeSourcePath('https://example.com/'), '/');
  assert.equal(normalizeSourcePath('bad'), '/');
});

// --- normalizeComparablePath ---

test('normalizeComparablePath normalizes pathnames consistently', () => {
  const cases = [
    ['/Foo/Bar/', '/foo/bar'],
    ['/', '/'],
    ['', '/'],
    [null, '/'],
    ['/foo//bar', '/foo/bar'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeComparablePath(input), expected, `normalizeComparablePath(${JSON.stringify(input)})`);
  }
});

// --- extractCategoryProductSlug ---

test('extractCategoryProductSlug extracts slug from category product paths', () => {
  const cases = [
    ['/mice/g-pro-x-superlight-2', 'g-pro-x-superlight-2'],
    ['/gaming-mice/razer-viper', 'razer-viper'],
    ['/keyboards/huntsman-v3', 'huntsman-v3'],
    ['/headsets/blackshark-v2', 'blackshark-v2'],
    ['/monitors/zowie-xl2546', 'zowie-xl2546'],
    ['/other/product-slug', ''],
    ['', ''],
    ['/mice/', ''],
  ];
  for (const [input, expected] of cases) {
    assert.equal(extractCategoryProductSlug(input), expected, `extractCategoryProductSlug(${JSON.stringify(input)})`);
  }
});

// --- extractManufacturerProductishSlug ---

test('extractManufacturerProductishSlug extracts from various product path patterns', () => {
  const cases = [
    ['/mice/viper-v3-pro', 'viper-v3-pro'],
    ['/product/some-mouse', 'some-mouse'],
    ['/products/my-product', 'my-product'],
    ['/products/category/my-product', 'my-product'],
    ['/variant/products/variant-prod', 'variant-prod'],
    ['/about', ''],
    ['', ''],
  ];
  for (const [input, expected] of cases) {
    assert.equal(
      extractManufacturerProductishSlug(input),
      expected,
      `extractManufacturerProductishSlug(${JSON.stringify(input)})`
    );
  }
});

// --- isSitemapLikePath ---

test('isSitemapLikePath detects sitemap in pathname or search', () => {
  assert.equal(isSitemapLikePath('/sitemap.xml'), true);
  assert.equal(isSitemapLikePath('/foo', '?sitemap=1'), true);
  assert.equal(isSitemapLikePath('/robots.txt'), false);
  assert.equal(isSitemapLikePath('', ''), false);
});

// --- isNonProductSitemapPointer ---

test('isNonProductSitemapPointer rejects image/video/blog sitemaps', () => {
  const make = (path) => ({ hostname: 'example.com', pathname: path, search: '' });
  assert.equal(isNonProductSitemapPointer(make('/sitemap-images.xml')), true);
  assert.equal(isNonProductSitemapPointer(make('/sitemap-video.xml')), true);
  assert.equal(isNonProductSitemapPointer(make('/sitemap-blog.xml')), true);
  assert.equal(isNonProductSitemapPointer(make('/sitemap-news.xml')), true);
  assert.equal(isNonProductSitemapPointer(make('/sitemap-press.xml')), true);
  assert.equal(isNonProductSitemapPointer(make('/sitemap-products.xml')), false);
  assert.equal(isNonProductSitemapPointer({ hostname: '', pathname: '', search: '' }), false);
});

// --- stripLocalePrefix ---

test('stripLocalePrefix strips common locale prefixes', () => {
  const cases = [
    ['/en/mice/product', { pathname: '/mice/product', hadLocalePrefix: true }],
    ['/en-us/mice/product', { pathname: '/mice/product', hadLocalePrefix: true }],
    ['/mice/product', { pathname: '/mice/product', hadLocalePrefix: false }],
    ['/', { pathname: '/', hadLocalePrefix: false }],
    ['', { pathname: '', hadLocalePrefix: false }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(stripLocalePrefix(input), expected, `stripLocalePrefix(${JSON.stringify(input)})`);
  }
});

// --- decodeXmlEntities ---

test('decodeXmlEntities decodes standard XML entities', () => {
  assert.equal(decodeXmlEntities('&amp;&lt;&gt;&quot;&#39;'), '&<>"\'');
  assert.equal(decodeXmlEntities('no entities'), 'no entities');
  assert.equal(decodeXmlEntities(''), '');
  assert.equal(decodeXmlEntities(null), '');
});

// --- extractFirstHttpUrlToken ---

test('extractFirstHttpUrlToken extracts first URL from text', () => {
  assert.equal(
    extractFirstHttpUrlToken('See https://example.com/page for details'),
    'https://example.com/page'
  );
  assert.equal(
    extractFirstHttpUrlToken('https://foo.com/a&amp;b=1'),
    'https://foo.com/a&b=1'
  );
  assert.equal(extractFirstHttpUrlToken('no url here'), '');
  assert.equal(extractFirstHttpUrlToken(''), '');
});

// --- CATEGORY_PRODUCT_PATH_RE ---

test('CATEGORY_PRODUCT_PATH_RE matches category product paths', () => {
  assert.equal(CATEGORY_PRODUCT_PATH_RE.test('/mice/foo'), true);
  assert.equal(CATEGORY_PRODUCT_PATH_RE.test('/gaming-mice/foo'), true);
  assert.equal(CATEGORY_PRODUCT_PATH_RE.test('/keyboards/foo'), true);
  assert.equal(CATEGORY_PRODUCT_PATH_RE.test('/headsets/foo'), true);
  assert.equal(CATEGORY_PRODUCT_PATH_RE.test('/monitors/foo'), true);
  assert.equal(CATEGORY_PRODUCT_PATH_RE.test('/other/foo'), false);
});

// --- BENIGN_LOCKED_PRODUCT_SUFFIX_TOKENS ---

test('BENIGN_LOCKED_PRODUCT_SUFFIX_TOKENS contains expected tokens', () => {
  assert.equal(BENIGN_LOCKED_PRODUCT_SUFFIX_TOKENS.has('base'), true);
  assert.equal(BENIGN_LOCKED_PRODUCT_SUFFIX_TOKENS.size, 1);
});

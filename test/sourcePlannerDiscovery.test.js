import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceDiscovery } from '../src/planner/sourcePlannerDiscovery.js';

function makeDiscovery(overrides = {}) {
  const enqueued = [];
  const counters = { robotsSitemapsDiscovered: 0, sitemapUrlsDiscovered: 0 };
  const defaults = {
    categoryConfig: {
      sourceHosts: [
        { host: 'manufacturer.com', tierName: 'manufacturer' },
        { host: 'lab.com', tierName: 'lab' }
      ],
      denylist: []
    },
    allowlistHosts: new Set(['manufacturer.com', 'lab.com']),
    allowedCategoryProductSlugs: new Set(),
    enqueue: (url, from, opts) => {
      enqueued.push({ url, from, opts });
      return true;
    },
    isRelevantDiscoveredUrl: () => true,
    hasQueuedOrVisitedComparableUrl: () => false,
    counters,
    ...overrides
  };
  const discovery = createSourceDiscovery(defaults);
  return { discovery, enqueued, counters };
}

// --- discoverFromHtml ---

test('discoverFromHtml extracts href links from HTML', () => {
  const { discovery, enqueued } = makeDiscovery();
  const html = `
    <a href="https://manufacturer.com/product/mouse">Mouse</a>
    <a href="https://manufacturer.com/product/keyboard">Keyboard</a>
  `;
  discovery.discoverFromHtml('https://manufacturer.com/page', html);
  assert.equal(enqueued.length, 2);
  assert.ok(enqueued[0].url.includes('/product/mouse'));
  assert.ok(enqueued[1].url.includes('/product/keyboard'));
});

test('discoverFromHtml ignores empty html', () => {
  const { discovery, enqueued } = makeDiscovery();
  discovery.discoverFromHtml('https://manufacturer.com/page', '');
  assert.equal(enqueued.length, 0);
});

test('discoverFromHtml skips non-allowlisted hosts', () => {
  const { discovery, enqueued } = makeDiscovery();
  const html = '<a href="https://unknown.com/product">Link</a>';
  discovery.discoverFromHtml('https://manufacturer.com/page', html);
  assert.equal(enqueued.length, 0);
});

test('discoverFromHtml filters via isRelevantDiscoveredUrl callback', () => {
  const { discovery, enqueued } = makeDiscovery({
    isRelevantDiscoveredUrl: () => false
  });
  const html = '<a href="https://manufacturer.com/product/mouse">Mouse</a>';
  discovery.discoverFromHtml('https://manufacturer.com/page', html);
  assert.equal(enqueued.length, 0);
});

test('discoverFromHtml skips same-path self links in manufacturer context', () => {
  const { discovery, enqueued } = makeDiscovery();
  const html = '<a href="https://manufacturer.com/mice/viper-v3-pro">Self</a>';
  discovery.discoverFromHtml('https://manufacturer.com/mice/viper-v3-pro', html);
  assert.equal(enqueued.length, 0);
});

test('discoverFromHtml skips sibling product family paths in manufacturer context', () => {
  const { discovery, enqueued } = makeDiscovery();
  const html = '<a href="https://manufacturer.com/mice/viper-v3-pro-wireless">Sibling</a>';
  discovery.discoverFromHtml('https://manufacturer.com/mice/viper-v3-pro', html);
  assert.equal(enqueued.length, 0);
});

// --- discoverFromRobots ---

test('discoverFromRobots extracts sitemap directives', () => {
  const { discovery, enqueued, counters } = makeDiscovery();
  const robots = `
User-agent: *
Disallow: /admin
Sitemap: https://manufacturer.com/sitemap.xml
Sitemap: https://manufacturer.com/sitemap2.xml
  `;
  const count = discovery.discoverFromRobots('https://manufacturer.com/robots.txt', robots);
  assert.equal(count, 2);
  assert.equal(enqueued.length, 2);
  assert.equal(counters.robotsSitemapsDiscovered, 2);
});

test('discoverFromRobots returns 0 for empty body', () => {
  const { discovery } = makeDiscovery();
  assert.equal(discovery.discoverFromRobots('https://manufacturer.com/robots.txt', ''), 0);
  assert.equal(discovery.discoverFromRobots('https://manufacturer.com/robots.txt', null), 0);
});

test('discoverFromRobots skips image sitemaps in manufacturer context', () => {
  const { discovery, enqueued } = makeDiscovery();
  const robots = `
Sitemap: https://manufacturer.com/sitemap-images.xml
Sitemap: https://manufacturer.com/sitemap-products.xml
  `;
  discovery.discoverFromRobots('https://manufacturer.com/robots.txt', robots);
  assert.equal(enqueued.length, 1);
  assert.ok(enqueued[0].url.includes('products'));
});

test('discoverFromRobots handles XML-entity-encoded sitemap URLs', () => {
  const { discovery, enqueued } = makeDiscovery();
  const robots = 'Sitemap: https://manufacturer.com/sitemap.xml&amp;page=1';
  discovery.discoverFromRobots('https://manufacturer.com/robots.txt', robots);
  assert.equal(enqueued.length, 1);
  assert.ok(enqueued[0].url.includes('&page=1'));
});

// --- discoverFromSitemap ---

test('discoverFromSitemap extracts URLs from sitemap XML', () => {
  const { discovery, enqueued, counters } = makeDiscovery();
  const xml = `
<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://manufacturer.com/mice/product-a</loc></url>
  <url><loc>https://manufacturer.com/mice/product-b</loc></url>
</urlset>
  `;
  const count = discovery.discoverFromSitemap('https://manufacturer.com/sitemap.xml', xml);
  assert.equal(count, 2);
  assert.equal(enqueued.length, 2);
  assert.equal(counters.sitemapUrlsDiscovered, 2);
});

test('discoverFromSitemap returns 0 for non-manufacturer context', () => {
  const { discovery, enqueued } = makeDiscovery();
  const xml = '<urlset><url><loc>https://lab.com/review</loc></url></urlset>';
  const count = discovery.discoverFromSitemap('https://lab.com/sitemap.xml', xml);
  assert.equal(count, 0);
  assert.equal(enqueued.length, 0);
});

test('discoverFromSitemap returns 0 for empty body', () => {
  const { discovery } = makeDiscovery();
  assert.equal(discovery.discoverFromSitemap('https://manufacturer.com/sitemap.xml', ''), 0);
  assert.equal(discovery.discoverFromSitemap('https://manufacturer.com/sitemap.xml', null), 0);
});

test('discoverFromSitemap deduplicates URLs', () => {
  const { discovery, enqueued } = makeDiscovery();
  const xml = `
<urlset>
  <url><loc>https://manufacturer.com/mice/product-a</loc></url>
  <url><loc>https://manufacturer.com/mice/product-a</loc></url>
</urlset>
  `;
  discovery.discoverFromSitemap('https://manufacturer.com/sitemap.xml', xml);
  assert.equal(enqueued.length, 1);
});

test('discoverFromSitemap decodes XML entities in URLs', () => {
  const { discovery, enqueued } = makeDiscovery();
  const xml = '<urlset><url><loc>https://manufacturer.com/mice/product?a=1&amp;b=2</loc></url></urlset>';
  discovery.discoverFromSitemap('https://manufacturer.com/sitemap.xml', xml);
  assert.equal(enqueued.length, 1);
  assert.ok(enqueued[0].url.includes('a=1&b=2'));
});

test('discoverFromSitemap filters via isRelevantDiscoveredUrl callback', () => {
  const { discovery, enqueued } = makeDiscovery({
    isRelevantDiscoveredUrl: () => false
  });
  const xml = '<urlset><url><loc>https://manufacturer.com/mice/product</loc></url></urlset>';
  discovery.discoverFromSitemap('https://manufacturer.com/sitemap.xml', xml);
  assert.equal(enqueued.length, 0);
});

test('discoverFromSitemap skips locale variants of locked product paths', () => {
  const { discovery, enqueued } = makeDiscovery({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro'])
  });
  const xml = `
<urlset>
  <url><loc>https://manufacturer.com/mice/viper-v3-pro</loc></url>
  <url><loc>https://manufacturer.com/en-us/mice/viper-v3-pro</loc></url>
</urlset>
  `;
  discovery.discoverFromSitemap('https://manufacturer.com/sitemap.xml', xml);
  assert.equal(enqueued.length, 1, 'should skip locale variant');
  assert.ok(!enqueued[0].url.includes('/en-us/'));
});

test('discoverFromSitemap uses hasQueuedOrVisitedComparableUrl to skip duplicates', () => {
  const { discovery, enqueued } = makeDiscovery({
    allowedCategoryProductSlugs: new Set(['viper-v3-pro']),
    hasQueuedOrVisitedComparableUrl: () => true
  });
  const xml = '<urlset><url><loc>https://manufacturer.com/mice/viper-v3-pro</loc></url></urlset>';
  discovery.discoverFromSitemap('https://manufacturer.com/sitemap.xml', xml);
  assert.equal(enqueued.length, 0);
});

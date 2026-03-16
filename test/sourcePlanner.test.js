import test from 'node:test';
import assert from 'node:assert/strict';
import { SourcePlanner } from '../src/planner/sourcePlanner.js';

function makeCategoryConfig() {
  return {
    sourceHosts: [
      { host: 'manufacturer.com', tierName: 'manufacturer' },
      { host: 'lab.com', tierName: 'lab' },
      { host: 'db-a.com', tierName: 'database' },
      { host: 'db-b.com', tierName: 'database' }
    ],
    denylist: []
  };
}

function makeConfig(overrides = {}) {
  return {
    maxUrlsPerProduct: 20,
    maxCandidateUrls: 50,
    maxPagesPerDomain: 2,
    maxManufacturerUrlsPerProduct: 20,
    maxManufacturerPagesPerDomain: 8,
    manufacturerReserveUrls: 0,
    manufacturerDeepResearchEnabled: true,
    fetchCandidateSources: false,
    ...overrides
  };
}

test('source planner does not enqueue candidate domains when candidate crawl is disabled', () => {
  const planner = new SourcePlanner(
    { seedUrls: [], preferredSources: {} },
    makeConfig({ fetchCandidateSources: false }),
    makeCategoryConfig()
  );

  planner.enqueue('https://manufacturer.com/p/one');
  planner.enqueue('https://unknown.example/specs');

  const first = planner.next();
  assert.equal(first.host, 'manufacturer.com');
  assert.equal(first.candidateSource, false);
  assert.equal(planner.hasNext(), false);
});

test('source planner keeps candidates last and uses source-intel score inside a tier', () => {
  const planner = new SourcePlanner(
    { seedUrls: [], preferredSources: {} },
    makeConfig({ fetchCandidateSources: true }),
    makeCategoryConfig(),
    {
      requiredFields: ['fields.sensor', 'fields.polling_rate'],
      sourceIntel: {
        domains: {
          'db-a.com': {
            planner_score: 0.6,
            per_field_helpfulness: { sensor: 100 }
          },
          'db-b.com': {
            planner_score: 0.95,
            per_field_helpfulness: { sensor: 10 }
          }
        }
      }
    }
  );

  planner.enqueue('https://db-a.com/product/1');
  planner.enqueue('https://db-b.com/product/1');
  planner.enqueue('https://random-candidate.com/p/1');

  const first = planner.next();
  const second = planner.next();
  const third = planner.next();

  assert.equal(first.host, 'db-b.com');
  assert.equal(first.tier, 2);
  assert.equal(second.host, 'db-a.com');
  assert.equal(second.tier, 2);
  assert.equal(third.host, 'random-candidate.com');
  assert.equal(third.tier, 4);
  assert.equal(third.candidateSource, true);
});

test('source planner uses field reward memory to prefer stronger field paths', () => {
  const planner = new SourcePlanner(
    { seedUrls: [], preferredSources: {} },
    makeConfig({ fetchCandidateSources: false }),
    makeCategoryConfig(),
    {
      requiredFields: ['fields.sensor'],
      sourceIntel: {
        domains: {
          'db-a.com': {
            planner_score: 0.9,
            per_field_reward: {
              sensor: { score: -0.6 }
            },
            per_path: {
              '/product/m100': {
                path: '/product/m100',
                per_field_reward: {
                  sensor: { score: -0.8 }
                }
              }
            }
          },
          'db-b.com': {
            planner_score: 0.82,
            per_field_reward: {
              sensor: { score: 0.2 }
            },
            per_path: {
              '/specs/m100': {
                path: '/specs/m100',
                per_field_reward: {
                  sensor: { score: 0.95 }
                }
              }
            }
          }
        }
      }
    }
  );

  planner.enqueue('https://db-a.com/product/m100');
  planner.enqueue('https://db-b.com/specs/m100');

  const first = planner.next();
  const second = planner.next();

  assert.equal(first.host, 'db-b.com');
  assert.equal(second.host, 'db-a.com');
});

test('source planner prioritizes manufacturer queue ahead of same-tier lab pages', () => {
  const planner = new SourcePlanner(
    { seedUrls: [], preferredSources: {} },
    makeConfig({ fetchCandidateSources: false }),
    makeCategoryConfig()
  );

  planner.enqueue('https://lab.com/review/1');
  planner.enqueue('https://manufacturer.com/product/1');

  const first = planner.next();
  const second = planner.next();

  assert.equal(first.host, 'manufacturer.com');
  assert.equal(first.role, 'manufacturer');
  assert.equal(second.host, 'lab.com');
});

test('source planner preserves non-manufacturer capacity for manufacturer deep research', () => {
  const planner = new SourcePlanner(
    { seedUrls: [], preferredSources: {} },
    makeConfig({
      maxUrlsPerProduct: 4,
      manufacturerReserveUrls: 2,
      fetchCandidateSources: false
    }),
    makeCategoryConfig()
  );

  planner.enqueue('https://db-a.com/product/1');
  planner.enqueue('https://db-b.com/product/1');
  planner.enqueue('https://db-a.com/product/2');
  planner.enqueue('https://db-b.com/product/2');
  planner.enqueue('https://manufacturer.com/product/1');
  planner.enqueue('https://manufacturer.com/support/product-1');

  const hosts = [];
  while (planner.hasNext()) {
    hosts.push(planner.next().host);
  }

  assert.deepEqual(hosts, ['manufacturer.com', 'manufacturer.com', 'db-a.com', 'db-b.com']);
});

test('source planner de-duplicates manufacturer queue URLs', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Acme', model: 'M100' },
      productId: 'mouse-acme-m100'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    makeCategoryConfig()
  );

  planner.enqueue('https://manufacturer.com/product/m100');
  planner.enqueue('https://manufacturer.com/product/m100');

  const urls = [];
  while (planner.hasNext()) {
    urls.push(planner.next().url);
  }

  assert.deepEqual(urls, ['https://manufacturer.com/product/m100']);
});

test('source planner accepts locale-prefixed manufacturer spec paths in manufacturer context', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Acme', model: 'M100' },
      productId: 'mouse-acme-m100'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    makeCategoryConfig()
  );

  const parsed = new URL('https://manufacturer.com/en/m100/specs');
  assert.equal(planner.isRelevantDiscoveredUrl(parsed, { manufacturerContext: true }), true);
});

test('source planner discovers manufacturer URLs from sitemap XML', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Acme', model: 'M100' },
      productId: 'mouse-acme-m100'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    makeCategoryConfig()
  );

  const discovered = planner.discoverFromSitemap(
    'https://manufacturer.com/sitemap.xml',
    [
      '<urlset>',
      '<url><loc>https://manufacturer.com/en/m100/specs</loc></url>',
      '<url><loc>https://manufacturer.com/support/m100</loc></url>',
      '<url><loc>https://manufacturer.com/sitemap-products.xml</loc></url>',
      '<url><loc>https://unapproved.com/product/m100</loc></url>',
      '</urlset>'
    ].join('')
  );

  assert.equal(discovered >= 3, true);
  assert.equal(planner.getStats().sitemap_urls_discovered >= 3, true);
});

test('source planner rejects sibling manufacturer category product paths even when family tokens overlap', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  assert.equal(
    planner.isRelevantDiscoveredUrl(
      new URL('https://razer.com/gaming-mice/razer-viper-v3-pro'),
      { manufacturerContext: true, sitemapContext: true }
    ),
    true
  );
  assert.equal(
    planner.isRelevantDiscoveredUrl(
      new URL('https://razer.com/gaming-mice/razer-viper-v3-hyperspeed'),
      { manufacturerContext: true, sitemapContext: true }
    ),
    false
  );
  assert.equal(
    planner.isRelevantDiscoveredUrl(
      new URL('https://razer.com/gaming-mice/razer-viper-v2-pro'),
      { manufacturerContext: true, sitemapContext: true }
    ),
    false
  );
  assert.equal(
    planner.isRelevantDiscoveredUrl(
      new URL('https://razer.com/gaming-mice/counter-strike-2-razer-viper-v3-pro'),
      { manufacturerContext: true, sitemapContext: true }
    ),
    false
  );
});

test('source planner discoverFromSitemap skips sibling manufacturer product pages for locked model runs', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  planner.discoverFromSitemap(
    'https://razer.com/sitemap.xml',
    [
      '<urlset>',
      '<url><loc>https://razer.com/gaming-mice/razer-viper-v3-pro</loc></url>',
      '<url><loc>https://www.razer.com/gaming-mice/razer-viper-v3-pro</loc></url>',
      '<url><loc>https://razer.com/mena-ar/gaming-mice/razer-viper-v3-pro</loc></url>',
      '<url><loc>https://razer.com/gaming-mice/razer-viper-v3-hyperspeed</loc></url>',
      '<url><loc>https://razer.com/gaming-mice/razer-viper-v2-pro</loc></url>',
      '<url><loc>https://razer.com/gaming-mice/counter-strike-2-razer-viper-v3-pro</loc></url>',
      '<url><loc>https://razer.com/support/razer-viper-v3-pro</loc></url>',
      '</urlset>'
    ].join('')
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(seenUrls.includes('https://razer.com/gaming-mice/razer-viper-v3-pro'), true);
  assert.equal(seenUrls.includes('https://www.razer.com/gaming-mice/razer-viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/mena-ar/gaming-mice/razer-viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/support/razer-viper-v3-pro'), true);
  assert.equal(seenUrls.includes('https://razer.com/gaming-mice/razer-viper-v3-hyperspeed'), false);
  assert.equal(seenUrls.includes('https://razer.com/gaming-mice/razer-viper-v2-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/gaming-mice/counter-strike-2-razer-viper-v3-pro'), false);
});

test('source planner discovers sitemap pointers from robots.txt', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Acme', model: 'M100' },
      productId: 'mouse-acme-m100'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    makeCategoryConfig()
  );

  const discovered = planner.discoverFromRobots(
    'https://manufacturer.com/robots.txt',
    [
      'User-agent: *',
      'Disallow: /cart',
      'Sitemap: https://manufacturer.com/sitemap.xml',
      'Sitemap: https://manufacturer.com/sitemap-support.xml'
    ].join('\n')
  );

  assert.equal(discovered, 2);
  assert.equal(planner.getStats().robots_sitemaps_discovered, 2);
});

test('source planner discoverFromRobots strips html wrapper tags from sitemap directives', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Logitech G', model: 'Pro X Superlight 2' },
      productId: 'mouse-logitech-g-pro-x-superlight-2'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    {
      sourceHosts: [{ host: 'logitechg.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  const discovered = planner.discoverFromRobots(
    'https://www.logitechg.com/robots.txt',
    [
      '<html><body><pre>User-agent: *',
      'Disallow: /cart',
      'Sitemap: https://www.logitechg.com/sitemap_index.xml</pre></body></html>'
    ].join('\n')
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(discovered, 1);
  assert.equal(
    seenUrls.includes('https://www.logitechg.com/sitemap_index.xml'),
    true,
    `expected clean sitemap pointer to be enqueued: ${JSON.stringify(seenUrls)}`
  );
  assert.equal(
    seenUrls.some((url) => url.includes('%3C/pre%3E')),
    false,
    `expected html wrapper tags to be stripped from sitemap pointer: ${JSON.stringify(seenUrls)}`
  );
});

test('source planner discoverFromRobots skips image sitemap pointers for locked manufacturer products', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  const discovered = planner.discoverFromRobots(
    'https://razer.com/robots.txt',
    [
      'User-agent: *',
      'Disallow: /cart',
      'Sitemap: https://sitemap-xml.razer.com/pro-sitemaps-4237407.php?sn=sitemap_images.xml',
      'Sitemap: https://www.razer.com/sitemap-products.xml'
    ].join('\n')
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(discovered, 1);
  assert.equal(
    seenUrls.includes('https://sitemap-xml.razer.com/pro-sitemaps-4237407.php?sn=sitemap_images.xml'),
    false
  );
  assert.equal(seenUrls.includes('https://www.razer.com/sitemap-products.xml'), true);
});

test('source planner discoverFromSitemap skips non-sitemap API XML entries from manufacturer sitemap indexes', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  planner.discoverFromSitemap(
    'https://sitemap-xml.razer.com/pro-sitemaps-4237407.php?sn=sitemap1.xml',
    [
      '<urlset>',
      '<url><loc>https://api-p1.phoenix.razer.com/medias/Category-en-AU-AUD-17122041193263043540.xml?context=test</loc></url>',
      '<url><loc>https://www.razer.com/sitemap.xml</loc></url>',
      '<url><loc>https://www.razer.com/support/razer-viper-v3-pro</loc></url>',
      '</urlset>'
    ].join('')
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(
    seenUrls.includes('https://api-p1.phoenix.razer.com/medias/Category-en-AU-AUD-17122041193263043540.xml?context=test'),
    false
  );
  assert.equal(seenUrls.includes('https://www.razer.com/sitemap.xml'), true);
  assert.equal(seenUrls.includes('https://www.razer.com/support/razer-viper-v3-pro'), true);
});

test('source planner manufacturer deep seeds are brand-targeted', () => {
  const categoryConfig = {
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer' },
      { host: 'logitechg.com', tierName: 'manufacturer' }
    ],
    denylist: []
  };
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Logitech', model: 'G Pro X Superlight 2' },
      productId: 'mouse-logitech-g-pro-x-superlight-2'
    },
    makeConfig({ fetchCandidateSources: false }),
    categoryConfig
  );

  const stats = planner.getStats();
  assert.deepEqual(stats.brand_manufacturer_hosts, ['logitechg.com']);
});

test('source planner manufacturer deep seeds retain robots discovery instead of guessing direct category slugs', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({ fetchCandidateSources: false }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  const seenUrls = [];
  for (let index = 0; index < 8; index += 1) {
    const next = planner.next();
    if (!next) {
      break;
    }
    seenUrls.push(next.url);
  }

  assert.equal(
    seenUrls.includes('https://razer.com/robots.txt'),
    true,
    `expected robots discovery seed in deep queue: ${JSON.stringify(seenUrls)}`
  );
  assert.equal(
    seenUrls.includes('https://razer.com/gaming-mice/razer-viper-v3-pro'),
    false,
    `guessed direct category slug should not be seeded: ${JSON.stringify(seenUrls)}`
  );
});

test('source planner does not bypass brand manufacturer filtering for seeded discovery URLs', () => {
  const categoryConfig = {
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer' },
      { host: 'logitechg.com', tierName: 'manufacturer' }
    ],
    denylist: []
  };
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Logitech', model: 'G Pro X Superlight 2' },
      productId: 'mouse-logitech-g-pro-x-superlight-2'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    categoryConfig
  );

  planner.seed(['https://razer.com/specs/g-pro-x-superlight-2']);
  const stats = planner.getStats();
  assert.equal(stats.manufacturer_queue_count, 0);
  assert.equal(stats.brand_manufacturer_hosts.includes('logitechg.com'), true);
});

test('source planner can block a mismatched manufacturer host and remove queued URLs', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Acme', model: 'M100' },
      productId: 'mouse-acme-m100'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    makeCategoryConfig()
  );

  planner.enqueue('https://manufacturer.com/product/m100');
  planner.enqueue('https://manufacturer.com/support/m100');
  const removed = planner.blockHost('manufacturer.com', 'brand_mismatch');

  assert.equal(removed >= 2, true);
  assert.equal(planner.hasNext(), false);
  assert.equal(planner.getStats().blocked_host_count, 1);
});

test('source planner avoids manufacturer category hubs without model signal in broad mode', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Logitech', model: 'G Pro X Superlight 2' },
      productId: 'mouse-logitech-g-pro-x-superlight-2'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      manufacturerBroadDiscovery: true
    }),
    makeCategoryConfig()
  );

  const categoryHub = new URL('https://manufacturer.com/en-us/shop/c/gaming-mice');
  const productLike = new URL('https://manufacturer.com/en-us/products/gaming-mice/pro-x-superlight-2.html');
  assert.equal(planner.isRelevantDiscoveredUrl(categoryHub, { manufacturerContext: true }), false);
  assert.equal(planner.isRelevantDiscoveredUrl(productLike, { manufacturerContext: true }), true);
});

test('source planner prioritizes manufacturer product pages over generic search URLs', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Basilisk V3 35k' },
      productId: 'mouse-razer-basilisk-v3-35k'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer' }],
      denylist: []
    }
  );

  planner.enqueue('https://razer.com/search?q=Razer%20Basilisk%20V3%2035k');
  planner.enqueue('https://razer.com/gaming-mice/razer-basilisk-v3-35k');

  const first = planner.next();
  const second = planner.next();

  assert.equal(first.url, 'https://razer.com/gaming-mice/razer-basilisk-v3-35k');
  assert.equal(second.url, 'https://razer.com/search?q=Razer%20Basilisk%20V3%2035k');
});

test('source planner prioritizes canonical manufacturer category pages ahead of guessed product paths', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  planner.enqueue('https://razer.com/product/viper-v3-pro');
  planner.enqueue('https://razer.com/products/viper-v3-pro');
  planner.enqueue('https://razer.com/gaming-mice/viper-v3-pro');
  planner.enqueue('https://www.razer.com/gaming-mice/razer-viper-v3-pro');

  const first = planner.next();
  const second = planner.next();

  assert.equal(first.url, 'https://www.razer.com/gaming-mice/razer-viper-v3-pro');
  assert.equal(second.url, 'https://razer.com/gaming-mice/viper-v3-pro');
});

test('source planner rejects unbranded follow-up URLs on brand-prefixed manufacturer hosts', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  const rejectedUrls = [
    'https://razer.com/gaming-mice/viper-v3-pro',
    'https://razer.com/support/viper-v3-pro',
    'https://razer.com/manual/viper-v3-pro',
    'https://razer.com/specs/viper-v3-pro',
    'https://razer.com/product/viper-v3-pro',
    'https://razer.com/products/viper-v3-pro'
  ];

  for (const url of rejectedUrls) {
    assert.equal(
      planner.isRelevantDiscoveredUrl(new URL(url), { manufacturerContext: true }),
      false,
      `expected unbranded follow-up URL to be rejected: ${url}`
    );
  }
});

test('source planner keeps branded follow-up URLs on brand-prefixed manufacturer hosts', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({ manufacturerDeepResearchEnabled: false, fetchCandidateSources: false }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  const acceptedUrls = [
    'https://razer.com/gaming-mice/razer-viper-v3-pro',
    'https://razer.com/support/razer-viper-v3-pro',
    'https://razer.com/specs/razer-viper-v3-pro'
  ];

  for (const url of acceptedUrls) {
    assert.equal(
      planner.isRelevantDiscoveredUrl(new URL(url), { manufacturerContext: true }),
      true,
      `expected branded follow-up URL to remain eligible: ${url}`
    );
  }
});

test('source planner discoverFromHtml skips unbranded Razer follow-up links from manufacturer pages', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  planner.discoverFromHtml(
    'https://razer.com/gaming-mice/razer-viper-v3-pro',
    [
      '<a href="/support/viper-v3-pro">Dead support slug</a>',
      '<a href="/manual/viper-v3-pro">Dead manual slug</a>',
      '<a href="/specs/viper-v3-pro">Dead specs slug</a>',
      '<a href="/products/viper-v3-pro">Dead product slug</a>',
      '<a href="/support/razer-viper-v3-pro">Branded support</a>',
      '<a href="/gaming-mice/razer-viper-v3-pro">Canonical product</a>'
    ].join('\n')
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(seenUrls.includes('https://razer.com/support/viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/manual/viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/specs/viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/products/viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/support/razer-viper-v3-pro'), true);
  assert.equal(seenUrls.includes('https://razer.com/gaming-mice/razer-viper-v3-pro'), false);
});

test('source planner discoverFromHtml skips locale-variant copies of the same manufacturer product page', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  planner.discoverFromHtml(
    'https://razer.com/gaming-mice/razer-viper-v3-pro',
    [
      '<a href="/au-en/gaming-mice/razer-viper-v3-pro">AU locale duplicate</a>',
      '<a href="/hk-en/gaming-mice/razer-viper-v3-pro">HK locale duplicate</a>',
      '<a href="/mena-ar/gaming-mice/razer-viper-v3-pro">MENA Arabic locale duplicate</a>',
      '<a href="/latam-es/gaming-mice/razer-viper-v3-pro">LATAM Spanish locale duplicate</a>',
      '<a href="/mena-en/gaming-mice/razer-viper-v3-pro">MENA English locale duplicate</a>',
      '<a href="/support/razer-viper-v3-pro">Branded support</a>'
    ].join('\n')
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(seenUrls.includes('https://razer.com/au-en/gaming-mice/razer-viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/hk-en/gaming-mice/razer-viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/mena-ar/gaming-mice/razer-viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/latam-es/gaming-mice/razer-viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/mena-en/gaming-mice/razer-viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/support/razer-viper-v3-pro'), true);
});

test('source planner discoverFromHtml skips sibling manufacturer variants for a locked product page', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  planner.discoverFromHtml(
    'https://razer.com/gaming-mice/razer-viper-v3-pro',
    [
      '<a href="/gaming-mice/razer-viper-v3-pro-faker-edition">Faker edition</a>',
      '<a href="/gaming-mice/razer-viper-v3-pro-se">SE edition</a>',
      '<a href="/support/razer-viper-v3-pro">Branded support</a>'
    ].join('\n')
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(seenUrls.includes('https://razer.com/gaming-mice/razer-viper-v3-pro-faker-edition'), false);
  assert.equal(seenUrls.includes('https://razer.com/gaming-mice/razer-viper-v3-pro-se'), false);
  assert.equal(seenUrls.includes('https://razer.com/support/razer-viper-v3-pro'), true);
});

test('source planner discoverFromHtml skips prefixed and bundle sibling slugs for a locked manufacturer product page', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  planner.discoverFromHtml(
    'https://razer.com/gaming-mice/razer-viper-v3-pro',
    [
      '<a href="/gaming-mice/counter-strike-2-razer-viper-v3-pro">Counter-Strike 2 sibling</a>',
      '<a href="/gaming-mice/counter-strike-2-razer-viper-v3-pro-gigantus-v2-bundle">Bundle sibling</a>',
      '<a href="/gaming-mice/razer-viper-v3-pro/RZHB-251028-01">Canonical SKU child</a>'
    ].join('\n')
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(seenUrls.includes('https://razer.com/gaming-mice/counter-strike-2-razer-viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/gaming-mice/counter-strike-2-razer-viper-v3-pro-gigantus-v2-bundle'), false);
  assert.equal(seenUrls.includes('https://razer.com/gaming-mice/razer-viper-v3-pro/RZHB-251028-01'), true);
});

test('source planner discoverFromHtml skips canonical self links and sitemap pages for locked manufacturer products', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [{ host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  planner.discoverFromHtml(
    'https://razer.com/gaming-mice/razer-viper-v3-pro',
    [
      '<a href="https://www.razer.com/gaming-mice/razer-viper-v3-pro">Canonical self link</a>',
      '<a href="/sitemap">Footer sitemap</a>',
      '<a href="/support/razer-viper-v3-pro">Branded support</a>'
    ].join('\n')
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(seenUrls.includes('https://www.razer.com/gaming-mice/razer-viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/sitemap'), false);
  assert.equal(seenUrls.includes('https://razer.com/support/razer-viper-v3-pro'), true);
});

test('source planner discoverFromHtml skips review blog articles even when the locked model appears in the slug', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [
        { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
        { host: 'prosettings.net', tierName: 'review', role: 'review', tier: 2 }
      ],
      denylist: []
    }
  );

  planner.discoverFromHtml(
    'https://razer.com/gaming-mice/razer-viper-v3-pro',
    [
      '<a href="https://prosettings.net/blog/the-rise-of-the-razer-viper-v3-pro">ProSettings blog</a>',
      '<a href="/support/razer-viper-v3-pro">Branded support</a>'
    ].join('\n')
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(seenUrls.includes('https://prosettings.net/blog/the-rise-of-the-razer-viper-v3-pro'), false);
  assert.equal(seenUrls.includes('https://razer.com/support/razer-viper-v3-pro'), true);
});

test('source planner prioritizes explicit support spec seed URLs ahead of guessed manufacturer deep seeds', () => {
  const seedUrl = 'https://support.logi.com/hc/en-ch/articles/15235304069783-Specification-G-PRO-X-Superlight-2-Lightspeed-Gaming-Mouse';
  const planner = new SourcePlanner(
    {
      seedUrls: [seedUrl],
      preferredSources: {},
      identityLock: { brand: 'Logitech G', model: 'PRO X SUPERLIGHT 2' },
      productId: 'mouse-logitech-g-pro-x-superlight-2'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: true,
      manufacturerSeedSearchUrls: true,
      fetchCandidateSources: false
    }),
    {
      sourceHosts: [{ host: 'logitechg.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  const first = planner.next();

  assert.equal(first.url, seedUrl);
});

test('source planner keeps explicit support seeds ahead of adapter search seeds', () => {
  const explicitSeedUrl = 'https://support.logi.com/hc/en-ch/articles/15235304069783-Specification-G-PRO-X-Superlight-2-Lightspeed-Gaming-Mouse';
  const adapterSeedUrl = 'https://www.techpowerup.com/search/?q=Logitech%20G%20PRO%20X%20SUPERLIGHT%202';
  const planner = new SourcePlanner(
    {
      seedUrls: [explicitSeedUrl],
      preferredSources: {},
      identityLock: { brand: 'Logitech G', model: 'PRO X SUPERLIGHT 2' },
      productId: 'mouse-logitech-g-pro-x-superlight-2'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false
    }),
    {
      sourceHosts: [{ host: 'logitechg.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  planner.enqueue(adapterSeedUrl, 'adapter_seed', { forceApproved: true, forceBrandBypass: false });
  const first = planner.next();

  assert.equal(first.url, explicitSeedUrl);
});

test('source planner keeps explicit support seeds even when manufacturer reserve exceeds max urls', () => {
  const explicitSeedUrl = 'https://support.logi.com/hc/en-ch/articles/15235304069783-Specification-G-PRO-X-Superlight-2-Lightspeed-Gaming-Mouse';
  const planner = new SourcePlanner(
    {
      seedUrls: [explicitSeedUrl],
      preferredSources: {},
      identityLock: { brand: 'Logitech G', model: 'PRO X SUPERLIGHT 2' },
      productId: 'mouse-logitech-g-pro-x-superlight-2'
    },
    makeConfig({
      maxUrlsPerProduct: 4,
      manufacturerReserveUrls: 10,
      manufacturerDeepResearchEnabled: true,
      manufacturerSeedSearchUrls: true,
      fetchCandidateSources: false
    }),
    {
      sourceHosts: [{ host: 'logitechg.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  const first = planner.next();

  assert.equal(first.url, explicitSeedUrl);
});

test('source planner suppresses guessed manufacturer deep seeds when an explicit support seed already covers that host', () => {
  const explicitSeedUrl = 'https://support.logi.com/hc/en-ch/articles/15235304069783-Specification-G-PRO-X-Superlight-2-Lightspeed-Gaming-Mouse';
  const planner = new SourcePlanner(
    {
      seedUrls: [explicitSeedUrl],
      preferredSources: {},
      identityLock: { brand: 'Logitech G', model: 'PRO X SUPERLIGHT 2' },
      productId: 'mouse-logitech-g-pro-x-superlight-2'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: true,
      manufacturerSeedSearchUrls: true,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [{ host: 'logitechg.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  const seenUrls = [];
  for (let index = 0; index < 12; index += 1) {
    const next = planner.next();
    if (!next) {
      break;
    }
    seenUrls.push(next.url);
  }

  assert.equal(seenUrls[0], explicitSeedUrl);
  assert.equal(
    seenUrls.some((url) => url.includes('logitechg.com/gaming-mice/pro-x-superlight-2')),
    false,
    `guessed category path should be suppressed once explicit host seed exists: ${JSON.stringify(seenUrls)}`
  );
  assert.equal(
    seenUrls.some((url) => url.includes('logitechg.com/support/pro-x-superlight-2')),
    false,
    `guessed support slug path should be suppressed once explicit host seed exists: ${JSON.stringify(seenUrls)}`
  );
  assert.equal(
    seenUrls.some((url) => url.includes('logitechg.com/search?q=')),
    false,
    `manufacturer search surfaces should be suppressed once explicit host seed exists: ${JSON.stringify(seenUrls)}`
  );
  assert.equal(
    seenUrls.some((url) => url.includes('logitechg.com/search?query=')),
    false,
    `manufacturer query surfaces should be suppressed once explicit host seed exists: ${JSON.stringify(seenUrls)}`
  );
});

test('source planner manufacturer deep seeds keep robots/search surfaces but skip guessed direct product slugs', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Logitech G', model: 'PRO X SUPERLIGHT 2' },
      productId: 'mouse-logitech-g-pro-x-superlight-2'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: true,
      manufacturerSeedSearchUrls: true,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [{ host: 'logitechg.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  const seenUrls = [];
  for (let index = 0; index < 10; index += 1) {
    const next = planner.next();
    if (!next) {
      break;
    }
    seenUrls.push(next.url);
  }

  assert.equal(
    seenUrls.includes('https://logitechg.com/robots.txt'),
    true,
    `expected manufacturer deep seed to retain robots discovery: ${JSON.stringify(seenUrls)}`
  );
  assert.equal(
    seenUrls.some((url) => url.includes('logitechg.com/search?q=')),
    true,
    `expected manufacturer deep seed to retain search surfaces: ${JSON.stringify(seenUrls)}`
  );
  assert.equal(
    seenUrls.some((url) => url.includes('logitechg.com/gaming-mice/pro-x-superlight-2')),
    false,
    `guessed direct manufacturer slug should not be seeded: ${JSON.stringify(seenUrls)}`
  );
});

test('source planner rejects sibling and generic manufacturer resume seeds while keeping exact locked-model resume seeds', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [
        { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
        { host: 'api-p1.phoenix.razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }
      ],
      denylist: []
    }
  );

  const exactLocaleProductUrl = 'https://www.razer.com/latam-es/gaming-mice/razer-viper-v3-pro';
  const siblingCategoryProductUrl = 'https://www.razer.com/gaming-mice/razer-viper-v3-hyperspeed';
  const siblingEditionProductUrl = 'https://www.razer.com/gaming-mice/razer-viper-v3-pro-faker-edition';
  const exactVariantApiUrl =
    'https://api-p1.phoenix.razer.com/rest/v2/razerUs/users/anonymous/variant/products/Viper-V3-Pro-Base';
  const siblingVariantApiUrl =
    'https://api-p1.phoenix.razer.com/rest/v2/razerUs/users/anonymous/variant/products/Viper-V3-HyperSpeed-Base';
  const genericProductEndpointUrl =
    'https://api-p1.phoenix.razer.com/rest/v2/razerUs/products/productSKUPrefix';

  assert.equal(
    planner.enqueue(exactLocaleProductUrl, 'resume_pending_seed', { forceApproved: true, forceBrandBypass: false }),
    true
  );
  assert.equal(
    planner.enqueue(siblingCategoryProductUrl, 'resume_pending_seed', { forceApproved: true, forceBrandBypass: false }),
    false
  );
  assert.equal(
    planner.enqueue(siblingEditionProductUrl, 'resume_pending_seed', { forceApproved: true, forceBrandBypass: false }),
    false
  );
  assert.equal(
    planner.enqueue(exactVariantApiUrl, 'resume_pending_seed', { forceApproved: true, forceBrandBypass: false }),
    true
  );
  assert.equal(
    planner.enqueue(siblingVariantApiUrl, 'resume_pending_seed', { forceApproved: true, forceBrandBypass: false }),
    false
  );
  assert.equal(
    planner.enqueue(genericProductEndpointUrl, 'resume_pending_seed', { forceApproved: true, forceBrandBypass: false }),
    false
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(seenUrls.includes(exactLocaleProductUrl), true);
  assert.equal(seenUrls.includes(exactVariantApiUrl), true);
  assert.equal(seenUrls.includes(siblingCategoryProductUrl), false);
  assert.equal(seenUrls.includes(siblingEditionProductUrl), false);
  assert.equal(seenUrls.includes(siblingVariantApiUrl), false);
  assert.equal(seenUrls.includes(genericProductEndpointUrl), false);
});

test('source planner rejects locale, sibling, and generic manufacturer sitemap seeds for locked runs', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig({
      manufacturerDeepResearchEnabled: false,
      fetchCandidateSources: false,
      maxManufacturerPagesPerDomain: 20,
      maxManufacturerUrlsPerProduct: 20
    }),
    {
      sourceHosts: [
        { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
        { host: 'api-p1.phoenix.razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }
      ],
      denylist: []
    }
  );

  const exactCanonicalProductUrl = 'https://www.razer.com/gaming-mice/razer-viper-v3-pro';
  const exactLocaleProductUrl = 'https://www.razer.com/mena-ar/gaming-mice/razer-viper-v3-pro';
  const exactLocaleSkuChildUrl = 'https://www.razer.com/mena-ar/gaming-mice/razer-viper-v3-pro/RZ01-05120100-R3G1';
  const siblingLocaleProductUrl = 'https://www.razer.com/mena-ar/gaming-mice/razer-viper-v3-hyperspeed';
  const exactVariantApiUrl =
    'https://api-p1.phoenix.razer.com/rest/v2/razerUs/users/anonymous/variant/products/Viper-V3-Pro-Base';
  const siblingVariantApiUrl =
    'https://api-p1.phoenix.razer.com/rest/v2/razerUs/users/anonymous/variant/products/Viper-V3-HyperSpeed-Base';
  const genericProductEndpointUrl =
    'https://api-p1.phoenix.razer.com/rest/v2/razerUs/products/productSKUPrefix';

  assert.equal(
    planner.enqueue(exactCanonicalProductUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true, forceBrandBypass: false }),
    true
  );
  assert.equal(
    planner.enqueue(exactLocaleProductUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true, forceBrandBypass: false }),
    false
  );
  assert.equal(
    planner.enqueue(exactLocaleSkuChildUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true, forceBrandBypass: false }),
    false
  );
  assert.equal(
    planner.enqueue(siblingLocaleProductUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true, forceBrandBypass: false }),
    false
  );
  assert.equal(
    planner.enqueue(exactVariantApiUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true, forceBrandBypass: false }),
    true
  );
  assert.equal(
    planner.enqueue(siblingVariantApiUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true, forceBrandBypass: false }),
    false
  );
  assert.equal(
    planner.enqueue(genericProductEndpointUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true, forceBrandBypass: false }),
    false
  );

  const seenUrls = [];
  while (planner.hasNext()) {
    seenUrls.push(planner.next().url);
  }

  assert.equal(seenUrls.includes(exactCanonicalProductUrl), true);
  assert.equal(seenUrls.includes(exactLocaleProductUrl), false);
  assert.equal(seenUrls.includes(exactLocaleSkuChildUrl), false);
  assert.equal(seenUrls.includes(siblingLocaleProductUrl), false);
  assert.equal(seenUrls.includes(exactVariantApiUrl), true);
  assert.equal(seenUrls.includes(siblingVariantApiUrl), false);
  assert.equal(seenUrls.includes(genericProductEndpointUrl), false);
});

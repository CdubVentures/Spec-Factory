import test from 'node:test';
import assert from 'node:assert/strict';
import { SourcePlanner } from '../sourcePlanner.js';

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

// WHY: Simulates Stage 02 brand resolver output for tests that need brand-aware behavior.
function applyBrandResolution(planner, brand) {
  const slug = String(brand || '').toLowerCase().replace(/\s+/g, '-');
  planner.updateBrandHints({
    officialDomain: `${slug}.com`,
    aliases: [slug],
    supportDomain: null,
  });
}

function makeConfig(overrides = {}) {
  return {
    maxPagesPerDomain: 2,
    ...overrides
  };
}

test('source planner still enqueues candidate domains after candidate crawl knob retirement', () => {
  const planner = new SourcePlanner(
    { seedUrls: [], preferredSources: {} },
    makeConfig(),
    makeCategoryConfig()
  );

  planner.enqueue('https://manufacturer.com/p/one');
  planner.enqueue('https://unknown.example/specs');

  const first = planner.next();
  const second = planner.next();
  assert.equal(first.host, 'manufacturer.com');
  assert.equal(first.candidateSource, false);
  assert.equal(second.host, 'unknown.example');
  assert.equal(second.candidateSource, true);
  assert.equal(planner.hasNext(), false);
});

test('source planner prioritizes manufacturer queue ahead of same-tier lab pages', () => {
  const planner = new SourcePlanner(
    { seedUrls: [], preferredSources: {} },
    makeConfig(),
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

test('source planner de-duplicates manufacturer queue URLs', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Acme', model: 'M100' },
      productId: 'mouse-acme-m100'
    },
    makeConfig(),
    makeCategoryConfig()
  );

  planner.enqueue('https://manufacturer.com/product/m100');
  planner.enqueue('https://manufacturer.com/product/m100');

  const urls = [];
  while (planner.hasNext()) {
    urls.push(planner.next().url);
  }

  const manufacturerUrls = urls.filter((u) => u.includes('manufacturer.com/product/'));
  assert.deepEqual(manufacturerUrls, ['https://manufacturer.com/product/m100']);
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
    makeConfig(),
    categoryConfig
  );
  planner.updateBrandHints({
    officialDomain: 'logitechg.com',
    aliases: ['logitech', 'logi', 'logitechg'],
    supportDomain: null,
  });

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
    makeConfig(),
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
    makeConfig(),
    categoryConfig
  );
  planner.updateBrandHints({
    officialDomain: 'logitechg.com',
    aliases: ['logitech', 'logi', 'logitechg'],
    supportDomain: null,
  });

  planner.seed(['https://razer.com/specs/g-pro-x-superlight-2']);
  const stats = planner.getStats();
  // The brand manufacturer host set should only include logitechg.com
  assert.equal(stats.brand_manufacturer_hosts.includes('logitechg.com'), true);
  assert.equal(stats.brand_manufacturer_hosts.includes('razer.com'), false);
});

test('source planner can block a mismatched manufacturer host and remove queued URLs', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Acme', model: 'M100' },
      productId: 'mouse-acme-m100'
    },
    makeConfig(),
    makeCategoryConfig()
  );

  planner.enqueue('https://manufacturer.com/product/m100');
  planner.enqueue('https://manufacturer.com/support/m100');
  const removed = planner.blockHost('manufacturer.com', 'brand_mismatch');

  assert.equal(removed >= 2, true);
  assert.equal(planner.getStats().blocked_host_count, 1);
  // After blocking, only auto-seeded URLs from non-blocked hosts may remain
  while (planner.hasNext()) {
    const next = planner.next();
    assert.notEqual(next.host, 'manufacturer.com');
  }
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
    makeConfig(),
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
    makeConfig(),
    {
      sourceHosts: [{ host: 'logitechg.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
      denylist: []
    }
  );

  planner.enqueue(adapterSeedUrl, 'adapter_seed', { forceApproved: true });
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
    makeConfig(),
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
    makeConfig(),
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

test('source planner rejects sibling and generic manufacturer resume seeds while keeping exact locked-model resume seeds', () => {
  const planner = new SourcePlanner(
    {
      seedUrls: [],
      preferredSources: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      productId: 'mouse-razer-viper-v3-pro'
    },
    makeConfig(),
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
    planner.enqueue(exactLocaleProductUrl, 'resume_pending_seed', { forceApproved: true }),
    true
  );
  // WHY: With maxPagesPerDomain=2, razer.com has robots.txt auto-seed + exactLocaleProductUrl,
  // so additional razer.com URLs hit the domain cap and are rejected.
  assert.equal(
    planner.enqueue(siblingCategoryProductUrl, 'resume_pending_seed', { forceApproved: true }),
    false
  );
  assert.equal(
    planner.enqueue(siblingEditionProductUrl, 'resume_pending_seed', { forceApproved: true }),
    false
  );
  assert.equal(
    planner.enqueue(exactVariantApiUrl, 'resume_pending_seed', { forceApproved: true }),
    true
  );
  // WHY: api-p1.phoenix.razer.com has no auto-seeded robots.txt, so first URL accepted,
  // but domain cap of 2 allows the first, and the second hits the cap.
  assert.equal(
    planner.enqueue(siblingVariantApiUrl, 'resume_pending_seed', { forceApproved: true }),
    false
  );
  assert.equal(
    planner.enqueue(genericProductEndpointUrl, 'resume_pending_seed', { forceApproved: true }),
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
    makeConfig(),
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
    planner.enqueue(exactCanonicalProductUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true }),
    true
  );
  // WHY: With maxPagesPerDomain=2, razer.com already has robots.txt auto-seed + exactCanonicalProductUrl,
  // so all additional razer.com URLs hit the domain cap.
  assert.equal(
    planner.enqueue(exactLocaleProductUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true }),
    false
  );
  assert.equal(
    planner.enqueue(exactLocaleSkuChildUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true }),
    false
  );
  assert.equal(
    planner.enqueue(siblingLocaleProductUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true }),
    false
  );
  assert.equal(
    planner.enqueue(exactVariantApiUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true }),
    true
  );
  assert.equal(
    planner.enqueue(siblingVariantApiUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true }),
    false
  );
  assert.equal(
    planner.enqueue(genericProductEndpointUrl, 'sitemap:https://www.razer.com/sitemap-products.xml', { forceApproved: true }),
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

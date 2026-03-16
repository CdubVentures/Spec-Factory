import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcesPath = path.resolve('category_authority/mouse/sources.json');
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));

// ---------------------------------------------------------------------------
// PP-01: Per-host delay from registry (crawl_config.rate_limit_ms)
// ---------------------------------------------------------------------------
describe('PP-01: sources.json has per-host rate_limit_ms', () => {
  it('rtings.com has rate_limit_ms defined', () => {
    const entry = sources.sources.rtings_com;
    assert.ok(entry, 'rtings_com entry exists');
    assert.ok(entry.crawl_config.rate_limit_ms > 0, 'rate_limit_ms is positive');
  });

  it('amazon.com has rate_limit_ms defined', () => {
    const entry = sources.sources.amazon_com;
    assert.ok(entry, 'amazon_com entry exists');
    assert.ok(entry.crawl_config.rate_limit_ms > 0, 'rate_limit_ms is positive');
  });

  it('bestbuy.com has rate_limit_ms defined', () => {
    const entry = sources.sources.bestbuy_com;
    assert.ok(entry, 'bestbuy_com entry exists');
    assert.ok(entry.crawl_config.rate_limit_ms > 0, 'rate_limit_ms is positive');
  });
});

// ---------------------------------------------------------------------------
// PP-02: Default delay exists in manufacturer_defaults
// ---------------------------------------------------------------------------
describe('PP-02: Default delay when no per-host config', () => {
  it('manufacturer_defaults has rate_limit_ms', () => {
    assert.ok(sources.manufacturer_defaults.rate_limit_ms > 0);
  });

  it('manufacturer_defaults rate_limit_ms is at least 1500', () => {
    assert.ok(sources.manufacturer_defaults.rate_limit_ms >= 1500);
  });
});

// ---------------------------------------------------------------------------
// PP-03: All manufacturer crawl overrides have rate_limit_ms >= 3000
// ---------------------------------------------------------------------------
describe('PP-03: Manufacturer hosts rate_limit_ms >= 3000', () => {
  it('manufacturer_defaults rate_limit_ms >= 3000', () => {
    assert.ok(
      sources.manufacturer_defaults.rate_limit_ms >= 3000,
      `manufacturer_defaults.rate_limit_ms is ${sources.manufacturer_defaults.rate_limit_ms}, expected >= 3000`
    );
  });

  for (const [host, config] of Object.entries(sources.manufacturer_crawl_overrides)) {
    it(`${host} rate_limit_ms >= 3000`, () => {
      assert.ok(
        config.rate_limit_ms >= 3000,
        `${host} rate_limit_ms is ${config.rate_limit_ms}, expected >= 3000`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// PP-04: Retailer hosts have rate_limit_ms >= 4000
// ---------------------------------------------------------------------------
describe('PP-04: Retailer hosts rate_limit_ms >= 4000', () => {
  const retailerKeys = Object.keys(sources.sources).filter((key) => {
    return sources.sources[key].tier === 'tier3_retailer';
  });

  it('at least one retailer source exists', () => {
    assert.ok(retailerKeys.length > 0);
  });

  for (const key of retailerKeys) {
    it(`${key} rate_limit_ms >= 4000`, () => {
      const entry = sources.sources[key];
      assert.ok(
        entry.crawl_config.rate_limit_ms >= 4000,
        `${key} rate_limit_ms is ${entry.crawl_config.rate_limit_ms}, expected >= 4000`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// PP-05: Manufacturer overrides all use method=playwright
// ---------------------------------------------------------------------------
describe('PP-05: Manufacturer overrides use Playwright', () => {
  for (const [host, config] of Object.entries(sources.manufacturer_crawl_overrides)) {
    it(`${host} method is playwright`, () => {
      assert.equal(config.method, 'playwright');
    });
  }
});

// ---------------------------------------------------------------------------
// RJ: requires_js flags on sources that need JS
// ---------------------------------------------------------------------------
describe('RJ: requires_js flags set correctly in sources.json', () => {
  it('amazon_com has requires_js=true', () => {
    assert.equal(sources.sources.amazon_com.requires_js, true);
  });

  it('bestbuy_com has requires_js=true', () => {
    assert.equal(sources.sources.bestbuy_com.requires_js, true);
  });

  it('rtings_com does NOT have requires_js=true (static works)', () => {
    assert.ok(sources.sources.rtings_com.requires_js !== true);
  });

  it('techpowerup_com does NOT have requires_js=true (static works)', () => {
    assert.ok(sources.sources.techpowerup_com.requires_js !== true);
  });
});

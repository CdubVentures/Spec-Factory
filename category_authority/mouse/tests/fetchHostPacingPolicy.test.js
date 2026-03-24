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

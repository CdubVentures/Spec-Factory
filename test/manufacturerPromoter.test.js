// WHY: Test the pure promotion functions that convert brand resolver output
// into first-class source entries with deterministic sourceIds.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  sourceIdFromHost,
  resolveManufacturerCrawlConfig,
  promoteManufacturerHost,
  promoteFromBrandResolution,
  MANUFACTURER_CRAWL_DEFAULTS,
} from '../src/features/indexing/sources/manufacturerPromoter.js';

const MOCK_SOURCES_DATA = {
  category: 'mouse',
  version: '1.0.0',
  approved: { manufacturer: [], lab: ['rtings.com'], database: [], retailer: [] },
  denylist: [],
  manufacturer_defaults: {
    method: 'http',
    rate_limit_ms: 2000,
    timeout_ms: 12000,
    robots_txt_compliant: true,
  },
  manufacturer_crawl_overrides: {
    'razer.com': { method: 'playwright', rate_limit_ms: 2000, timeout_ms: 15000 },
    'corsair.com': { method: 'playwright', rate_limit_ms: 2000, timeout_ms: 15000 },
  },
  sources: {
    rtings_com: {
      display_name: 'RTINGS',
      tier: 'tier2_lab',
      authority: 'instrumented',
      base_url: 'https://www.rtings.com',
      crawl_config: { method: 'playwright', rate_limit_ms: 3000, timeout_ms: 20000, robots_txt_compliant: true },
    },
  },
};

describe('sourceIdFromHost', () => {
  const cases = [
    ['razer.com', 'brand_razer_com'],
    ['logitechg.com', 'brand_logitechg_com'],
    ['zowie.benq.com', 'brand_zowie_benq_com'],
    ['duckychannel.com.tw', 'brand_duckychannel_com_tw'],
    ['pulsar.gg', 'brand_pulsar_gg'],
  ];
  for (const [input, expected] of cases) {
    it(`${input} -> ${expected}`, () => {
      assert.equal(sourceIdFromHost(input), expected);
    });
  }
});

describe('MANUFACTURER_CRAWL_DEFAULTS', () => {
  it('has http method and standard timings', () => {
    assert.equal(MANUFACTURER_CRAWL_DEFAULTS.method, 'http');
    assert.equal(MANUFACTURER_CRAWL_DEFAULTS.rate_limit_ms, 2000);
    assert.equal(MANUFACTURER_CRAWL_DEFAULTS.timeout_ms, 12000);
    assert.equal(MANUFACTURER_CRAWL_DEFAULTS.robots_txt_compliant, true);
  });
});

describe('resolveManufacturerCrawlConfig', () => {
  it('returns override config when host is in manufacturer_crawl_overrides', () => {
    const config = resolveManufacturerCrawlConfig('razer.com', MOCK_SOURCES_DATA);
    assert.equal(config.method, 'playwright');
    assert.equal(config.timeout_ms, 15000);
    assert.equal(config.robots_txt_compliant, true);
  });

  it('returns manufacturer_defaults when host is not in overrides', () => {
    const config = resolveManufacturerCrawlConfig('pulsar.gg', MOCK_SOURCES_DATA);
    assert.equal(config.method, 'http');
    assert.equal(config.rate_limit_ms, 2000);
    assert.equal(config.timeout_ms, 12000);
  });

  it('returns hardcoded fallback when manufacturer_defaults is absent', () => {
    const noDefaults = { ...MOCK_SOURCES_DATA };
    delete noDefaults.manufacturer_defaults;
    const config = resolveManufacturerCrawlConfig('pulsar.gg', noDefaults);
    assert.equal(config.method, 'http');
    assert.equal(config.rate_limit_ms, 2000);
    assert.equal(config.timeout_ms, 12000);
    assert.equal(config.robots_txt_compliant, true);
  });

  it('merges robots_txt_compliant into override from defaults', () => {
    const config = resolveManufacturerCrawlConfig('corsair.com', MOCK_SOURCES_DATA);
    assert.equal(config.robots_txt_compliant, true);
  });
});

describe('promoteManufacturerHost', () => {
  it('returns a full source entry with correct shape', () => {
    const entry = promoteManufacturerHost('pulsar.gg', MOCK_SOURCES_DATA);
    assert.equal(entry.tier, 'tier1_manufacturer');
    assert.equal(entry.authority, 'authoritative');
    assert.equal(entry.crawl_config.method, 'http');
    assert.equal(entry.discovery.method, 'search_first');
    assert.equal(entry.discovery.source_type, 'manufacturer');
    assert.equal(entry.discovery.priority, 70);
    assert.equal(entry.discovery.enabled, true);
    assert.equal(entry.field_coverage, null);
    assert.ok(entry.base_url.includes('pulsar.gg'));
    assert.ok(entry.display_name);
  });

  it('uses playwright override when host matches', () => {
    const entry = promoteManufacturerHost('razer.com', MOCK_SOURCES_DATA);
    assert.equal(entry.crawl_config.method, 'playwright');
    assert.equal(entry.crawl_config.timeout_ms, 15000);
  });

  it('generates deterministic sourceId', () => {
    const entry = promoteManufacturerHost('razer.com', MOCK_SOURCES_DATA);
    assert.equal(entry._sourceId, 'brand_razer_com');
  });

  it('accepts optional brandName for display_name', () => {
    const entry = promoteManufacturerHost('razer.com', MOCK_SOURCES_DATA, { brandName: 'Razer' });
    assert.equal(entry.display_name, 'Razer Official');
  });

  it('falls back to host-derived display_name when brandName absent', () => {
    const entry = promoteManufacturerHost('logitechg.com', MOCK_SOURCES_DATA);
    assert.ok(entry.display_name.length > 0);
  });
});

describe('promoteFromBrandResolution', () => {
  it('promotes officialDomain into Map', () => {
    const brandResolution = {
      officialDomain: 'pulsar.gg',
      aliases: ['pulsar.gg'],
      supportDomain: '',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA);
    assert.ok(promoted instanceof Map);
    assert.ok(promoted.has('pulsar.gg'));
    assert.equal(promoted.get('pulsar.gg').tier, 'tier1_manufacturer');
  });

  it('does NOT promote aliases into Map', () => {
    const brandResolution = {
      officialDomain: 'pulsar.gg',
      aliases: ['pulsar.gg', 'pulsargaming.com'],
      supportDomain: '',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA);
    assert.ok(promoted.has('pulsar.gg'), 'officialDomain should be promoted');
    assert.ok(!promoted.has('pulsargaming.com'), 'alias should NOT be promoted');
    assert.equal(promoted.size, 1, 'only officialDomain promoted');
  });

  it('promotes supportDomain when present', () => {
    const brandResolution = {
      officialDomain: 'pulsar.gg',
      aliases: ['pulsargaming.com'],
      supportDomain: 'support.pulsar.gg',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA);
    assert.ok(promoted.has('pulsar.gg'), 'officialDomain promoted');
    assert.ok(promoted.has('support.pulsar.gg'), 'supportDomain promoted');
    assert.ok(!promoted.has('pulsargaming.com'), 'alias NOT promoted');
    assert.equal(promoted.size, 2);
  });

  it('does not promote supportDomain when already in sources', () => {
    const brandResolution = {
      officialDomain: 'pulsar.gg',
      aliases: [],
      supportDomain: 'rtings.com',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA);
    assert.ok(promoted.has('pulsar.gg'));
    assert.ok(!promoted.has('rtings.com'), 'supportDomain already in sources, not promoted');
    assert.equal(promoted.size, 1);
  });

  it('ignores aliases completely — only officialDomain + supportDomain promoted', () => {
    const brandResolution = {
      officialDomain: 'pulsar.gg',
      aliases: ['gpx2.com', 'pulsargaming.com', 'pulsar-esports.net'],
      supportDomain: 'help.pulsar.gg',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA);
    assert.ok(promoted.has('pulsar.gg'));
    assert.ok(promoted.has('help.pulsar.gg'));
    assert.ok(!promoted.has('gpx2.com'));
    assert.ok(!promoted.has('pulsargaming.com'));
    assert.ok(!promoted.has('pulsar-esports.net'));
    assert.equal(promoted.size, 2);
  });

  it('skips hosts already in sourcesData.sources', () => {
    const brandResolution = {
      officialDomain: 'rtings.com',
      aliases: ['rtings.com'],
      supportDomain: '',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA);
    assert.equal(promoted.size, 0);
  });

  it('returns empty Map for empty/null brandResolution', () => {
    assert.equal(promoteFromBrandResolution(null, MOCK_SOURCES_DATA).size, 0);
    assert.equal(promoteFromBrandResolution({}, MOCK_SOURCES_DATA).size, 0);
    assert.equal(
      promoteFromBrandResolution(
        { officialDomain: '', aliases: [], supportDomain: '', confidence: 0, reasoning: [] },
        MOCK_SOURCES_DATA
      ).size,
      0
    );
  });

  it('passes brandName from brandResolution context', () => {
    const brandResolution = {
      officialDomain: 'pulsar.gg',
      aliases: [],
      supportDomain: '',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA, { brandName: 'Pulsar' });
    assert.equal(promoted.get('pulsar.gg').display_name, 'Pulsar Official');
  });

  it('skips empty alias strings', () => {
    const brandResolution = {
      officialDomain: 'pulsar.gg',
      aliases: ['', null, 'pulsar.gg'],
      supportDomain: '',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA);
    assert.equal(promoted.size, 1);
  });
});

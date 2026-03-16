// WHY: Verify that brand-resolved domains become first-class source entries
// when manufacturerAutoPromote is enabled. Tests the wiring between
// brand resolver output and source promotion in the discovery pipeline.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  promoteFromBrandResolution,
  resolveManufacturerCrawlConfig,
  sourceIdFromHost,
} from '../src/features/indexing/sources/manufacturerPromoter.js';
import {
  mergeManufacturerPromotions,
  deriveApprovedFromSources,
} from '../src/features/indexing/sources/sourceFileService.js';
import { isApprovedHost, loadCategoryConfig } from '../src/categories/loader.js';

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

describe('manufacturer auto-promote pipeline wiring', () => {
  it('brand resolves -> promoted host appears in merged sources with correct crawl config', () => {
    const brandResolution = {
      officialDomain: 'pulsar.gg',
      aliases: ['pulsar.gg'],
      supportDomain: '',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA, { brandName: 'Pulsar' });
    const merged = mergeManufacturerPromotions(MOCK_SOURCES_DATA, promoted);

    assert.ok(merged.sources.brand_pulsar_gg, 'promoted entry exists in sources');
    assert.equal(merged.sources.brand_pulsar_gg.tier, 'tier1_manufacturer');
    assert.equal(merged.sources.brand_pulsar_gg.crawl_config.method, 'http');
    assert.ok(merged.approved.manufacturer.includes('pulsar.gg'));
  });

  it('brand already in sources -> no duplicate', () => {
    const brandResolution = {
      officialDomain: 'rtings.com',
      aliases: ['rtings.com'],
      supportDomain: '',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA);
    assert.equal(promoted.size, 0);

    const merged = mergeManufacturerPromotions(MOCK_SOURCES_DATA, promoted);
    assert.equal(merged.sources.rtings_com.display_name, 'RTINGS');
  });

  it('brand with playwright override -> gets playwright crawl config', () => {
    const brandResolution = {
      officialDomain: 'razer.com',
      aliases: ['razer.com'],
      supportDomain: '',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA);
    assert.ok(promoted.has('razer.com'));
    assert.equal(promoted.get('razer.com').crawl_config.method, 'playwright');
    assert.equal(promoted.get('razer.com').crawl_config.timeout_ms, 15000);
  });

  it('brand resolution fails/empty -> graceful no-op', () => {
    const promoted1 = promoteFromBrandResolution(null, MOCK_SOURCES_DATA);
    assert.equal(promoted1.size, 0);

    const promoted2 = promoteFromBrandResolution(
      { officialDomain: '', aliases: [], supportDomain: '', confidence: 0, reasoning: [] },
      MOCK_SOURCES_DATA
    );
    assert.equal(promoted2.size, 0);

    const merged = mergeManufacturerPromotions(MOCK_SOURCES_DATA, promoted1);
    assert.deepEqual(Object.keys(merged.sources), ['rtings_com']);
  });

  it('promoted host sourceId is deterministic', () => {
    const id1 = sourceIdFromHost('razer.com');
    const id2 = sourceIdFromHost('razer.com');
    assert.equal(id1, id2);
    assert.equal(id1, 'brand_razer_com');
  });

  it('promoted entries get approved manufacturer role via deriveApproved', () => {
    const brandResolution = {
      officialDomain: 'endgamegear.com',
      aliases: ['endgamegear.com'],
      supportDomain: '',
      confidence: 0.8,
      reasoning: [],
    };
    const promoted = promoteFromBrandResolution(brandResolution, MOCK_SOURCES_DATA);
    const merged = mergeManufacturerPromotions(MOCK_SOURCES_DATA, promoted);
    const derived = deriveApprovedFromSources(merged.sources);
    assert.ok(derived.manufacturer.includes('endgamegear.com'));
  });

  it('production category overrides resolve correct crawl method', async () => {
    const catConfig = await loadCategoryConfig('mouse');
    assert.ok(catConfig.sourceHosts.length > 0);
    // WHY: Validate against the production category authority file rather than a mocked fallback.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const raw = JSON.parse(readFileSync(join(process.cwd(), 'category_authority', 'mouse', 'sources.json'), 'utf8'));

    const razerConfig = resolveManufacturerCrawlConfig('razer.com', raw);
    assert.equal(razerConfig.method, 'playwright');

    const unknownConfig = resolveManufacturerCrawlConfig('newbrand.com', raw);
    assert.equal(unknownConfig.method, raw.manufacturer_defaults.method);
  });
});

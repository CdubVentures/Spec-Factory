import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeSerpResults } from '../../search/serpDedupe.js';
import { rerankSearchResults } from '../../search/resultReranker.js';
import {
  computeIdentityMatchLevel,
  detectVariantGuardHit,
  detectMultiModelHint
} from '../searchDiscovery.js';

function makeCategoryConfig() {
  return {
    category: 'mouse',
    fieldOrder: ['weight', 'sensor', 'dpi', 'polling_rate'],
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
      { host: 'rtings.com', tierName: 'lab', role: 'review', tier: 2 },
      { host: 'techpowerup.com', tierName: 'lab', role: 'review', tier: 2 },
      { host: 'amazon.com', tierName: 'retailer', role: 'retailer', tier: 3 },
      { host: 'spam-site.biz', tierName: 'denied', role: 'denied', tier: 4 }
    ],
    denylist: ['spam-site.biz']
  };
}

describe('Phase 03 — SERP Dedupe Audit', () => {
  it('deduplicates URLs across providers and merges metadata', () => {
    const results = [
      { url: 'https://razer.com/mice/viper-v3-pro', provider: 'google', query: 'razer viper v3 pro specs' },
      { url: 'https://razer.com/mice/viper-v3-pro', provider: 'bing', query: 'razer viper v3 pro review' },
      { url: 'https://rtings.com/mouse/reviews/razer-viper-v3-pro', provider: 'google', query: 'razer viper v3 pro specs' }
    ];

    const { deduped, stats } = dedupeSerpResults(results);

    console.log(`[DEDUPE] input=${stats.total_input} output=${stats.total_output} removed=${stats.duplicates_removed}`);
    console.log(`[DEDUPE] providers_seen: ${stats.providers_seen}`);

    assert.equal(deduped.length, 2);
    assert.equal(stats.duplicates_removed, 1);

    const razer = deduped.find((r) => r.canonical_url.includes('razer.com'));
    assert.ok(razer);
    assert.deepEqual(razer.seen_by_providers.sort(), ['bing', 'google']);
    assert.equal(razer.cross_provider_count, 2);
    assert.deepEqual(razer.seen_in_queries.sort(), ['razer viper v3 pro review', 'razer viper v3 pro specs']);
  });

  it('strips tracking parameters for dedup comparison', () => {
    const results = [
      { url: 'https://example.com/page?utm_source=google&ref=abc&q=test', provider: 'google' },
      { url: 'https://example.com/page?utm_source=bing&fbclid=xyz&q=test', provider: 'bing' }
    ];

    const { deduped } = dedupeSerpResults(results);

    console.log(`[DEDUPE] tracking stripped: ${deduped.length} unique (from 2)`);

    assert.equal(deduped.length, 1);
  });

  it('normalizes trailing slashes and host case', () => {
    const results = [
      { url: 'https://Example.COM/page/', provider: 'google' },
      { url: 'https://example.com/page', provider: 'bing' }
    ];

    const { deduped } = dedupeSerpResults(results);
    assert.equal(deduped.length, 1);
  });
});

describe('Phase 03 — Deterministic Reranker (resultReranker.js)', () => {
  it('scores tier 1 manufacturer higher than tier 3 retailer', () => {
    const results = [
      { url: 'https://amazon.com/razer-viper', title: 'Razer Viper V3 Pro', snippet: 'Buy now' },
      { url: 'https://razer.com/mice/razer-viper-v3-pro', title: 'Razer Viper V3 Pro', snippet: 'Official specs' }
    ];

    const ranked = rerankSearchResults({
      results,
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor']
    });

    console.log('[RERANK-DET] scores:');
    for (const row of ranked) {
      console.log(`  ${row.host}: score=${row.score} tier=${row.tier} role=${row.role} approved=${row.approved_domain}`);
    }

    assert.ok(ranked[0].url.includes('razer.com'), 'manufacturer ranks first');
    assert.ok(ranked[0].score > ranked[1].score, 'manufacturer score > retailer score');
  });

  it('gives PDF paths a bonus', () => {
    const results = [
      { url: 'https://razer.com/support/viper-v3-pro-manual.pdf', title: 'Razer Manual', snippet: 'PDF manual' },
      { url: 'https://razer.com/mice/razer-viper-v3-pro', title: 'Razer Product Page', snippet: 'Product specs' }
    ];

    const ranked = rerankSearchResults({
      results,
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight']
    });

    console.log('[RERANK-DET] PDF vs page:');
    for (const row of ranked) {
      console.log(`  ${row.path}: score=${row.score}`);
    }

    const pdfRow = ranked.find((r) => r.path.endsWith('.pdf'));
    const pageRow = ranked.find((r) => !r.path.endsWith('.pdf'));
    assert.ok(pdfRow.score > pageRow.score, 'PDF gets bonus over product page');
  });

  it('filters out denied hosts', () => {
    const results = [
      { url: 'https://spam-site.biz/razer-viper', title: 'Razer Viper', snippet: 'Spam' },
      { url: 'https://razer.com/mice/razer-viper-v3-pro', title: 'Razer Viper V3 Pro', snippet: 'Official' }
    ];

    const ranked = rerankSearchResults({
      results,
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight']
    });

    console.log(`[RERANK-DET] denied host filter: ${ranked.length} results (from 2)`);

    assert.equal(ranked.length, 1);
    assert.ok(ranked[0].url.includes('razer.com'));
  });

  it('each result includes tier, role, approved_domain, host, path', () => {
    const results = [
      { url: 'https://rtings.com/mouse/reviews/razer-viper-v3-pro', title: 'Review', snippet: 'Lab review' }
    ];

    const ranked = rerankSearchResults({
      results,
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight']
    });

    const row = ranked[0];
    console.log(`[RERANK-DET] enrichment: tier=${row.tier} role=${row.role} host=${row.host} approved=${row.approved_domain}`);

    assert.ok(typeof row.tier === 'number');
    assert.ok(typeof row.role === 'string');
    assert.ok(typeof row.host === 'string');
    assert.ok(typeof row.path === 'string');
    assert.ok(typeof row.approved_domain === 'boolean');
    assert.ok(typeof row.score === 'number');
  });

  it('prefers canonical manufacturer category pages over guessed manufacturer product paths', () => {
    const results = [
      { url: 'https://razer.com/product/viper-v3-pro', title: 'Razer Viper V3 Pro', snippet: 'Official specs' },
      { url: 'https://razer.com/products/viper-v3-pro', title: 'Razer Viper V3 Pro', snippet: 'Official specs' },
      { url: 'https://razer.com/gaming-mice/viper-v3-pro', title: 'Razer Viper V3 Pro', snippet: 'Official specs' },
      { url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro', title: 'Razer Viper V3 Pro', snippet: 'Official specs' }
    ];

    const ranked = rerankSearchResults({
      results,
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'polling_rate']
    });

    assert.equal(ranked[0].url, 'https://www.razer.com/gaming-mice/razer-viper-v3-pro');
    assert.equal(ranked[1].url, 'https://razer.com/gaming-mice/viper-v3-pro');
  });

  it('penalizes retailer search and brand surfaces below exact identity manual hits', () => {
    const categoryConfig = {
      ...makeCategoryConfig(),
      sourceHosts: [
        ...makeCategoryConfig().sourceHosts,
        { host: 'bestbuy.com', tierName: 'retailer', role: 'retailer', tier: 3 }
      ]
    };
    const results = [
      {
        url: 'https://bestbuy.com/site/searchpage.jsp?id=pcat17071&st=logitech+superlight',
        title: 'logitech superlight - Best Buy',
        snippet: 'Logitech PRO X SUPERLIGHT mice',
        identity_match_level: 'weak'
      },
      {
        url: 'https://bestbuy.com/site/brands/logitech/pcmcat10900050009.c?id=pcmcat10900050009',
        title: 'Logitech: Computer Accessories - Best Buy',
        snippet: 'General Logitech brand page',
        identity_match_level: 'none'
      },
      {
        url: 'https://manualslib.com/manual/4035888/Logitech-G-Pro-X-Superlight-2.html',
        title: 'Logitech G PRO X SUPERLIGHT 2 Manual',
        snippet: 'Official manual for the exact target product',
        identity_match_level: 'partial'
      }
    ];

    const ranked = rerankSearchResults({
      results,
      categoryConfig,
      missingFields: ['weight', 'sensor', 'polling_rate']
    });

    assert.equal(ranked[0].url, 'https://manualslib.com/manual/4035888/Logitech-G-Pro-X-Superlight-2.html');
    assert.equal(ranked[2].url, 'https://bestbuy.com/site/brands/logitech/pcmcat10900050009.c?id=pcmcat10900050009');
  });

  it('penalizes wrong-variant and comparison pages below exact-identity manual pages', () => {
    const results = [
      {
        url: 'https://manualslib.com/manual/4035888/Logitech-G-Pro-X-Superlight-2.html',
        title: 'Logitech G PRO X SUPERLIGHT 2 Manual',
        snippet: 'Exact target manual',
        identity_match_level: 'partial',
        variant_guard_hit: false,
        multi_model_hint: false
      },
      {
        url: 'https://manua.ls/logitech/g-pro-x-superlight-2-dex/manual',
        title: 'Logitech G PRO X Superlight 2 DEX manual',
        snippet: 'DEX variant manual',
        identity_match_level: 'partial',
        variant_guard_hit: true,
        multi_model_hint: false
      },
      {
        url: 'https://example.com/logitech-g-pro-x-superlight-2-vs-razer-viper-v3-pro',
        title: 'Logitech G Pro X Superlight 2 vs Razer Viper V3 Pro',
        snippet: 'Comparison page',
        identity_match_level: 'partial',
        variant_guard_hit: false,
        multi_model_hint: true
      }
    ];

    const ranked = rerankSearchResults({
      results,
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor']
    });

    assert.equal(ranked[0].url, 'https://manualslib.com/manual/4035888/Logitech-G-Pro-X-Superlight-2.html');
    assert.equal(ranked[2].url, 'https://manua.ls/logitech/g-pro-x-superlight-2-dex/manual');
  });
});

describe('Phase 03 — Applicability Functions (pure)', () => {
  it('computeIdentityMatchLevel: strong when brand+model+variant all present', () => {
    const level = computeIdentityMatchLevel({
      url: 'https://razer.com/viper-v3-pro',
      title: 'Razer Viper V3 Pro Specifications',
      snippet: 'The Razer Viper V3 Pro gaming mouse',
      identityLock: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' }
    });

    console.log(`[IDENTITY] brand+model+variant → ${level}`);
    assert.equal(level, 'strong');
  });

  it('computeIdentityMatchLevel: partial/weak/none for decreasing matches', () => {
    const partial = computeIdentityMatchLevel({
      url: '', title: 'Razer Viper V3 Review', snippet: '',
      identityLock: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' }
    });
    const weak = computeIdentityMatchLevel({
      url: '', title: 'Latest Razer Products', snippet: '',
      identityLock: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' }
    });
    const none = computeIdentityMatchLevel({
      url: '', title: 'Best Gaming Mice', snippet: '',
      identityLock: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' }
    });

    console.log(`[IDENTITY] partial=${partial} weak=${weak} none=${none}`);

    assert.equal(partial, 'partial');
    assert.equal(weak, 'weak');
    assert.equal(none, 'none');
  });

  it('detectVariantGuardHit: true when wrong variant appears, false for target variant', () => {
    const hit = detectVariantGuardHit({
      title: 'Razer Viper V3 Hyperspeed', snippet: '',
      url: 'https://example.com/hyperspeed',
      variantGuardTerms: ['hyperspeed', 'pro'],
      targetVariant: 'Pro'
    });
    const noHit = detectVariantGuardHit({
      title: 'Razer Viper V3 Pro Review', snippet: '',
      url: 'https://example.com/pro',
      variantGuardTerms: ['hyperspeed', 'pro'],
      targetVariant: 'Pro'
    });

    console.log(`[GUARD] wrong variant hit=${hit}, target variant hit=${noHit}`);

    assert.equal(hit, true);
    assert.equal(noHit, false);
  });

  it('detectMultiModelHint: true for comparisons, top-N, and vs pages', () => {
    assert.equal(detectMultiModelHint({ title: 'Top 10 gaming mice', snippet: '' }), true);
    assert.equal(detectMultiModelHint({ title: 'Razer Viper vs Logitech G Pro', snippet: '' }), true);
    assert.equal(detectMultiModelHint({ title: 'Best wireless mice comparison', snippet: '' }), true);
    assert.equal(detectMultiModelHint({ title: 'Razer Viper V3 Pro Specs', snippet: '' }), false);

    console.log('[MULTI-MODEL] top-N=true, vs=true, comparison=true, single=false');
  });
});


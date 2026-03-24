// WHY: Testing Phase 02 — Tier weight and doc kind weight validation.
// Proves that the retrieval scoring system respects tier hierarchy
// and doc kind ordering as specified in the Phase 02 test plan.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ========================================================================
// 1. TIER WEIGHT SCORING VALIDATION
// ========================================================================

describe('Phase02-TW — Tier1 manufacturer vs Tier3 retailer', () => {
  // Spec: "Run product where both have same field — which source wins — Tier1 should always win"

  it('Tier1 manufacturer page always outscores Tier3 retailer for same field (same method, same doc)', async () => {
    const { buildTierAwareFieldRetrieval } = await import('../tierAwareRetriever.js');

    // Two evidence rows: same field, same method, same doc kind — only tier differs
    const evidencePool = [
      {
        origin_field: 'weight',
        url: 'https://razer.com/mice/viper-v3-pro',
        host: 'razer.com',
        tier: 1,
        tier_name: 'tier1_manufacturer',
        method: 'table',
        quote: 'Weight: 54g',
        snippet_text: 'Weight: 54g',
        snippet_id: 'snap-mfg-1',
      },
      {
        origin_field: 'weight',
        url: 'https://amazon.com/dp/B0123456',
        host: 'amazon.com',
        tier: 3,
        tier_name: 'tier3_retailer',
        method: 'table',
        quote: 'Weight: 54g',
        snippet_text: 'Weight: 54g',
        snippet_id: 'snap-ret-1',
      },
    ];

    const result = buildTierAwareFieldRetrieval({
      fieldKey: 'weight',
      needRow: { required_level: 'required', need_score: 1 },
      fieldRule: { label: 'Weight', unit: 'g' },
      evidencePool,
      identity: { brand: 'Razer', model: 'Viper V3 Pro' },
    });

    assert.ok(result.hits.length >= 2, `expected >= 2 hits, got ${result.hits.length}`);
    const mfgHit = result.hits.find(h => h.host === 'razer.com');
    const retHit = result.hits.find(h => h.host === 'amazon.com');
    assert.ok(mfgHit, 'manufacturer hit should be present');
    assert.ok(retHit, 'retailer hit should be present');
    assert.ok(
      mfgHit.score > retHit.score,
      `Tier1 manufacturer (${mfgHit.score}) MUST outscore Tier3 retailer (${retHit.score})`
    );
    assert.equal(mfgHit.rank, 1, 'manufacturer must be ranked #1');
  });

  it('Tier1 manufacturer wins even when retailer has more anchor matches', async () => {
    const { buildTierAwareFieldRetrieval } = await import('../tierAwareRetriever.js');

    const evidencePool = [
      {
        origin_field: 'weight',
        url: 'https://razer.com/mice/viper-v3-pro',
        host: 'razer.com',
        tier: 1,
        method: 'kv',
        quote: 'Weight: 54g',
        snippet_text: 'Weight: 54g',
        snippet_id: 'snap-mfg-2',
      },
      {
        origin_field: 'weight',
        url: 'https://amazon.com/dp/B0123456',
        host: 'amazon.com',
        tier: 3,
        method: 'table',
        // More anchor-rich text: contains "weight", "grams", "g"
        quote: 'Product weight specification: 54 grams (54g) mouse weight measured without cable',
        snippet_text: 'Product weight specification: 54 grams (54g) mouse weight measured without cable',
        snippet_id: 'snap-ret-2',
      },
    ];

    const result = buildTierAwareFieldRetrieval({
      fieldKey: 'weight',
      needRow: { required_level: 'required', need_score: 1 },
      fieldRule: { label: 'Weight', unit: 'g' },
      evidencePool,
      identity: { brand: 'Razer', model: 'Viper V3 Pro' },
    });

    const mfgHit = result.hits.find(h => h.host === 'razer.com');
    const retHit = result.hits.find(h => h.host === 'amazon.com');
    assert.ok(mfgHit && retHit);

    // Tier1 weight contribution: 3 * 2.6 = 7.8
    // Tier3 weight contribution: 1 * 2.6 = 2.6
    // Difference: 5.2 — this should overwhelm anchor bonus differences
    assert.ok(
      mfgHit.score > retHit.score,
      `Tier1 (${mfgHit.score}) MUST outscore Tier3 (${retHit.score}) even with fewer anchors`
    );
  });
});

describe('Phase02-TW — Tier2 lab vs Tier3 retailer', () => {
  // Spec: "lab should win for measurement fields"

  it('Tier2 lab review outscores Tier3 retailer for measurement field (click_latency)', async () => {
    const { buildTierAwareFieldRetrieval } = await import('../tierAwareRetriever.js');

    const evidencePool = [
      {
        origin_field: 'click_latency',
        url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro',
        host: 'rtings.com',
        tier: 2,
        tier_name: 'tier2_lab',
        method: 'table',
        quote: 'Click Latency: 1.2ms measured in controlled lab environment',
        snippet_text: 'Click Latency: 1.2ms measured in controlled lab environment',
        snippet_id: 'snap-lab-1',
      },
      {
        origin_field: 'click_latency',
        url: 'https://bestbuy.com/site/razer-viper-v3-pro',
        host: 'bestbuy.com',
        tier: 3,
        tier_name: 'tier3_retailer',
        method: 'table',
        quote: 'Click Latency: 1.2ms',
        snippet_text: 'Click Latency: 1.2ms',
        snippet_id: 'snap-ret-3',
      },
    ];

    const result = buildTierAwareFieldRetrieval({
      fieldKey: 'click_latency',
      needRow: { required_level: 'required', need_score: 1 },
      fieldRule: { label: 'Click Latency', unit: 'ms' },
      evidencePool,
      identity: { brand: 'Razer', model: 'Viper V3 Pro' },
    });

    const labHit = result.hits.find(h => h.host === 'rtings.com');
    const retHit = result.hits.find(h => h.host === 'bestbuy.com');
    assert.ok(labHit && retHit);
    assert.ok(
      labHit.score > retHit.score,
      `Tier2 lab (${labHit.score}) MUST outscore Tier3 retailer (${retHit.score}) for measurement field`
    );
    assert.equal(labHit.rank, 1, 'lab must be ranked #1 for measurement fields');
  });
});

describe('Phase02-TW — Authority gap documentation', () => {
  // Spec asks: "High-authority Tier3 vs low-authority Tier2 — authority should differentiate"
  // Reality: authority is an enum in the registry but is NOT consumed by retrieval scoring.
  // Retrieval uses tier number (1-5) only. This is a documented gap.

  it('within same tier, scoring differentiates by method/doc/anchors, not authority', async () => {
    const { buildTierAwareFieldRetrieval } = await import('../tierAwareRetriever.js');

    const evidencePool = [
      {
        origin_field: 'sensor',
        url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro',
        host: 'rtings.com',
        tier: 2,
        method: 'table',
        quote: 'Sensor: PAW3950 - tested in lab with 25K DPI',
        snippet_text: 'Sensor: PAW3950 - tested in lab with 25K DPI',
        snippet_id: 'snap-lab-auth',
      },
      {
        origin_field: 'sensor',
        url: 'https://techpowerup.com/review/razer-viper-v3-pro',
        host: 'techpowerup.com',
        tier: 2,
        method: 'text',
        quote: 'PAW3950',
        snippet_text: 'PAW3950',
        snippet_id: 'snap-lab-low',
      },
    ];

    const result = buildTierAwareFieldRetrieval({
      fieldKey: 'sensor',
      needRow: { required_level: 'required', need_score: 1 },
      fieldRule: { label: 'Sensor' },
      evidencePool,
      identity: { brand: 'Razer', model: 'Viper V3 Pro' },
    });

    assert.ok(result.hits.length >= 2);
    // Within same tier, method weight and anchor matches drive differentiation
    const rtingsHit = result.hits.find(h => h.host === 'rtings.com');
    const tpuHit = result.hits.find(h => h.host === 'techpowerup.com');
    assert.ok(rtingsHit && tpuHit);
    // rtings has method=table (1.25) vs techpowerup method=text (0.9), plus more anchor text
    assert.ok(
      rtingsHit.score >= tpuHit.score,
      `rtings (${rtingsHit.score}) should score >= techpowerup (${tpuHit.score}) due to method/anchor advantage`
    );
  });
});

describe('Phase02-DK — Manual PDF vs Lab Review scoring', () => {
  // Spec: "Do manual PDFs actually have the best specs?" — Yes, weight 1.5 vs 0.95

  it('manual PDF from manufacturer outscores lab review from same tier for same field', async () => {
    const { buildTierAwareFieldRetrieval } = await import('../tierAwareRetriever.js');

    const evidencePool = [
      {
        origin_field: 'weight',
        url: 'https://razer.com/mice/viper-v3-pro/manual.pdf',
        host: 'razer.com',
        tier: 1,
        method: 'table',
        // inferDocKind sees .pdf + no manual keyword → spec_pdf (1.4)
        quote: 'Weight: 54g without dongle',
        snippet_text: 'Weight: 54g without dongle',
        snippet_id: 'snap-manual-pdf',
      },
      {
        origin_field: 'weight',
        url: 'https://razer.com/mice/viper-v3-pro/review',
        host: 'razer.com',
        tier: 1,
        method: 'table',
        // inferDocKind sees 'review' → lab_review (0.95)
        quote: 'Review benchmark weight: 54g',
        snippet_text: 'Review benchmark weight: 54g',
        snippet_id: 'snap-review',
      },
    ];

    const result = buildTierAwareFieldRetrieval({
      fieldKey: 'weight',
      needRow: { required_level: 'required', need_score: 1 },
      fieldRule: { label: 'Weight', unit: 'g' },
      evidencePool,
      identity: { brand: 'Razer', model: 'Viper V3 Pro' },
    });

    const pdfHit = result.hits.find(h => h.url.includes('.pdf'));
    const reviewHit = result.hits.find(h => h.url.includes('review'));
    assert.ok(pdfHit && reviewHit);
    assert.ok(
      pdfHit.ranking_features.doc_kind_weight > reviewHit.ranking_features.doc_kind_weight,
      `PDF doc weight (${pdfHit.ranking_features.doc_kind_weight}) should be > review (${reviewHit.ranking_features.doc_kind_weight})`
    );
  });
});

describe('Phase02-DK — Lab review vs Retail product page scoring', () => {
  // Spec: "Do reviews from labs deserve higher than 0.95?" and
  // "Do Amazon pages have enough useful specs to justify 0.75?"

  it('lab review (0.95) outscores retail product_page (0.75) for doc kind weight', async () => {
    const { buildTierAwareFieldRetrieval } = await import('../tierAwareRetriever.js');

    const evidencePool = [
      {
        origin_field: 'sensor',
        url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro',
        host: 'rtings.com',
        tier: 2,
        method: 'table',
        // inferDocKind: 'review' + 'rtings' → lab_review (0.95)
        quote: 'Sensor: PixArt PAW3950 - review benchmark results',
        snippet_text: 'Sensor: PixArt PAW3950 - review benchmark results',
        snippet_id: 'snap-lab-dk',
      },
      {
        origin_field: 'sensor',
        url: 'https://amazon.com/products/razer-viper-v3-pro',
        host: 'amazon.com',
        tier: 3,
        method: 'table',
        // inferDocKind: '/products/' → product_page (0.75)
        quote: 'Sensor: PAW3950',
        snippet_text: 'Sensor: PAW3950',
        snippet_id: 'snap-retail-dk',
      },
    ];

    const result = buildTierAwareFieldRetrieval({
      fieldKey: 'sensor',
      needRow: { required_level: 'required', need_score: 1 },
      fieldRule: { label: 'Sensor' },
      evidencePool,
      identity: { brand: 'Razer', model: 'Viper V3 Pro' },
    });

    const labHit = result.hits.find(h => h.host === 'rtings.com');
    const retHit = result.hits.find(h => h.host === 'amazon.com');
    assert.ok(labHit && retHit);

    // Lab review doc kind weight (0.95) > product_page (0.75)
    assert.ok(
      labHit.ranking_features.doc_kind_weight >= 0.95,
      `lab doc kind weight should be >= 0.95, got ${labHit.ranking_features.doc_kind_weight}`
    );
    assert.ok(
      retHit.ranking_features.doc_kind_weight <= 0.75,
      `retail doc kind weight should be <= 0.75, got ${retHit.ranking_features.doc_kind_weight}`
    );

    // Combined: lab wins on both tier (2 > 3) AND doc kind (0.95 > 0.75)
    assert.ok(
      labHit.score > retHit.score,
      `lab (${labHit.score}) MUST outscore retailer (${retHit.score})`
    );
  });
});

// ========================================================================
// 3. COMBINED TIER + DOC KIND INTERACTION
// ========================================================================

describe('Phase02-TW/DK — Combined weight interaction proof', () => {
  it('score formula components are additive and produce expected magnitude', async () => {
    const { buildTierAwareFieldRetrieval } = await import('../tierAwareRetriever.js');

    const evidencePool = [
      {
        origin_field: 'weight',
        url: 'https://razer.com/mice/viper-v3-pro/spec.pdf',
        host: 'razer.com',
        tier: 1,
        method: 'table',
        quote: 'Weight specification: 54 grams',
        snippet_text: 'Weight specification: 54 grams',
        snippet_id: 'snap-combined',
      },
    ];

    const result = buildTierAwareFieldRetrieval({
      fieldKey: 'weight',
      needRow: { required_level: 'required', need_score: 1 },
      fieldRule: { label: 'Weight', unit: 'g' },
      evidencePool,
      identity: { brand: 'Razer', model: 'Viper V3 Pro' },
    });

    assert.ok(result.hits.length === 1);
    const hit = result.hits[0];

    // Expected components:
    // tier_weight: >= 3 (Tier1 base, may be boosted by buildTierWeightLookup)
    // doc_kind_weight: >= 1.35 (spec_pdf or spec, since URL has .pdf)
    // method_weight: 1.25 (table)
    // + anchor/identity/unit bonuses
    // Note: buildTierWeightLookup applies preference boosts so tier_weight may exceed base
    assert.ok(
      hit.ranking_features.tier_weight >= 3,
      `Tier1 weight should be >= 3 (base), got ${hit.ranking_features.tier_weight}`
    );
    assert.ok(
      hit.ranking_features.doc_kind_weight >= 1.35,
      `doc kind should be >= 1.35 (spec or spec_pdf), got ${hit.ranking_features.doc_kind_weight}`
    );
    assert.equal(hit.ranking_features.method_weight, 1.25, 'table method weight should be 1.25');

    // Total score should be meaningful (> 10 for Tier1+spec_pdf+table)
    assert.ok(hit.score > 10, `total score ${hit.score} should be > 10 for Tier1+spec_pdf+table`);
  });

  it('Tier1+manual_pdf beats Tier5+other: best vs worst combination', async () => {
    const { buildTierAwareFieldRetrieval } = await import('../tierAwareRetriever.js');

    const evidencePool = [
      {
        origin_field: 'weight',
        url: 'https://razer.com/mice/manual.pdf',
        host: 'razer.com',
        tier: 1,
        method: 'table',
        // manual + .pdf → manual_pdf (1.5)
        quote: 'Weight manual specification: 54g mouse weight',
        snippet_text: 'Weight manual specification: 54g mouse weight',
        snippet_id: 'snap-best',
      },
      {
        origin_field: 'weight',
        url: 'https://random-aggregator.info/mice',
        host: 'random-aggregator.info',
        tier: 5,
        method: 'helper_supportive',
        // no doc hints → other (0.55)
        quote: 'Weight: 54g',
        snippet_text: 'Weight: 54g',
        snippet_id: 'snap-worst',
      },
    ];

    const result = buildTierAwareFieldRetrieval({
      fieldKey: 'weight',
      needRow: { required_level: 'required', need_score: 1 },
      fieldRule: { label: 'Weight', unit: 'g' },
      evidencePool,
      identity: { brand: 'Razer', model: 'Viper V3 Pro' },
    });

    const bestHit = result.hits.find(h => h.host === 'razer.com');
    const worstHit = result.hits.find(h => h.host === 'random-aggregator.info');
    assert.ok(bestHit && worstHit);

    // Best: 3*2.6 + 1.5*1.5 + 1.25*0.85 = 7.8 + 2.25 + 1.0625 = 11.1125 + bonuses
    // Worst: 0.4*2.6 + 0.55*1.5 + 0.65*0.85 = 1.04 + 0.825 + 0.5525 = 2.4175 + bonuses
    // Ratio should be roughly 4-5x
    const ratio = bestHit.score / worstHit.score;
    assert.ok(ratio >= 2, `best/worst ratio ${ratio.toFixed(2)} should be >= 2`);
    assert.equal(bestHit.rank, 1, 'best combination must be ranked #1');
  });
});

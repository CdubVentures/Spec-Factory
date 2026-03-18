/**
 * Tests for triageSoftLabeler — Stage 06 SERP Triage soft label assignment.
 *
 * Assigns 5 label dimensions to each candidate. These labels drive lane
 * assignment and scoring but never cause a drop.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assignSoftLabels } from '../triageSoftLabeler.js';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
      { host: 'rtings.com', tierName: 'lab', role: 'review', tier: 2 },
      { host: 'techpowerup.com', tierName: 'lab', role: 'review', tier: 2 },
      { host: 'amazon.com', tierName: 'retailer', role: 'retailer', tier: 3 },
      { host: 'bestbuy.com', tierName: 'retailer', role: 'retailer', tier: 3 },
    ],
    denylist: [],
    ...overrides,
  };
}

function makeCandidate(url, overrides = {}) {
  const parsed = new URL(url);
  return {
    url,
    original_url: url,
    host: parsed.hostname.toLowerCase().replace(/^www\./, ''),
    title: overrides.title || 'Test Page',
    snippet: overrides.snippet || 'Test snippet',
    provider: 'google',
    hard_drop: false,
    hard_drop_reason: null,
    ...overrides,
  };
}

const IDENTITY_RAZER_VIPER = { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' };

// ---------------------------------------------------------------------------
// identity_prelim
// ---------------------------------------------------------------------------

describe('triageSoftLabeler — identity_prelim', () => {
  it('exact: brand + model + variant all present', () => {
    const candidates = [makeCandidate('https://razer.com/gaming-mice/razer-viper-v3-pro', {
      title: 'Razer Viper V3 Pro Gaming Mouse',
      snippet: 'The Razer Viper V3 Pro specs',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      searchProfileBase: { variant_guard_terms: ['hyperspeed'] },
    });
    assert.equal(labeled[0].identity_prelim, 'exact');
  });

  it('family: brand + model match but variant absent', () => {
    // WHY: identityLock.model must be present in the text for 'partial' match.
    // Title has "Viper V3" which matches model "Viper V3", but variant "Pro" is absent.
    const candidates = [makeCandidate('https://razer.com/gaming-mice/razer-viper-v3', {
      title: 'Razer Viper V3 Gaming Mouse',
      snippet: 'The Razer Viper V3',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' },
      variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' },
      searchProfileBase: { variant_guard_terms: ['hyperspeed'] },
    });
    assert.equal(labeled[0].identity_prelim, 'family');
  });

  it('variant: variant guard fires (different variant present)', () => {
    const candidates = [makeCandidate('https://razer.com/gaming-mice/razer-viper-v3-hyperspeed', {
      title: 'Razer Viper V3 Hyperspeed',
      snippet: 'Razer Viper V3 Hyperspeed mouse',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' },
      searchProfileBase: { variant_guard_terms: ['hyperspeed'] },
    });
    assert.equal(labeled[0].identity_prelim, 'variant');
  });

  it('multi_model: comparison/vs page', () => {
    const candidates = [makeCandidate('https://example.com/razer-viper-v3-pro-vs-logitech', {
      title: 'Razer Viper V3 Pro vs Logitech G Pro X',
      snippet: 'Comparison page',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      searchProfileBase: { variant_guard_terms: [] },
    });
    assert.equal(labeled[0].identity_prelim, 'multi_model');
  });

  it('uncertain: weak identity match (brand only)', () => {
    const candidates = [makeCandidate('https://example.com/razer-gaming', {
      title: 'Latest Razer Products',
      snippet: 'General Razer page',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      searchProfileBase: { variant_guard_terms: [] },
    });
    assert.equal(labeled[0].identity_prelim, 'uncertain');
  });

  it('off_target: no identity match at all', () => {
    const candidates = [makeCandidate('https://example.com/random-page', {
      title: 'Unrelated Technology Article',
      snippet: 'This page has nothing to do with the target product',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      searchProfileBase: { variant_guard_terms: [] },
    });
    assert.equal(labeled[0].identity_prelim, 'off_target');
  });
});

// ---------------------------------------------------------------------------
// host_trust_class
// ---------------------------------------------------------------------------

describe('triageSoftLabeler — host_trust_class', () => {
  it('official: manufacturer + approved domain', () => {
    const candidates = [makeCandidate('https://razer.com/gaming-mice/viper')];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.equal(labeled[0].host_trust_class, 'official');
  });

  it('trusted_review: tier 1-2 review role', () => {
    const candidates = [makeCandidate('https://rtings.com/mouse/reviews/razer-viper')];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.equal(labeled[0].host_trust_class, 'trusted_review');
  });

  it('retailer: retailer role', () => {
    const candidates = [makeCandidate('https://amazon.com/dp/B0EXAMPLE')];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.equal(labeled[0].host_trust_class, 'retailer');
  });

  it('community: forum-like subdomain on manufacturer', () => {
    const config = {
      ...makeCategoryConfig(),
      sourceHosts: [
        ...makeCategoryConfig().sourceHosts,
        { host: 'community.razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
      ],
    };
    const candidates = [makeCandidate('https://community.razer.com/topic/viper')];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: config,
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.equal(labeled[0].host_trust_class, 'community');
  });

  it('unknown: unrecognized domain', () => {
    const candidates = [makeCandidate('https://random-blog.com/razer-viper-review')];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.equal(labeled[0].host_trust_class, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// doc_kind_guess
// ---------------------------------------------------------------------------

describe('triageSoftLabeler — doc_kind_guess', () => {
  it('manual_pdf: PDF with manual keywords', () => {
    const candidates = [makeCandidate('https://razer.com/support/viper-v3-pro-manual.pdf', {
      title: 'Razer Viper V3 Pro User Manual',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.equal(labeled[0].doc_kind_guess, 'manual_pdf');
  });

  it('review: review/benchmark page', () => {
    const candidates = [makeCandidate('https://rtings.com/mouse/reviews/razer-viper-v3-pro', {
      title: 'Razer Viper V3 Pro Review - RTINGS',
      snippet: 'Full lab review',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.ok(['review', 'lab_review'].includes(labeled[0].doc_kind_guess),
      `expected review type, got ${labeled[0].doc_kind_guess}`);
  });

  it('product_page: manufacturer product path', () => {
    const candidates = [makeCandidate('https://razer.com/gaming-mice/razer-viper-v3-pro', {
      title: 'Razer Viper V3 Pro',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.ok(['product_page', 'other'].includes(labeled[0].doc_kind_guess),
      `expected product_page or other, got ${labeled[0].doc_kind_guess}`);
  });
});

// ---------------------------------------------------------------------------
// extraction_surface_prior
// ---------------------------------------------------------------------------

describe('triageSoftLabeler — extraction_surface_prior', () => {
  it('pdf_table or pdf_text for PDF URLs', () => {
    const candidates = [makeCandidate('https://razer.com/support/spec-sheet.pdf')];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.ok(
      ['pdf_table', 'pdf_text'].includes(labeled[0].extraction_surface_prior),
      `expected pdf surface, got ${labeled[0].extraction_surface_prior}`
    );
  });

  it('article_text for review pages', () => {
    const candidates = [makeCandidate('https://rtings.com/mouse/reviews/razer-viper-v3-pro', {
      title: 'Review with measurements',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.ok(
      ['article_text', 'html_table'].includes(labeled[0].extraction_surface_prior),
      `expected article/table surface, got ${labeled[0].extraction_surface_prior}`
    );
  });

  it('weak_surface for forum/community pages', () => {
    const candidates = [makeCandidate('https://reddit.com/r/MouseReview/comments/abc', {
      title: 'Razer Viper V3 Pro Discussion',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.equal(labeled[0].extraction_surface_prior, 'weak_surface');
  });
});

// ---------------------------------------------------------------------------
// soft_reason_codes
// ---------------------------------------------------------------------------

describe('triageSoftLabeler — soft_reason_codes', () => {
  it('root path gets homepage_like soft label', () => {
    const candidates = [makeCandidate('https://razer.com/')];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });
    assert.ok(Array.isArray(labeled[0].soft_reason_codes), 'soft_reason_codes is array');
    assert.ok(labeled[0].soft_reason_codes.includes('homepage_like'), 'includes homepage_like');
  });

  it('accumulates multiple reason codes', () => {
    const candidates = [makeCandidate('https://example.com/razer-viper-v3-pro-vs-logitech', {
      title: 'Razer Viper V3 Pro vs Logitech G Pro X Superlight Comparison',
    })];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      searchProfileBase: { variant_guard_terms: [] },
    });
    assert.ok(labeled[0].soft_reason_codes.length >= 1, 'has at least one reason code');
  });
});

// ---------------------------------------------------------------------------
// Cross-dimension combos
// ---------------------------------------------------------------------------

describe('triageSoftLabeler — cross-dimension combinations', () => {
  it('all 5 label dimensions are present on every labeled candidate', () => {
    const candidates = [
      makeCandidate('https://razer.com/gaming-mice/razer-viper-v3-pro', {
        title: 'Razer Viper V3 Pro',
      }),
    ];
    const labeled = assignSoftLabels({
      candidates,
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    });

    const c = labeled[0];
    assert.ok('identity_prelim' in c, 'has identity_prelim');
    assert.ok('host_trust_class' in c, 'has host_trust_class');
    assert.ok('doc_kind_guess' in c, 'has doc_kind_guess');
    assert.ok('extraction_surface_prior' in c, 'has extraction_surface_prior');
    assert.ok('soft_reason_codes' in c, 'has soft_reason_codes');
    assert.ok(Array.isArray(c.soft_reason_codes), 'soft_reason_codes is array');
  });

  it('empty candidates returns empty array', () => {
    const labeled = assignSoftLabels({
      candidates: [],
      categoryConfig: makeCategoryConfig(),
      identityLock: IDENTITY_RAZER_VIPER,
      variables: {},
    });
    assert.equal(labeled.length, 0);
  });
});

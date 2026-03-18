/**
 * Tests for discoveryUrlClassifier.js — Phase 3 extraction from searchDiscovery.js.
 * Covers URL classification, doc-kind guessing, relevance checking,
 * admission exclusion, and domain classification seeds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeIdentityMatchLevel,
  detectVariantGuardHit,
  detectMultiModelHint,
  guessDocKind,
  normalizeDocHint,
  docHintMatchesDocKind,
  classifyUrlCandidate,
  isLowSignalDiscoveryPath,
  isForumLikeDomainClassification,
  FORUM_SUBDOMAIN_LABELS,
  isForumLikeManufacturerSubdomain,
  DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS,
  resolveProductPathAnchor,
  buildProductPathTokenSignature,
  detectSiblingManufacturerProductPage,
  resolveDiscoveryAdmissionExclusionReason,
  isRelevantSearchResult,
  collectDomainClassificationSeeds,
} from '../src/features/indexing/discovery/discoveryUrlClassifier.js';

// ---------------------------------------------------------------------------
// computeIdentityMatchLevel
// ---------------------------------------------------------------------------

test('computeIdentityMatchLevel: returns none for empty input', () => {
  assert.equal(computeIdentityMatchLevel(), 'none');
  assert.equal(computeIdentityMatchLevel({}), 'none');
});

test('computeIdentityMatchLevel: strong when brand+model+variant all match', () => {
  assert.equal(computeIdentityMatchLevel({
    url: 'https://razer.com/viper',
    title: 'Razer Viper V3 Pro',
    snippet: '',
    identityLock: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' }
  }), 'strong');
});

test('computeIdentityMatchLevel: matches case-insensitively across title text', () => {
  assert.equal(computeIdentityMatchLevel({
    url: 'https://RAZER.COM/VIPER-V3-PRO',
    title: 'RAZER VIPER V3 PRO',
    snippet: '',
    identityLock: { brand: 'razer', model: 'viper v3', variant: 'pro' }
  }), 'strong');
});

test('computeIdentityMatchLevel: partial when brand+model match but no variant', () => {
  assert.equal(computeIdentityMatchLevel({
    url: 'https://razer.com',
    title: 'Razer Viper V3',
    snippet: '',
    identityLock: { brand: 'Razer', model: 'Viper V3' }
  }), 'partial');
});

test('computeIdentityMatchLevel: weak when only brand matches', () => {
  assert.equal(computeIdentityMatchLevel({
    url: 'https://razer.com',
    title: 'Razer Gaming',
    snippet: '',
    identityLock: { brand: 'Razer', model: 'Viper V3' }
  }), 'weak');
});

// ---------------------------------------------------------------------------
// detectVariantGuardHit
// ---------------------------------------------------------------------------

test('detectVariantGuardHit: returns false for empty input', () => {
  assert.equal(detectVariantGuardHit(), false);
  assert.equal(detectVariantGuardHit({}), false);
});

test('detectVariantGuardHit: detects guard term in title', () => {
  assert.equal(detectVariantGuardHit({
    title: 'Razer Viper V2 review',
    variantGuardTerms: ['V2'],
    targetVariant: 'V3'
  }), true);
});

test('detectVariantGuardHit: skips target variant', () => {
  assert.equal(detectVariantGuardHit({
    title: 'Razer Viper V3 Pro',
    variantGuardTerms: ['V3'],
    targetVariant: 'V3'
  }), false);
});

// ---------------------------------------------------------------------------
// detectMultiModelHint
// ---------------------------------------------------------------------------

test('detectMultiModelHint: returns false for empty input', () => {
  assert.equal(detectMultiModelHint(), false);
  assert.equal(detectMultiModelHint({}), false);
});

test('detectMultiModelHint: detects vs pattern', () => {
  assert.equal(detectMultiModelHint({ title: 'Viper V3 vs G Pro X' }), true);
});

test('detectMultiModelHint: detects top N pattern', () => {
  assert.equal(detectMultiModelHint({ title: 'Top 10 gaming mice' }), true);
});

test('detectMultiModelHint: detects best N mice pattern', () => {
  assert.equal(detectMultiModelHint({ title: 'Best 5 gaming mice 2024' }), true);
});

test('detectMultiModelHint: detects comparison pattern', () => {
  assert.equal(detectMultiModelHint({ snippet: 'Full comparison of mice' }), true);
});

test('detectMultiModelHint: does not match "vs" inside other words', () => {
  assert.equal(detectMultiModelHint({ title: 'canvas rendering module' }), false);
});

test('detectMultiModelHint: false for single product', () => {
  assert.equal(detectMultiModelHint({ title: 'Razer Viper V3 Pro review' }), false);
});

// ---------------------------------------------------------------------------
// guessDocKind
// ---------------------------------------------------------------------------

const guessDocKindCases = [
  [{ pathname: '/manual.pdf', title: 'User guide' }, 'manual_pdf'],
  [{ pathname: '/spec.pdf', title: 'Specification' }, 'spec_pdf'],
  [{ title: 'Teardown of the Viper V3' }, 'teardown_review'],
  [{ title: 'Review and benchmark results', pathname: '/review' }, 'lab_review'],
  [{ pathname: '/datasheet' }, 'spec'],
  [{ pathname: '/support/download' }, 'support'],
  [{ pathname: '/product/viper-v3-pro' }, 'product_page'],
  [{ pathname: '/random-page', title: 'Random title' }, 'other'],
  [{}, 'other'],
];

for (const [input, expected] of guessDocKindCases) {
  test(`guessDocKind: ${JSON.stringify(input)} → ${expected}`, () => {
    assert.equal(guessDocKind(input), expected);
  });
}

// ---------------------------------------------------------------------------
// normalizeDocHint / docHintMatchesDocKind
// ---------------------------------------------------------------------------

test('normalizeDocHint: normalizes whitespace and hyphens to underscores', () => {
  assert.equal(normalizeDocHint('manual pdf'), 'manual_pdf');
  assert.equal(normalizeDocHint('lab-review'), 'lab_review');
  assert.equal(normalizeDocHint(''), '');
  assert.equal(normalizeDocHint(null), '');
});

test('docHintMatchesDocKind: exact match', () => {
  assert.equal(docHintMatchesDocKind('spec', 'spec'), true);
});

test('docHintMatchesDocKind: cross-match via map', () => {
  assert.equal(docHintMatchesDocKind('manual', 'manual_pdf'), true);
  assert.equal(docHintMatchesDocKind('manual', 'support'), true);
  assert.equal(docHintMatchesDocKind('review', 'lab_review'), true);
  assert.equal(docHintMatchesDocKind('pdf', 'spec_pdf'), true);
});

test('docHintMatchesDocKind: returns false for empty/unknown', () => {
  assert.equal(docHintMatchesDocKind('', 'spec'), false);
  assert.equal(docHintMatchesDocKind('spec', ''), false);
  assert.equal(docHintMatchesDocKind('unknown', 'spec'), false);
});

// ---------------------------------------------------------------------------
// isLowSignalDiscoveryPath
// ---------------------------------------------------------------------------

test('isLowSignalDiscoveryPath: root path is low signal', () => {
  assert.equal(isLowSignalDiscoveryPath(new URL('https://example.com/')), true);
  assert.equal(isLowSignalDiscoveryPath(new URL('https://example.com/index.html')), true);
});

test('isLowSignalDiscoveryPath: RSS/XML paths are low signal', () => {
  assert.equal(isLowSignalDiscoveryPath(new URL('https://example.com/feed.xml')), true);
  assert.equal(isLowSignalDiscoveryPath(new URL('https://example.com/feed.rss')), true);
});

test('isLowSignalDiscoveryPath: search pages are low signal', () => {
  assert.equal(isLowSignalDiscoveryPath(new URL('https://example.com/search?q=test')), true);
});

test('isLowSignalDiscoveryPath: Amazon search is low signal', () => {
  assert.equal(isLowSignalDiscoveryPath(new URL('https://www.amazon.com/s?k=mouse')), true);
  assert.equal(isLowSignalDiscoveryPath(new URL('https://www.amazon.com/gp/search/something')), true);
});

test('isLowSignalDiscoveryPath: product path is not low signal', () => {
  assert.equal(isLowSignalDiscoveryPath(new URL('https://razer.com/product/viper-v3-pro')), false);
});

// ---------------------------------------------------------------------------
// Forum detection
// ---------------------------------------------------------------------------

test('isForumLikeDomainClassification: recognizes forum types', () => {
  assert.equal(isForumLikeDomainClassification('forum'), true);
  assert.equal(isForumLikeDomainClassification('community'), true);
  assert.equal(isForumLikeDomainClassification('discussion'), true);
  assert.equal(isForumLikeDomainClassification('user_generated'), true);
  assert.equal(isForumLikeDomainClassification('manufacturer'), false);
  assert.equal(isForumLikeDomainClassification(''), false);
});

test('FORUM_SUBDOMAIN_LABELS: expected entries', () => {
  assert.ok(FORUM_SUBDOMAIN_LABELS.has('community'));
  assert.ok(FORUM_SUBDOMAIN_LABELS.has('forum'));
  assert.ok(FORUM_SUBDOMAIN_LABELS.has('forums'));
  assert.ok(FORUM_SUBDOMAIN_LABELS.has('insider'));
  assert.ok(!FORUM_SUBDOMAIN_LABELS.has('store'));
});

test('isForumLikeManufacturerSubdomain: detects forum subdomains', () => {
  assert.equal(isForumLikeManufacturerSubdomain('community.razer.com'), true);
  assert.equal(isForumLikeManufacturerSubdomain('forum.logitech.com'), true);
  assert.equal(isForumLikeManufacturerSubdomain('insider.razer.com'), true);
});

test('isForumLikeManufacturerSubdomain: ignores non-forum subdomains', () => {
  assert.equal(isForumLikeManufacturerSubdomain('store.razer.com'), false);
  assert.equal(isForumLikeManufacturerSubdomain('razer.com'), false);
  assert.equal(isForumLikeManufacturerSubdomain(''), false);
});

// ---------------------------------------------------------------------------
// Sibling manufacturer product page detection
// ---------------------------------------------------------------------------

test('DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS: has expected tokens', () => {
  assert.ok(DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS.has('buy'));
  assert.ok(DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS.has('product'));
  assert.ok(DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS.has('gaming'));
  assert.ok(!DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS.has('viper'));
});

test('resolveProductPathAnchor: extracts last meaningful segment', () => {
  assert.equal(resolveProductPathAnchor('/product/viper-v3-pro'), 'viper-v3-pro');
  assert.equal(resolveProductPathAnchor('/'), '');
  assert.equal(resolveProductPathAnchor(''), '');
});

test('resolveProductPathAnchor: combines when last is ignore token', () => {
  assert.equal(resolveProductPathAnchor('/viper-v3-pro/buy'), 'viper-v3-pro-buy');
});

test('buildProductPathTokenSignature: extracts alpha and numeric sets', () => {
  const sig = buildProductPathTokenSignature('viper-v3-pro');
  assert.ok(sig.alpha instanceof Set);
  assert.ok(sig.numeric instanceof Set);
  assert.ok(sig.numeric.has('3'));
  assert.ok(sig.alpha.has('viper'));
});

test('detectSiblingManufacturerProductPage: returns false for non-manufacturer', () => {
  assert.equal(detectSiblingManufacturerProductPage({
    row: { role: 'review', path: '/product/viper-v2' },
    variables: { model: 'Viper V3', variant: 'Pro', brand: 'Razer' }
  }), false);
});

test('detectSiblingManufacturerProductPage: detects sibling product', () => {
  assert.equal(detectSiblingManufacturerProductPage({
    row: { role: 'manufacturer', path: '/product/viper-v2' },
    variables: { model: 'Viper V3', variant: 'Pro', brand: 'Razer' }
  }), true);
});

test('detectSiblingManufacturerProductPage: returns false for exact match', () => {
  assert.equal(detectSiblingManufacturerProductPage({
    row: { role: 'manufacturer', path: '/product/viper-v3-pro' },
    variables: { model: 'Viper V3', variant: 'Pro', brand: 'Razer' }
  }), false);
});

// ---------------------------------------------------------------------------
// resolveDiscoveryAdmissionExclusionReason
// ---------------------------------------------------------------------------

test('resolveDiscoveryAdmissionExclusionReason: empty for normal row', () => {
  assert.equal(resolveDiscoveryAdmissionExclusionReason({
    row: { host: 'rtings.com', role: 'review' },
    variables: { model: 'Viper V3', brand: 'Razer' }
  }), '');
});

test('resolveDiscoveryAdmissionExclusionReason: forum_subdomain', () => {
  assert.equal(resolveDiscoveryAdmissionExclusionReason({
    row: { host: 'community.razer.com', role: 'manufacturer' },
    variables: { model: 'Viper V3', brand: 'Razer' }
  }), 'forum_subdomain');
});

test('resolveDiscoveryAdmissionExclusionReason: forum_classification', () => {
  const safetyMap = new Map([['forums.example.com', { classification: 'forum' }]]);
  assert.equal(resolveDiscoveryAdmissionExclusionReason({
    row: { host: 'forums.example.com', role: 'review' },
    domainSafetyResults: safetyMap,
    variables: { model: 'Viper V3', brand: 'Razer' }
  }), 'forum_classification');
});

test('resolveDiscoveryAdmissionExclusionReason: multi_model_hint', () => {
  assert.equal(resolveDiscoveryAdmissionExclusionReason({
    row: { host: 'techradar.com', role: 'review', multi_model_hint: true },
    variables: { model: 'Viper V3', brand: 'Razer' }
  }), 'multi_model_hint');
});

test('resolveDiscoveryAdmissionExclusionReason: multi_model_hint allowed for manufacturer', () => {
  assert.equal(resolveDiscoveryAdmissionExclusionReason({
    row: { host: 'razer.com', role: 'manufacturer', multi_model_hint: true },
    variables: { model: 'Viper V3', brand: 'Razer' }
  }), '');
});

// ---------------------------------------------------------------------------
// isRelevantSearchResult
// ---------------------------------------------------------------------------

test('isRelevantSearchResult: plan provider goes through normal relevance checks (no bypass)', () => {
  // WHY: plan-provider bypass removed — root path is low signal, so this returns false
  assert.equal(isRelevantSearchResult({
    parsed: new URL('https://example.com/'),
    raw: { provider: 'plan' },
    classified: {},
    variables: { brand: 'Razer', model: 'Viper V3' }
  }), false);
});

test('isRelevantSearchResult: manufacturer role always relevant', () => {
  assert.equal(isRelevantSearchResult({
    parsed: new URL('https://razer.com/'),
    raw: {},
    classified: { role: 'manufacturer' },
    variables: { brand: 'Razer', model: 'Viper V3' }
  }), true);
});

test('isRelevantSearchResult: low signal path is irrelevant', () => {
  assert.equal(isRelevantSearchResult({
    parsed: new URL('https://example.com/'),
    raw: { provider: 'google' },
    classified: { role: 'review' },
    variables: { brand: 'Razer', model: 'Viper V3' }
  }), false);
});

test('isRelevantSearchResult: matching brand+model is relevant', () => {
  assert.equal(isRelevantSearchResult({
    parsed: new URL('https://rtings.com/razer-viper-review'),
    raw: { provider: 'google', title: 'Razer Viper V3 Review' },
    classified: { role: 'review' },
    variables: { brand: 'Razer', model: 'Viper V3' }
  }), true);
});

// ---------------------------------------------------------------------------
// collectDomainClassificationSeeds
// ---------------------------------------------------------------------------

test('collectDomainClassificationSeeds: from search result rows', () => {
  const seeds = collectDomainClassificationSeeds({
    searchResultRows: [
      { host: 'rtings.com' },
      { host: 'razer.com' },
      { host: 'rtings.com' }  // duplicate
    ]
  });
  assert.ok(seeds.includes('rtings.com'));
  assert.ok(seeds.includes('razer.com'));
  assert.equal(seeds.length, 2); // deduplicated
});

test('collectDomainClassificationSeeds: falls back to host plan', () => {
  const seeds = collectDomainClassificationSeeds({
    searchResultRows: [],
    effectiveHostPlan: {
      host_groups: [
        { host: 'rtings.com', searchable: true },
        { host: 'blocked.com', searchable: false }
      ]
    }
  });
  assert.ok(seeds.includes('rtings.com'));
  assert.ok(!seeds.includes('blocked.com'));
});

test('collectDomainClassificationSeeds: falls back to brand resolution', () => {
  const seeds = collectDomainClassificationSeeds({
    searchResultRows: [],
    effectiveHostPlan: null,
    brandResolution: {
      officialDomain: 'razer.com',
      supportDomain: 'support.razer.com',
      aliases: ['store.razer.com']
    }
  });
  assert.ok(seeds.includes('razer.com'));
  assert.ok(seeds.includes('support.razer.com'));
  assert.ok(seeds.includes('store.razer.com'));
});

test('collectDomainClassificationSeeds: empty input returns empty', () => {
  const seeds = collectDomainClassificationSeeds({});
  assert.deepStrictEqual(seeds, []);
});

// ---------------------------------------------------------------------------
// classifyUrlCandidate
// ---------------------------------------------------------------------------

test('classifyUrlCandidate: produces expected shape', () => {
  const categoryConfig = {
    sourceHosts: [{ host: 'rtings.com', role: 'review' }]
  };
  const result = classifyUrlCandidate(
    { url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro', title: 'Razer Viper V3 Pro', snippet: 'Review' },
    categoryConfig,
    { identityLock: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' } }
  );
  assert.equal(typeof result.url, 'string');
  assert.equal(typeof result.host, 'string');
  assert.equal(typeof result.doc_kind_guess, 'string');
  assert.equal(typeof result.identity_match_level, 'string');
  assert.equal(typeof result.variant_guard_hit, 'boolean');
  assert.equal(typeof result.multi_model_hint, 'boolean');
  assert.ok(['strong', 'partial', 'weak', 'none'].includes(result.identity_match_level));
});

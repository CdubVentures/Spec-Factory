/**
 * Tests for discoveryIdentity.js — Phase 1 extraction from searchDiscovery.js.
 * Covers all exported pure functions with table-driven cases.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHost,
  slug,
  tokenize,
  compactToken,
  toArray,
  uniqueTokens,
  countTokenHits,
  resolveJobIdentity,
  productText,
  normalizeIdentityTokens,
  buildModelSlugCandidates,
  categoryPathSegments,
  manufacturerHostHintsForBrand,
  manufacturerHostMatchesBrand,
  containsGuardToken,
  extractDigitGroups,
  extractQueryModelLikeTokens,
  isLikelyUnitToken,
  GENERIC_MODEL_TOKENS,
  BRAND_HOST_HINTS,
} from '../src/features/indexing/discovery/discoveryIdentity.js';

// ---------------------------------------------------------------------------
// normalizeHost
// ---------------------------------------------------------------------------

test('normalizeHost: strips www and lowercases', () => {
  assert.equal(normalizeHost('www.Example.COM'), 'example.com');
  assert.equal(normalizeHost('RAZER.COM'), 'razer.com');
  assert.equal(normalizeHost(''), '');
  assert.equal(normalizeHost(null), '');
  assert.equal(normalizeHost(undefined), '');
});

// ---------------------------------------------------------------------------
// slug
// ---------------------------------------------------------------------------

test('slug: converts to lowercase hyphenated tokens', () => {
  assert.equal(slug('Razer Viper V3 Pro'), 'razer-viper-v3-pro');
  assert.equal(slug(''), '');
  assert.equal(slug(null), '');
  assert.equal(slug('---hello---'), 'hello');
  assert.equal(slug('A  B  C'), 'a-b-c');
});

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

test('tokenize: splits into 3+ char lowercase tokens', () => {
  assert.deepStrictEqual(tokenize('Razer Viper V3 Pro'), ['razer', 'viper', 'pro']);
  assert.deepStrictEqual(tokenize(''), []);
  assert.deepStrictEqual(tokenize('AB'), []); // too short
  assert.deepStrictEqual(tokenize('abc def'), ['abc', 'def']);
});

// ---------------------------------------------------------------------------
// compactToken
// ---------------------------------------------------------------------------

test('compactToken: strips non-alphanumeric', () => {
  assert.equal(compactToken('Viper-V3-Pro'), 'viperv3pro');
  assert.equal(compactToken(''), '');
  assert.equal(compactToken(null), '');
});

// ---------------------------------------------------------------------------
// toArray
// ---------------------------------------------------------------------------

test('toArray: returns array or empty', () => {
  assert.deepStrictEqual(toArray([1, 2]), [1, 2]);
  assert.deepStrictEqual(toArray(null), []);
  assert.deepStrictEqual(toArray(undefined), []);
  assert.deepStrictEqual(toArray('string'), []);
  assert.deepStrictEqual(toArray(42), []);
});

// ---------------------------------------------------------------------------
// uniqueTokens
// ---------------------------------------------------------------------------

test('uniqueTokens: deduplicates and caps', () => {
  assert.deepStrictEqual(uniqueTokens(['a', 'b', 'a', 'c'], 10), ['a', 'b', 'c']);
  assert.deepStrictEqual(uniqueTokens(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
  assert.deepStrictEqual(uniqueTokens([], 5), []);
  assert.deepStrictEqual(uniqueTokens(['', null, undefined]), []);
});

// ---------------------------------------------------------------------------
// countTokenHits
// ---------------------------------------------------------------------------

test('countTokenHits: counts matching tokens in haystack', () => {
  assert.equal(countTokenHits('razer viper v3 pro gaming mouse', ['razer', 'viper']), 2);
  assert.equal(countTokenHits('razer viper', ['logitech']), 0);
  assert.equal(countTokenHits('', ['razer']), 0);
  assert.equal(countTokenHits('razer', []), 0);
});

// ---------------------------------------------------------------------------
// resolveJobIdentity
// ---------------------------------------------------------------------------

test('resolveJobIdentity: extracts from identityLock first', () => {
  const result = resolveJobIdentity({
    brand: 'FallbackBrand',
    model: 'FallbackModel',
    identityLock: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' },
  });
  assert.equal(result.brand, 'Razer');
  assert.equal(result.model, 'Viper V3');
  assert.equal(result.variant, 'Pro');
});

test('resolveJobIdentity: falls back to job fields', () => {
  const result = resolveJobIdentity({ brand: 'Razer', model: 'Viper' });
  assert.equal(result.brand, 'Razer');
  assert.equal(result.model, 'Viper');
  assert.equal(result.variant, '');
});

test('resolveJobIdentity: handles empty/undefined', () => {
  const result = resolveJobIdentity();
  assert.equal(result.brand, '');
  assert.equal(result.model, '');
  assert.equal(result.variant, '');
});

// ---------------------------------------------------------------------------
// productText
// ---------------------------------------------------------------------------

test('productText: joins brand+model+variant', () => {
  assert.equal(productText({ brand: 'Razer', model: 'Viper V3', variant: 'Pro' }), 'Razer Viper V3 Pro');
  assert.equal(productText({ brand: 'Razer' }), 'Razer');
  assert.equal(productText({}), '');
  assert.equal(productText(), '');
});

// ---------------------------------------------------------------------------
// normalizeIdentityTokens
// ---------------------------------------------------------------------------

test('normalizeIdentityTokens: separates brand from model tokens, excludes generic', () => {
  const result = normalizeIdentityTokens({ brand: 'Razer', model: 'Viper V3', variant: 'Pro' });
  assert.deepStrictEqual(result.brandTokens, ['razer']);
  // "pro" is in GENERIC_MODEL_TOKENS, "viper" is model
  assert.ok(result.modelTokens.includes('viper'));
  assert.ok(!result.modelTokens.includes('pro'));
  assert.ok(!result.modelTokens.includes('razer'));
});

// ---------------------------------------------------------------------------
// buildModelSlugCandidates
// ---------------------------------------------------------------------------

test('buildModelSlugCandidates: produces unique slug variations', () => {
  const result = buildModelSlugCandidates({ brand: 'Razer', model: 'Viper V3', variant: 'Pro' });
  assert.ok(result.length > 0);
  assert.ok(result.length <= 6);
  // All slugs should be lowercase with hyphens
  for (const s of result) {
    assert.ok(/^[a-z0-9-]+$/.test(s), `slug "${s}" should match pattern`);
  }
  // Should not have duplicates
  assert.equal(result.length, new Set(result).size);
});

test('buildModelSlugCandidates: respects cap', () => {
  const result = buildModelSlugCandidates({ brand: 'A', model: 'B', variant: 'C' }, 2);
  assert.ok(result.length <= 2);
});

// ---------------------------------------------------------------------------
// categoryPathSegments
// ---------------------------------------------------------------------------

test('categoryPathSegments: known categories', () => {
  assert.deepStrictEqual(categoryPathSegments('mouse'), ['mouse', 'mice', 'gaming-mice']);
  assert.deepStrictEqual(categoryPathSegments('keyboard'), ['keyboard', 'keyboards', 'gaming-keyboards']);
  assert.deepStrictEqual(categoryPathSegments('headset'), ['headset', 'headsets', 'gaming-headsets']);
});

test('categoryPathSegments: unknown category gets singular+plural', () => {
  const result = categoryPathSegments('monitor');
  assert.deepStrictEqual(result, ['monitor', 'monitors']);
});

test('categoryPathSegments: empty returns empty', () => {
  assert.deepStrictEqual(categoryPathSegments(''), []);
  assert.deepStrictEqual(categoryPathSegments(null), []);
});

// ---------------------------------------------------------------------------
// manufacturerHostHintsForBrand
// ---------------------------------------------------------------------------

test('manufacturerHostHintsForBrand: resolves known brands with aliases', () => {
  const razer = manufacturerHostHintsForBrand('Razer');
  assert.ok(razer.includes('razer'));

  const logitech = manufacturerHostHintsForBrand('Logitech');
  assert.ok(logitech.includes('logitech'));
  assert.ok(logitech.includes('logitechg'));
  assert.ok(logitech.includes('logi'));
});

test('manufacturerHostHintsForBrand: unknown brand returns tokenized brand', () => {
  const result = manufacturerHostHintsForBrand('Obscure Brand Name');
  assert.ok(result.includes('obscure'));
  assert.ok(result.includes('brand'));
  assert.ok(result.includes('name'));
});

// ---------------------------------------------------------------------------
// manufacturerHostMatchesBrand
// ---------------------------------------------------------------------------

test('manufacturerHostMatchesBrand: matches when host contains hint', () => {
  assert.equal(manufacturerHostMatchesBrand('razer.com', ['razer']), true);
  assert.equal(manufacturerHostMatchesBrand('store.razer.com', ['razer']), true);
  assert.equal(manufacturerHostMatchesBrand('logitech.com', ['razer']), false);
});

test('manufacturerHostMatchesBrand: returns true for empty hints', () => {
  assert.equal(manufacturerHostMatchesBrand('anything.com', []), true);
});

// ---------------------------------------------------------------------------
// containsGuardToken
// ---------------------------------------------------------------------------

test('containsGuardToken: checks haystack and compact form', () => {
  assert.equal(containsGuardToken('razer viper v3', 'razerviperv3', 'razer'), true);
  assert.equal(containsGuardToken('razer viper v3', 'razerviperv3', 'logitech'), false);
  assert.equal(containsGuardToken('razer viper v3', 'razerviperv3', 'viper-v3'), true); // compact match
  assert.equal(containsGuardToken('', '', ''), false);
});

// ---------------------------------------------------------------------------
// extractDigitGroups
// ---------------------------------------------------------------------------

test('extractDigitGroups: extracts 2+ digit groups', () => {
  assert.deepStrictEqual(extractDigitGroups('Viper V3 Pro 2024'), ['2024']);
  assert.deepStrictEqual(extractDigitGroups('no digits'), []);
  assert.deepStrictEqual(extractDigitGroups('12 34'), ['12', '34']);
});

// ---------------------------------------------------------------------------
// extractQueryModelLikeTokens
// ---------------------------------------------------------------------------

test('extractQueryModelLikeTokens: finds alpha+digit tokens >=3 chars', () => {
  const result = extractQueryModelLikeTokens('razer viper v3 pro 2024 abc123');
  assert.ok(result.includes('abc123'));
  // "v3" is only 2 chars — should not be included
  assert.ok(!result.includes('v3'));
});

// ---------------------------------------------------------------------------
// isLikelyUnitToken
// ---------------------------------------------------------------------------

test('isLikelyUnitToken: recognizes common unit patterns', () => {
  assert.equal(isLikelyUnitToken('8000dpi'), true);
  assert.equal(isLikelyUnitToken('1000hz'), true);
  assert.equal(isLikelyUnitToken('80g'), true);
  assert.equal(isLikelyUnitToken('500ms'), true);
  assert.equal(isLikelyUnitToken('viper'), false);
  assert.equal(isLikelyUnitToken(''), false);
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('GENERIC_MODEL_TOKENS: contains expected entries', () => {
  assert.ok(GENERIC_MODEL_TOKENS.has('gaming'));
  assert.ok(GENERIC_MODEL_TOKENS.has('pro'));
  assert.ok(GENERIC_MODEL_TOKENS.has('wireless'));
  assert.ok(!GENERIC_MODEL_TOKENS.has('razer'));
});

test('BRAND_HOST_HINTS: has expected brand mappings', () => {
  assert.ok(BRAND_HOST_HINTS.razer);
  assert.ok(BRAND_HOST_HINTS.logitech);
  assert.ok(Array.isArray(BRAND_HOST_HINTS.logitech));
});

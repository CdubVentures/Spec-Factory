import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAND_HOST_HINTS,
  BRAND_DOMAIN_OVERRIDES,
  BRAND_PREFIXED_CATEGORY_HOSTS,
  manufacturerHostHintsForBrand,
  manufacturerSeedHostsForBrand,
  buildAllowedCategoryProductSlugs
} from '../src/planner/sourcePlannerBrandConfig.js';

// --- BRAND_HOST_HINTS ---

test('BRAND_HOST_HINTS contains expected brand entries', () => {
  assert.ok(BRAND_HOST_HINTS.logitech.includes('logitechg'));
  assert.ok(BRAND_HOST_HINTS.razer.includes('razer'));
  assert.ok(BRAND_HOST_HINTS.cooler.includes('coolermaster'));
  assert.ok(BRAND_HOST_HINTS.asus.includes('rog'));
});

// --- BRAND_DOMAIN_OVERRIDES ---

test('BRAND_DOMAIN_OVERRIDES maps brands to seed domains', () => {
  assert.deepEqual(BRAND_DOMAIN_OVERRIDES.logitech, ['logitechg.com', 'logitech.com']);
  assert.deepEqual(BRAND_DOMAIN_OVERRIDES.alienware, ['alienware.com', 'dell.com']);
});

// --- BRAND_PREFIXED_CATEGORY_HOSTS ---

test('BRAND_PREFIXED_CATEGORY_HOSTS contains razer.com', () => {
  assert.equal(BRAND_PREFIXED_CATEGORY_HOSTS.has('razer.com'), true);
  assert.equal(BRAND_PREFIXED_CATEGORY_HOSTS.size, 1);
});

// --- manufacturerHostHintsForBrand ---

test('manufacturerHostHintsForBrand resolves Logitech hints with aliases', () => {
  const hints = manufacturerHostHintsForBrand('Logitech');
  assert.ok(hints.includes('logitechg'), 'should include logitechg alias');
  // WHY: raw token "logitech" is suppressed by partial-token cleanup since aliases exist
  assert.ok(!hints.includes('logitech'), 'raw token logitech should be suppressed');
  assert.ok(hints.includes('logi'), 'should include logi alias');
});

test('manufacturerHostHintsForBrand resolves Razer hints', () => {
  const hints = manufacturerHostHintsForBrand('Razer');
  assert.ok(hints.includes('razer'));
});

test('manufacturerHostHintsForBrand suppresses partial raw tokens for multi-word brands', () => {
  const hints = manufacturerHostHintsForBrand('Cooler Master');
  assert.ok(hints.includes('coolermaster'), 'should include coolermaster alias');
  assert.ok(!hints.includes('cooler'), 'should suppress partial "cooler" token');
  assert.ok(!hints.includes('master'), 'should suppress partial "master" token');
});

test('manufacturerHostHintsForBrand returns raw tokens for unknown brands', () => {
  const hints = manufacturerHostHintsForBrand('Acme Corp');
  assert.ok(hints.includes('acme'));
  assert.ok(hints.includes('corp'));
});

test('manufacturerHostHintsForBrand handles empty input', () => {
  assert.deepEqual(manufacturerHostHintsForBrand(''), []);
});

// --- manufacturerSeedHostsForBrand ---

test('manufacturerSeedHostsForBrand uses domain overrides for Logitech', () => {
  const hints = ['logitech', 'logitechg', 'logi'];
  const seeds = manufacturerSeedHostsForBrand('Logitech', hints);
  assert.ok(seeds.includes('logitechg.com'));
  assert.ok(seeds.includes('logitech.com'));
});

test('manufacturerSeedHostsForBrand filters generic tokens', () => {
  const seeds = manufacturerSeedHostsForBrand('Logitech', ['logi', 'gaming', 'mice']);
  assert.ok(!seeds.some((s) => s === 'logi.com'), 'logi should be filtered');
  assert.ok(!seeds.some((s) => s === 'gaming.com'), 'gaming should be filtered');
  assert.ok(!seeds.some((s) => s === 'mice.com'), 'mice should be filtered');
});

test('manufacturerSeedHostsForBrand generates .com domains from hints for unknown brands', () => {
  const seeds = manufacturerSeedHostsForBrand('Acme', ['acme']);
  assert.ok(seeds.includes('acme.com'));
});

test('manufacturerSeedHostsForBrand handles empty input', () => {
  assert.deepEqual(manufacturerSeedHostsForBrand('', []), []);
});

// --- buildAllowedCategoryProductSlugs ---

test('buildAllowedCategoryProductSlugs creates slug variants', () => {
  const result = buildAllowedCategoryProductSlugs({
    brand: 'Razer',
    modelSlug: 'viper-v3-pro'
  });
  assert.ok(result.includes('viper-v3-pro'));
  assert.ok(result.includes('razer-viper-v3-pro'));
});

test('buildAllowedCategoryProductSlugs omits brand prefix when already present', () => {
  const result = buildAllowedCategoryProductSlugs({
    brand: 'Razer',
    modelSlug: 'razer-viper-v3-pro'
  });
  assert.deepEqual(result, ['razer-viper-v3-pro']);
});

test('buildAllowedCategoryProductSlugs returns empty for no model slug', () => {
  assert.deepEqual(buildAllowedCategoryProductSlugs({ brand: 'Razer', modelSlug: '' }), []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReviewItemAttributes,
  resolveFieldRulesEntries,
  resolveReviewEnabledEnumFieldSet,
  makerTokensFromReviewItem,
  reviewItemMatchesMakerLane,
  componentLaneSlug,
  isTestModeCategory,
  discoveredFromSource,
  normalizeDiscoveryRows,
  enforceNonDiscoveredRows,
  resolveDeclaredComponentPropertyColumns,
  mergePropertyColumns,
} from '../src/review/componentReviewHelpers.js';

// ── parseReviewItemAttributes ───────────────────────────────────────

test('parseReviewItemAttributes parses object, JSON string, and rejects invalid', () => {
  assert.deepEqual(parseReviewItemAttributes({ product_attributes: { a: 1 } }), { a: 1 });
  assert.deepEqual(parseReviewItemAttributes({ product_attributes: '{"b":2}' }), { b: 2 });
  assert.deepEqual(parseReviewItemAttributes({ product_attributes: 'bad-json' }), {});
  assert.deepEqual(parseReviewItemAttributes({ product_attributes: null }), {});
  assert.deepEqual(parseReviewItemAttributes({}), {});
  assert.deepEqual(parseReviewItemAttributes(null), {});
});

// ── resolveFieldRulesEntries ────────────────────────────────────────

test('resolveFieldRulesEntries finds fields at multiple nesting levels', () => {
  assert.deepEqual(resolveFieldRulesEntries({ rules: { fields: { a: 1 } } }), { a: 1 });
  assert.deepEqual(resolveFieldRulesEntries({ fields: { b: 2 } }), { b: 2 });
  assert.deepEqual(resolveFieldRulesEntries(null), {});
  assert.deepEqual(resolveFieldRulesEntries({}), {});
});

// ── componentLaneSlug ───────────────────────────────────────────────

test('componentLaneSlug combines name and maker', () => {
  assert.equal(componentLaneSlug('PAW 3950', 'PixArt'), 'paw-3950_pixart');
  assert.equal(componentLaneSlug('TTC Gold', ''), 'ttc-gold_na');
  assert.equal(componentLaneSlug('FOX 50', null), 'fox-50_na');
});

// ── isTestModeCategory ──────────────────────────────────────────────

test('isTestModeCategory detects test categories', () => {
  assert.equal(isTestModeCategory('_test_mouse'), true);
  assert.equal(isTestModeCategory('_TEST_kb'), true);
  assert.equal(isTestModeCategory('mouse'), false);
  assert.equal(isTestModeCategory(''), false);
  assert.equal(isTestModeCategory(null), false);
});

// ── discoveredFromSource ────────────────────────────────────────────

test('discoveredFromSource recognizes pipeline sources', () => {
  assert.equal(discoveredFromSource('pipeline'), true);
  assert.equal(discoveredFromSource('Pipeline'), true);
  assert.equal(discoveredFromSource('reference'), false);
  assert.equal(discoveredFromSource('user'), false);
  assert.equal(discoveredFromSource(''), false);
});

// ── normalizeDiscoveryRows ──────────────────────────────────────────

test('normalizeDiscoveryRows normalizes source and infers discovered flag', () => {
  const rows = [
    { discovery_source: 'pipeline', name: 'a' },
    { discovery_source: 'reference', discovered: false, name: 'b' },
  ];
  const result = normalizeDiscoveryRows(rows);
  assert.equal(result[0].discovered, true);
  assert.equal(result[1].discovered, false);
});

// ── enforceNonDiscoveredRows ────────────────────────────────────────

test('enforceNonDiscoveredRows caps non-discovered in test mode', () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({
    discovery_source: 'reference',
    discovered: false,
    name: `item-${i}`,
  }));
  const result = enforceNonDiscoveredRows(rows, '_test_mouse');
  const nonDiscovered = result.filter((r) => !r.discovered);
  assert.equal(nonDiscovered.length <= 3, true);
});

test('enforceNonDiscoveredRows passes through in non-test mode', () => {
  const rows = [{ discovery_source: 'reference', discovered: false }];
  const result = enforceNonDiscoveredRows(rows, 'mouse');
  assert.equal(result[0].discovered, false);
});

// ── resolveDeclaredComponentPropertyColumns ─────────────────────────

test('resolveDeclaredComponentPropertyColumns extracts property keys from field rules', () => {
  const fieldRules = {
    rules: {
      fields: {
        dpi: {
          component: { type: 'sensor', match: { property_keys: ['dpi', 'max_dpi'] } }
        },
        weight: {}
      }
    }
  };
  const cols = resolveDeclaredComponentPropertyColumns({ fieldRules, componentType: 'sensor' });
  assert.deepEqual(cols, ['dpi', 'max_dpi']);
});

test('resolveDeclaredComponentPropertyColumns returns empty for missing type', () => {
  assert.deepEqual(resolveDeclaredComponentPropertyColumns({ fieldRules: {}, componentType: '' }), []);
  assert.deepEqual(resolveDeclaredComponentPropertyColumns(), []);
});

// ── mergePropertyColumns ────────────────────────────────────────────

test('mergePropertyColumns merges and deduplicates columns', () => {
  assert.deepEqual(mergePropertyColumns(['dpi', 'ips'], ['ips', 'acceleration']), ['acceleration', 'dpi', 'ips']);
  assert.deepEqual(mergePropertyColumns([], []), []);
  assert.deepEqual(mergePropertyColumns(['__hidden'], ['visible']), ['hidden', 'visible']);
});

// ── makerTokensFromReviewItem ───────────────────────────────────────

test('makerTokensFromReviewItem extracts maker tokens from attributes and ai_suggested_maker', () => {
  const item = {
    product_attributes: { sensor_brand: 'PixArt', brand: 'Razer' },
    ai_suggested_maker: 'PixArt',
  };
  const tokens = makerTokensFromReviewItem(item, 'sensor');
  assert.equal(tokens.includes('pixart'), true);
  assert.equal(tokens.includes('razer'), true);
});

test('makerTokensFromReviewItem returns empty for missing attributes', () => {
  assert.deepEqual(makerTokensFromReviewItem({}, 'sensor'), []);
  assert.deepEqual(makerTokensFromReviewItem(null, 'sensor'), []);
});

// ── reviewItemMatchesMakerLane ──────────────────────────────────────

test('reviewItemMatchesMakerLane matches by maker token', () => {
  const item = { product_attributes: { sensor_brand: 'PixArt' } };
  assert.equal(reviewItemMatchesMakerLane(item, { componentType: 'sensor', maker: 'PixArt' }), true);
  assert.equal(reviewItemMatchesMakerLane(item, { componentType: 'sensor', maker: 'TTC' }), false);
});

test('reviewItemMatchesMakerLane empty maker matches makerless items', () => {
  assert.equal(reviewItemMatchesMakerLane({}, { componentType: 'sensor', maker: '' }), true);
  assert.equal(reviewItemMatchesMakerLane(
    { product_attributes: { sensor_brand: 'PixArt' } },
    { componentType: 'sensor', maker: '' }
  ), false);
});

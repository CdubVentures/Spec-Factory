/**
 * Variant ID stamping — contract tests.
 *
 * Verifies the enrichment pattern: after buildVariantList produces
 * variants from CEF selected data, variant_id from the variant_registry
 * is attached to each variant object.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVariantList } from '../productImageFinder.js';

/* ── Enrichment pattern (same logic as orchestrator) ──────────── */

function enrichVariantsFromRegistry(allVariants, variantRegistry) {
  const registryMap = new Map(
    (variantRegistry || []).map(r => [r.variant_key, r.variant_id]),
  );
  for (const v of allVariants) {
    v.variant_id = registryMap.get(v.key) || null;
  }
  return allVariants;
}

/* ── Factories ──────────────────────────────────────────────────── */

function makeRegistry(entries = []) {
  return entries.map(([key, id]) => ({ variant_key: key, variant_id: id }));
}

describe('variant_id enrichment from registry', () => {

  it('attaches variant_id when registry has matching key', () => {
    const variants = buildVariantList({ colors: ['black', 'white'], colorNames: {}, editions: {} });
    const registry = makeRegistry([
      ['color:black', 'v_aaa11111'],
      ['color:white', 'v_bbb22222'],
    ]);

    enrichVariantsFromRegistry(variants, registry);

    assert.equal(variants[0].variant_id, 'v_aaa11111');
    assert.equal(variants[1].variant_id, 'v_bbb22222');
  });

  it('sets null when registry has no matching key', () => {
    const variants = buildVariantList({ colors: ['black'], colorNames: {}, editions: {} });
    const registry = makeRegistry([['color:red', 'v_ccc33333']]);

    enrichVariantsFromRegistry(variants, registry);

    assert.equal(variants[0].variant_id, null);
  });

  it('sets null when registry is empty', () => {
    const variants = buildVariantList({ colors: ['black'], colorNames: {}, editions: {} });

    enrichVariantsFromRegistry(variants, []);

    assert.equal(variants[0].variant_id, null);
  });

  it('sets null when registry is undefined', () => {
    const variants = buildVariantList({ colors: ['black'], colorNames: {}, editions: {} });

    enrichVariantsFromRegistry(variants, undefined);

    assert.equal(variants[0].variant_id, null);
  });

  it('handles edition variants', () => {
    const variants = buildVariantList({
      colors: ['black', 'black+orange'],
      colorNames: {},
      editions: { 'cod-bo6': { display_name: 'COD BO6 Edition', colors: ['black+orange'] } },
    });
    const registry = makeRegistry([
      ['color:black', 'v_aaa11111'],
      ['edition:cod-bo6', 'v_ddd44444'],
    ]);

    enrichVariantsFromRegistry(variants, registry);

    const colorVar = variants.find(v => v.key === 'color:black');
    const editionVar = variants.find(v => v.key === 'edition:cod-bo6');
    assert.equal(colorVar.variant_id, 'v_aaa11111');
    assert.equal(editionVar.variant_id, 'v_ddd44444');
  });

  it('partial registry: some variants get IDs, others get null', () => {
    const variants = buildVariantList({ colors: ['black', 'white', 'red'], colorNames: {}, editions: {} });
    const registry = makeRegistry([['color:black', 'v_aaa11111']]);

    enrichVariantsFromRegistry(variants, registry);

    assert.equal(variants[0].variant_id, 'v_aaa11111');
    assert.equal(variants[1].variant_id, null);
    assert.equal(variants[2].variant_id, null);
  });
});

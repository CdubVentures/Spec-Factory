/**
 * skuLlmAdapter — prompt builder tests.
 *
 * Locks the SKF prompt contract: identity injection, MPN goal section, variant
 * disambiguation, anti-patterns (ASIN / retailer SKU / UPC), evidence-kind
 * guidance via includeEvidenceKind: true, absence of precision-ladder, absence
 * of removed {{SIBLINGS_LINE}} placeholder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSkuFinderPrompt,
  SKF_DEFAULT_TEMPLATE,
  SKU_SOURCE_VARIANT_GUIDANCE_SLOTS,
  SKU_VARIANT_DISAMBIGUATION_SLOTS,
} from '../skuLlmAdapter.js';

function normalizePromptFragment(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function assertPromptIncludesFragments(prompt, fragments, label) {
  const normalizedPrompt = normalizePromptFragment(prompt);
  for (const fragment of fragments) {
    assert.ok(
      normalizedPrompt.includes(normalizePromptFragment(fragment)),
      `${label} fragment should be rendered`,
    );
  }
}

function assertPromptOmitsFragments(prompt, fragments, label) {
  const normalizedPrompt = normalizePromptFragment(prompt);
  for (const fragment of fragments) {
    assert.equal(
      normalizedPrompt.includes(normalizePromptFragment(fragment)),
      false,
      `${label} fragment should not be rendered`,
    );
  }
}

function returnJsonBlock(prompt) {
  const index = prompt.indexOf('Return JSON:');
  assert.ok(index >= 0, 'Return JSON block is present');
  return prompt.slice(index);
}

function assertReturnJsonKeys(prompt, keys) {
  const block = returnJsonBlock(prompt);
  for (const key of keys) {
    assert.match(block, new RegExp(`"${key}"`), `Return JSON includes ${key}`);
  }
}

describe('buildSkuFinderPrompt', () => {
  const product = { brand: 'Logitech', model: 'G Pro X', base_model: 'G Pro X', variant: 'wireless' };

  it('includes brand, model, and variant label in the prompt', () => {
    const prompt = buildSkuFinderPrompt({ product, variantLabel: 'Black', variantType: 'color' });
    assert.ok(prompt.includes('Logitech'), 'brand present');
    assert.ok(prompt.includes('G Pro X'), 'model present');
    assert.ok(prompt.includes('Black'), 'variant label present');
    assert.ok(prompt.includes('color variant'), 'variant type inline');
  });

  it('distinguishes edition variants from colors', () => {
    const colorPrompt = buildSkuFinderPrompt({ product, variantLabel: 'Midnight Black', variantType: 'color' });
    const editionPrompt = buildSkuFinderPrompt({ product, variantLabel: 'CoD: BO6 Edition', variantType: 'edition' });
    assert.ok(colorPrompt.includes('color variant'));
    assert.ok(editionPrompt.includes('edition'));
  });

  it('injects sibling exclusion list via the identity warning', () => {
    const prompt = buildSkuFinderPrompt({
      product, variantLabel: 'Black', variantType: 'color',
      siblingsExcluded: ['G Pro', 'G Pro X Superlight'],
    });
    assert.ok(prompt.includes('G Pro'));
    assert.ok(prompt.includes('G Pro X Superlight'));
  });

  it('scales identity warning with ambiguity level', () => {
    const easy = buildSkuFinderPrompt({ product, variantLabel: 'Black', ambiguityLevel: 'easy' });
    const medium = buildSkuFinderPrompt({ product, variantLabel: 'Black', ambiguityLevel: 'medium', familyModelCount: 4 });
    const hard = buildSkuFinderPrompt({ product, variantLabel: 'Black', ambiguityLevel: 'hard', familyModelCount: 8 });
    assert.notEqual(easy, medium, 'easy and medium identity contexts differ');
    assert.notEqual(medium, hard, 'medium and hard identity contexts differ');
    assertPromptIncludesFragments(medium, ['4', product.brand, product.model], 'medium identity context');
    assertPromptIncludesFragments(hard, ['8', product.brand, product.model], 'hard identity context');
  });

  it('includes previous discovery block when urls_checked present', () => {
    const prompt = buildSkuFinderPrompt({
      product, variantLabel: 'Black',
      previousDiscovery: { urlsChecked: ['https://example.com/a'], queriesRun: ['logitech g pro x MPN'] },
    });
    assert.ok(prompt.includes('Previous searches'));
    assert.ok(prompt.includes('https://example.com/a'));
    assert.ok(prompt.includes('logitech g pro x MPN'));
  });

  it('omits previous discovery when empty', () => {
    const prompt = buildSkuFinderPrompt({
      product, variantLabel: 'Black',
      previousDiscovery: { urlsChecked: [], queriesRun: [] },
    });
    assertPromptOmitsFragments(prompt, ['https://example.com/a', 'logitech g pro x MPN'], 'previous discovery');
  });

  it('uses templateOverride when supplied', () => {
    const prompt = buildSkuFinderPrompt({
      product, variantLabel: 'Black',
      templateOverride: 'CUSTOM PROMPT FOR {{BRAND}} {{MODEL}}',
    });
    assert.equal(prompt, 'CUSTOM PROMPT FOR Logitech G Pro X');
  });

  it('does NOT carry the removed {{SIBLINGS_LINE}} placeholder', () => {
    const prompt = buildSkuFinderPrompt({ product, variantLabel: 'Black' });
    assert.ok(!prompt.includes('{{SIBLINGS_LINE}}'), 'unresolved SIBLINGS_LINE must not appear');
    assert.ok(!SKF_DEFAULT_TEMPLATE.includes('{{SIBLINGS_LINE}}'), 'template must not reference removed placeholder');
  });

  it('default template contains the JSON output specification keyed by "sku"', () => {
    const prompt = buildSkuFinderPrompt({ product, variantLabel: 'Black' });
    assertReturnJsonKeys(prompt, [
      'sku',
      'confidence',
      'evidence_refs',
      'discovery_log',
      'supporting_evidence',
      'evidence_kind',
    ]);
    assert.equal(returnJsonBlock(prompt).includes('"sku_value"'), false, 'uses "sku" key, not "sku_value"');
  });

  it('default template injects the shared evidence fragment (tier taxonomy)', () => {
    const prompt = buildSkuFinderPrompt({ product, variantLabel: 'Black' });
    for (const tier of ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'other']) {
      assert.ok(prompt.includes(tier), `tier "${tier}" present`);
    }
  });

  it('default template injects the evidenceKindGuidance block (via includeEvidenceKind: true)', () => {
    const prompt = buildSkuFinderPrompt({ product, variantLabel: 'Black' });
    // The 10 evidence kinds must be present — confirms includeEvidenceKind wired through.
    for (const kind of [
      'direct_quote', 'structured_metadata', 'byline_timestamp', 'artifact_metadata',
      'visual_inspection', 'lab_measurement', 'comparative_rebadge', 'inferred_reasoning',
      'absence_of_evidence', 'identity_only',
    ]) {
      assert.ok(prompt.includes(kind), `evidence_kind "${kind}" must appear in the guidance block`);
    }
    assert.ok(prompt.includes('supporting_evidence'), 'supporting_evidence rules must be present');
  });

  it('compiled prompt includes the shared stripped-unk sentinel boundary', () => {
    const prompt = buildSkuFinderPrompt({ product, variantLabel: 'Black' });
    assertReturnJsonKeys(prompt, ['sku', 'unknown_reason']);
    assertPromptIncludesFragments(prompt, ['"unk"'], 'unknown sentinel');
  });

  // ── SKF-specific domain contract ──────────────────────────────────

  it('default template defines MPN and distinguishes it from related identifiers', () => {
    assert.ok(/manufacturer part number|MPN/i.test(SKF_DEFAULT_TEMPLATE),
      'must define MPN explicitly');
    assert.ok(/Amazon ASIN|ASIN/i.test(SKF_DEFAULT_TEMPLATE),
      'must call out Amazon ASINs as NOT MPN');
    assert.ok(/UPC|EAN|GTIN/i.test(SKF_DEFAULT_TEMPLATE),
      'must distinguish MPN from UPC/EAN/GTIN barcodes');
    assert.ok(/Best Buy|Newegg|retailer[- ]specific|Retailer.specific/i.test(SKF_DEFAULT_TEMPLATE),
      'must call out retailer-specific SKUs as NOT MPN');
  });

  it('compiled prompt includes a variant-disambiguation algorithm', () => {
    // WHY compiled output: VARIANT DISAMBIGUATION is composed from the shared
    // variantScalarDisambiguation global + SKU_VARIANT_DISAMBIGUATION_SLOTS
    // at build time. Assert the compiled prompt honors the contract, not the
    // raw template (which now has a {{VARIANT_DISAMBIGUATION}} placeholder).
    const prompt = buildSkuFinderPrompt({ product, variantLabel: 'Black' });
    assert.ok(/VARIANT DISAMBIGUATION/i.test(prompt),
      'must have a named VARIANT DISAMBIGUATION section');
    assertPromptIncludesFragments(prompt, [
      SKU_VARIANT_DISAMBIGUATION_SLOTS.RULE2_DISTINCT_SIGNAL,
      SKU_VARIANT_DISAMBIGUATION_SLOTS.RULE3_SHARED_SIGNAL,
    ], 'SKU variant-disambiguation rules');
  });

  it('compiled prompt tags source tiers explicitly', () => {
    // WHY compiled output: source guidance is composed from the shared
    // variantScalarSourceGuidance global + SKU_SOURCE_VARIANT_GUIDANCE_SLOTS.
    const prompt = buildSkuFinderPrompt({ product, variantLabel: 'Black' });
    assertPromptIncludesFragments(prompt, [
      SKU_SOURCE_VARIANT_GUIDANCE_SLOTS.TIER1_CONTENT,
      SKU_SOURCE_VARIANT_GUIDANCE_SLOTS.TIER2_CONTENT,
      SKU_SOURCE_VARIANT_GUIDANCE_SLOTS.TIER3_CONTENT,
    ], 'SKU source-tier guidance');
    for (const tier of ['tier1', 'tier2', 'tier3']) {
      assert.match(prompt, new RegExp(tier, 'i'), `${tier} source tag is present`);
    }
  });

  it('default template does NOT contain RDF-specific date-precision ladder content', () => {
    // SKU is binary: MPN or "unk". No YYYY-MM-DD → YYYY-MM fallback, no
    // "older products yield YYYY" framing.
    assert.ok(!/YYYY-MM-DD|YYYY-MM\b/.test(SKF_DEFAULT_TEMPLATE),
      'must NOT reference date formats');
    assert.ok(!/precision ladder|fall through.*precision|under-promising beats over-promising/i.test(SKF_DEFAULT_TEMPLATE),
      'must NOT contain RDF precision-fallback language');
  });

  it('default template explicitly commits to exact-or-unknown semantics', () => {
    assert.ok(/exact[- ]or[- ]unknown|exactly what the manufacturer publishes|character for character|exact MPN|do not.*partial|exact(?:-|\s)string/i.test(SKF_DEFAULT_TEMPLATE),
      'must commit to exact-MPN-or-"unk" semantics');
  });

  it('default template instructs the LLM to prefer "unk" over guessed-variant assignment', () => {
    assert.ok(/CANNOT assume|cannot assume|Return "unk"|return "unk"/i.test(SKF_DEFAULT_TEMPLATE),
      'must instruct the LLM to return "unk" rather than guess a variant MPN');
  });
});

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
} from '../skuLlmAdapter.js';

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
    assert.ok(easy.includes('no known siblings'));
    assert.ok(medium.includes('CAUTION'));
    assert.ok(hard.includes('HIGH AMBIGUITY'));
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
    assert.ok(!prompt.includes('Previous searches'));
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
    assert.ok(prompt.includes('"sku"'), 'uses "sku" key, not "sku_value"');
    assert.ok(prompt.includes('"confidence"'));
    assert.ok(prompt.includes('"evidence_refs"'));
    assert.ok(prompt.includes('"discovery_log"'));
    assert.ok(prompt.includes('"supporting_evidence"'));
    assert.ok(prompt.includes('"evidence_kind"'));
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
    assert.match(prompt, /protocol sentinel/i);
    assert.match(prompt, /not (?:a )?product value/i);
    assert.match(prompt, /strip/i);
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
    assert.ok(/shared MPN across all variants|base MPN|same base MPN/i.test(prompt),
      'must handle the shared-MPN case');
    assert.ok(/variant[- ]specific MPN/i.test(prompt),
      'must prefer variant-specific MPN when available');
  });

  it('compiled prompt tags source tiers explicitly', () => {
    // WHY compiled output: source guidance is composed from the shared
    // variantScalarSourceGuidance global + SKU_SOURCE_VARIANT_GUIDANCE_SLOTS.
    const prompt = buildSkuFinderPrompt({ product, variantLabel: 'Black' });
    assert.ok(/tier1/i.test(prompt) && /manufacturer/i.test(prompt),
      'manufacturer authority must be tagged as tier1');
    assert.ok(/tier3/i.test(prompt) && /(Amazon|Best Buy|retailer)/i.test(prompt),
      'retailer listings must reference tier3');
    assert.ok(/tier2/i.test(prompt),
      'independent corroboration must reference tier2');
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

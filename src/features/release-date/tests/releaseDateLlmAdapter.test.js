/**
 * releaseDateLlmAdapter — prompt builder + discovery log accumulation tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReleaseDateFinderPrompt,
  RDF_DEFAULT_TEMPLATE,
} from '../releaseDateLlmAdapter.js';

describe('buildReleaseDateFinderPrompt', () => {
  const product = { brand: 'Logitech', model: 'G Pro X', base_model: 'G Pro X', variant: 'wireless' };

  it('includes brand, model, and variant label in the prompt', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black', variantType: 'color',
    });
    assert.ok(prompt.includes('Logitech'), 'brand present');
    assert.ok(prompt.includes('G Pro X'), 'model present');
    assert.ok(prompt.includes('Black'), 'variant label present');
    assert.ok(prompt.includes('color variant'), 'variant type inline');
  });

  it('distinguishes edition variants from colors', () => {
    const colorPrompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Midnight Black', variantType: 'color',
    });
    const editionPrompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'CoD: BO6 Edition', variantType: 'edition',
    });
    assert.ok(colorPrompt.includes('color variant'));
    assert.ok(editionPrompt.includes('edition'));
  });

  it('injects sibling exclusion list', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black', variantType: 'color',
      siblingsExcluded: ['G Pro', 'G Pro X Superlight'],
    });
    assert.ok(prompt.includes('G Pro'));
    assert.ok(prompt.includes('G Pro X Superlight'));
    assert.ok(prompt.includes('sibling') || prompt.includes('EXCLUDE'), 'sibling intent called out');
  });

  it('omits sibling block when no siblings provided', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black', variantType: 'color',
      siblingsExcluded: [],
    });
    assert.ok(!prompt.includes('to EXCLUDE'), 'no exclude banner when list is empty');
  });

  it('scales identity warning with ambiguity level', () => {
    const easy = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black', ambiguityLevel: 'easy' });
    const medium = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black', ambiguityLevel: 'medium', familyModelCount: 4 });
    const hard = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black', ambiguityLevel: 'hard', familyModelCount: 8 });
    assert.ok(easy.includes('no known siblings'));
    assert.ok(medium.includes('CAUTION'));
    assert.ok(hard.includes('HIGH AMBIGUITY'));
  });

  it('includes previous discovery block when urls_checked present', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black',
      previousDiscovery: { urlsChecked: ['https://example.com/a'], queriesRun: ['logitech g pro x release'] },
    });
    assert.ok(prompt.includes('Previous searches'));
    assert.ok(prompt.includes('https://example.com/a'));
    assert.ok(prompt.includes('logitech g pro x release'));
  });

  it('omits previous discovery when empty', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black',
      previousDiscovery: { urlsChecked: [], queriesRun: [] },
    });
    assert.ok(!prompt.includes('Previous searches'));
  });

  it('uses templateOverride when supplied', () => {
    const prompt = buildReleaseDateFinderPrompt({
      product, variantLabel: 'Black',
      templateOverride: 'CUSTOM PROMPT FOR {{BRAND}} {{MODEL}}',
    });
    assert.equal(prompt, 'CUSTOM PROMPT FOR Logitech G Pro X');
  });

  it('default template contains the JSON output specification', () => {
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    assert.ok(prompt.includes('"release_date"'));
    assert.ok(prompt.includes('"confidence"'));
    assert.ok(prompt.includes('"evidence_refs"'));
    assert.ok(prompt.includes('"discovery_log"'));
  });

  it('default template injects the shared evidence fragment (tier taxonomy)', () => {
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    // Shared fragment teaches all 6 tier codes
    for (const tier of ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'other']) {
      assert.ok(prompt.includes(tier), `tier "${tier}" present`);
    }
    // Includes the confidence-per-source instruction
    assert.ok(prompt.toLowerCase().includes('confidence'));
  });

  it('compiled prompt includes the shared stripped-unk sentinel boundary', () => {
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    assert.match(prompt, /protocol sentinel/i);
    assert.match(prompt, /not (?:a )?product value/i);
    assert.match(prompt, /strip/i);
  });

  it('default template names accepted date formats', () => {
    assert.ok(RDF_DEFAULT_TEMPLATE.includes('YYYY-MM-DD'));
    assert.ok(RDF_DEFAULT_TEMPLATE.includes('YYYY-MM'));
    assert.ok(RDF_DEFAULT_TEMPLATE.includes('YYYY'));
    assert.ok(RDF_DEFAULT_TEMPLATE.includes('unk'));
  });

  // ── Source-hierarchy contract ─────────────────────────────────────
  // WHY: The default prompt shifted from a mouse-specific source list to a
  // category-agnostic, tier-tagged hierarchy. These tests lock the shape so
  // the mouse-bias regressions don't sneak back in.

  it('default template does NOT name mouse-specific spec sites', () => {
    // Old prompt prescribed PCPartPicker / TechPowerUp / mousespecs / eloshapes
    // for every category — broken for keyboards/monitors and unreliable for mice.
    for (const banned of ['PCPartPicker', 'TechPowerUp', 'mousespecs', 'eloshapes']) {
      assert.ok(
        !RDF_DEFAULT_TEMPLATE.includes(banned),
        `mouse-bias source "${banned}" must not appear in the generic prompt`,
      );
    }
  });

  it('compiled prompt names structured retail backups (Keepa / CamelCamelCamel / Amazon)', () => {
    // WHY compiled output: source guidance is composed from the shared
    // variantScalarSourceGuidance global + RDF_SOURCE_VARIANT_GUIDANCE_SLOTS.
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    for (const expected of ['Keepa', 'camelcamelcamel', 'Amazon', 'JSON-LD']) {
      assert.ok(
        prompt.includes(expected),
        `structured retail backup "${expected}" must be named`,
      );
    }
  });

  it('default template distinguishes purchase-and-shipping from pre-order / announcement', () => {
    assert.ok(RDF_DEFAULT_TEMPLATE.includes('purchase and shipping'),
      'GOAL must specify "purchase and shipping" (not just "available")');
    assert.ok(/pre-order/i.test(RDF_DEFAULT_TEMPLATE),
      'must explicitly call out pre-order ambiguity');
    assert.ok(/announcement/i.test(RDF_DEFAULT_TEMPLATE),
      'must call out announcement dates as not-the-answer');
  });

  it('compiled prompt enforces Amazon-only → YYYY-MM precision rule', () => {
    // The single most important honesty rule: don't promise YYYY-MM-DD
    // when the only source is a retail listing date. Lives in the tier3
    // content slot of RDF_SOURCE_VARIANT_GUIDANCE_SLOTS after extraction.
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    assert.ok(/Amazon\/Keepa is your ONLY signal/i.test(prompt)
      || /Amazon.*ONLY signal/i.test(prompt),
      'must include the "Amazon/Keepa-only → YYYY-MM" precision rule');
  });

  it('compiled prompt tags source tiers explicitly so the LLM knows which tier code to attach', () => {
    // Source hierarchy maps each kind of evidence to a concrete tier code
    // matching the universal evidence taxonomy.
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    assert.ok(/tier1/i.test(prompt) && /manufacturer/i.test(prompt),
      'manufacturer authority must be tagged as tier1');
    assert.ok(/tier3/i.test(prompt),
      'retail backups must reference tier3 explicitly');
    assert.ok(/tier2/i.test(prompt),
      'independent corroboration must reference tier2 explicitly');
  });

  it('default template forbids seasons + quarter ranges (not just relative phrases)', () => {
    assert.ok(/Spring|season/i.test(RDF_DEFAULT_TEMPLATE),
      'must forbid season-style imprecision (e.g. "Spring 2024")');
    assert.ok(/Q1|range/i.test(RDF_DEFAULT_TEMPLATE),
      'must forbid quarter ranges');
  });

  it('default template does NOT prescribe a search-step checklist (LLM picks the order)', () => {
    // The old prompt had bullets like "Query manufacturer's product page,
    // press page, and news archive" — replaced with autonomy + evidence bar.
    // WHY compiled output: the autonomy line now lives in the global
    // scalarSourceGuidanceCloser fragment (shared with SKU), injected via
    // {{SCALAR_SOURCE_GUIDANCE_CLOSER}} at build time. Assert the compiled
    // prompt honors the contract, not the raw template.
    assert.ok(!/Query manufacturer's product page/i.test(RDF_DEFAULT_TEMPLATE),
      'old prescriptive search-step bullet must be gone');
    const compiled = buildReleaseDateFinderPrompt({
      product: { brand: 'Corsair', model: 'M75 Air Wireless' },
      variantLabel: 'black', variantType: 'color',
      previousDiscovery: { urlsChecked: [], queriesRun: [] },
    });
    assert.ok(/you decide|your judgment|in what order/i.test(compiled),
      'must explicitly hand source-ordering to the LLM');
  });

  // ── Precision fallback contract ───────────────────────────────────
  // WHY: Prefer imprecise data over no data. Teach the LLM to fall through
  // day → month → year before returning "unk". Confidence stays honest via
  // the existing per-source max derivation; this just unlocks lower-precision
  // answers for products that don't expose a day-level signal.

  it('default template teaches a precision fallback ladder (day → month → year)', () => {
    assert.ok(/precision/i.test(RDF_DEFAULT_TEMPLATE),
      'must frame the output as a precision ladder, not a single target');
    assert.ok(/fall through|fall back|fall-through|fallback/i.test(RDF_DEFAULT_TEMPLATE),
      'must explicitly instruct falling through precision levels');
  });

  it('default template discourages "unk" when a calendar year can be defended', () => {
    assert.ok(/defensibly name the calendar year|defend (?:a|the) (?:calendar )?year|before returning ["']?unk["']?/i.test(RDF_DEFAULT_TEMPLATE),
      'must instruct the LLM to prefer YYYY over "unk" when a year is defensible');
  });

  it('default template acknowledges older/obscure products may only yield YYYY', () => {
    assert.ok(/older|obscure|old.*product/i.test(RDF_DEFAULT_TEMPLATE),
      'must tell the LLM that YYYY is a valid answer for older/obscure products');
  });

  // ── Variant disambiguation contract ──────────────────────────────
  // WHY: RDF gained a VARIANT DISAMBIGUATION section in Commit 3 via the
  // shared variantScalarDisambiguation global + RDF_VARIANT_DISAMBIGUATION_SLOTS
  // bag. Addresses the real failure mode where limited editions / regional
  // color drops silently return the base product's launch date.
  // Tests enforce behavior/structure, not exact wording (prompts are editable).

  it('compiled prompt contains a named VARIANT DISAMBIGUATION section with 4 numbered rules', () => {
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    assert.match(prompt, /VARIANT DISAMBIGUATION/,
      'must have a named VARIANT DISAMBIGUATION section');
    for (const n of [1, 2, 3, 4]) {
      assert.match(prompt, new RegExp(`  ${n}\\. `),
        `must have rule ${n}`);
    }
  });

  it('compiled prompt handles the shared-launch case (all variants launched simultaneously)', () => {
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    assert.match(prompt, /launched all variants simultaneously|shared.*(launch|date)|simultaneously/i,
      'must handle the shared-launch case where one date covers all variants');
  });

  it('compiled prompt instructs the LLM to prefer "unk" over returning the base launch date for later drops', () => {
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    assert.match(prompt, /Do NOT return the base product launch date|base.*launch.*later|later.*launch.*base/i,
      'must warn against returning the base launch date for later-dropped variants');
  });

  it('compiled prompt allows community/forum/spec-DB sources for year-level corroboration', () => {
    // The LLM must understand tier4/tier5 are not just cross-reference — for
    // YYYY precision, they can be standalone evidence when they agree.
    // Lives in the tier4 content slot of RDF_SOURCE_VARIANT_GUIDANCE_SLOTS.
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: 'Black' });
    assert.ok(/year.*(?:tier4|tier5|forum|community|spec[- ]?(?:DB|database))/i.test(prompt)
      || /(?:tier4|tier5|forum|community|spec[- ]?(?:DB|database)).*year/i.test(prompt),
      'must allow low-tier sources for YYYY-level corroboration');
  });
});

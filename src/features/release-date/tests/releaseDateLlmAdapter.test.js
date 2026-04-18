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

  it('default template names structured retail backups (Keepa / CamelCamelCamel / Amazon)', () => {
    for (const expected of ['Keepa', 'camelcamelcamel', 'Amazon', 'JSON-LD']) {
      assert.ok(
        RDF_DEFAULT_TEMPLATE.includes(expected),
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

  it('default template enforces Amazon-only → YYYY-MM precision rule', () => {
    // The single most important honesty rule: don't promise YYYY-MM-DD
    // when the only source is a retail listing date.
    assert.ok(/Amazon\/Keepa is your ONLY signal/i.test(RDF_DEFAULT_TEMPLATE)
      || /Amazon.*ONLY signal/i.test(RDF_DEFAULT_TEMPLATE),
      'must include the "Amazon/Keepa-only → YYYY-MM" precision rule');
  });

  it('default template tags source tiers explicitly so the LLM knows which tier code to attach', () => {
    // Source hierarchy maps each kind of evidence to a concrete tier code
    // matching the universal evidence taxonomy.
    assert.ok(/tier1/i.test(RDF_DEFAULT_TEMPLATE) && /manufacturer/i.test(RDF_DEFAULT_TEMPLATE),
      'manufacturer authority must be tagged as tier1');
    assert.ok(/tier3/i.test(RDF_DEFAULT_TEMPLATE),
      'retail backups must reference tier3 explicitly');
    assert.ok(/tier2/i.test(RDF_DEFAULT_TEMPLATE),
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
    assert.ok(!/Query manufacturer's product page/i.test(RDF_DEFAULT_TEMPLATE),
      'old prescriptive search-step bullet must be gone');
    assert.ok(/you decide|your judgment|in what order/i.test(RDF_DEFAULT_TEMPLATE),
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

  it('default template allows community/forum/spec-DB sources for year-level corroboration', () => {
    // The LLM must understand tier4/tier5 are not just cross-reference — for
    // YYYY precision, they can be standalone evidence when they agree.
    assert.ok(/year.*(?:tier4|tier5|forum|community|spec[- ]?(?:DB|database))/i.test(RDF_DEFAULT_TEMPLATE)
      || /(?:tier4|tier5|forum|community|spec[- ]?(?:DB|database)).*year/i.test(RDF_DEFAULT_TEMPLATE),
      'must allow low-tier sources for YYYY-level corroboration');
  });
});


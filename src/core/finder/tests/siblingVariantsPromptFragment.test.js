/**
 * Unit tests for buildSiblingVariantsPromptBlock.
 *
 * WHY: The sibling-variants block is injected into PIF-view, PIF-loop, RDF,
 * and SKU prompts to tell the LLM which OTHER variants of the same product
 * exist — so it doesn't return images/SKUs/dates for the wrong variant when
 * a product page shows them side-by-side. PIF-hero is excluded (separate
 * call path). Helper must be silent when there are no others to exclude.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildSiblingVariantsPromptBlock } from '../siblingVariantsPromptFragment.js';

const BLACK = { variant_id: 'v_1', key: 'color:black', label: 'black', type: 'color' };
const WHITE = { variant_id: 'v_2', key: 'color:white', label: 'Glacier White', type: 'color' };
const LILAC = { variant_id: 'v_3', key: 'color:lilac', label: 'lilac', type: 'color' };
const COD_BO6 = { variant_id: 'v_4', key: 'edition:cod-bo6', label: 'CoD BO6 Edition', type: 'edition' };

describe('buildSiblingVariantsPromptBlock', () => {
  it('returns empty string when allVariants is empty', () => {
    const out = buildSiblingVariantsPromptBlock({
      allVariants: [],
      currentVariantKey: 'color:black',
      currentVariantLabel: 'black',
      whatToSkip: 'MPNs',
    });
    assert.equal(out, '');
  });

  it('returns empty string when allVariants is missing', () => {
    const out = buildSiblingVariantsPromptBlock({
      allVariants: undefined,
      currentVariantKey: 'color:black',
      currentVariantLabel: 'black',
      whatToSkip: 'MPNs',
    });
    assert.equal(out, '');
  });

  it('returns empty string when product has only the current variant (single-variant)', () => {
    const out = buildSiblingVariantsPromptBlock({
      allVariants: [BLACK],
      currentVariantKey: 'color:black',
      currentVariantLabel: 'black',
      whatToSkip: 'MPNs',
    });
    assert.equal(out, '');
  });

  it('renders a bulleted list of OTHER color variants', () => {
    const out = buildSiblingVariantsPromptBlock({
      allVariants: [BLACK, WHITE, LILAC],
      currentVariantKey: 'color:black',
      currentVariantLabel: 'black',
      whatToSkip: 'MPNs',
    });
    assert.ok(out.includes('DO NOT return MPNs for these'));
    assert.ok(out.includes('targets ONLY the "black" variant'));
    assert.ok(out.includes('- "Glacier White" color variant'));
    assert.ok(out.includes('- "lilac" color variant'));
    // Must NOT include the current variant
    assert.ok(!out.includes('- "black" color variant'));
  });

  it('renders mixed color + edition types correctly', () => {
    const out = buildSiblingVariantsPromptBlock({
      allVariants: [BLACK, WHITE, COD_BO6],
      currentVariantKey: 'color:black',
      currentVariantLabel: 'black',
      whatToSkip: 'images',
    });
    assert.ok(out.includes('- "Glacier White" color variant'));
    assert.ok(out.includes('- "CoD BO6 Edition" edition'));
    assert.ok(out.includes('DO NOT return images for these'));
  });

  it('renders correctly when current variant is an edition', () => {
    const out = buildSiblingVariantsPromptBlock({
      allVariants: [BLACK, WHITE, COD_BO6],
      currentVariantKey: 'edition:cod-bo6',
      currentVariantLabel: 'CoD BO6 Edition',
      whatToSkip: 'release dates',
    });
    assert.ok(out.includes('- "black" color variant'));
    assert.ok(out.includes('- "Glacier White" color variant'));
    assert.ok(!out.includes('- "CoD BO6 Edition" edition'));
    assert.ok(out.includes('targets ONLY the "CoD BO6 Edition" variant'));
    assert.ok(out.includes('DO NOT return release dates for these'));
  });

  it('uses WHAT_TO_SKIP verbatim — finder-specific wording', () => {
    for (const noun of ['images', 'MPNs', 'release dates']) {
      const out = buildSiblingVariantsPromptBlock({
        allVariants: [BLACK, WHITE],
        currentVariantKey: 'color:black',
        currentVariantLabel: 'black',
        whatToSkip: noun,
      });
      assert.ok(out.includes(`DO NOT return ${noun} for these`),
        `expected noun "${noun}" in output, got: ${out}`);
    }
  });

  it('skips null/undefined entries in allVariants gracefully', () => {
    const out = buildSiblingVariantsPromptBlock({
      allVariants: [BLACK, null, WHITE, undefined],
      currentVariantKey: 'color:black',
      currentVariantLabel: 'black',
      whatToSkip: 'MPNs',
    });
    assert.ok(out.includes('- "Glacier White" color variant'));
    assert.ok(!out.includes('null'));
    assert.ok(!out.includes('undefined'));
  });
});

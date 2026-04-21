/**
 * Sibling-variants exclusion prompt fragment helper.
 *
 * Used by per-variant finders (PIF-view, PIF-loop, RDF, SKU) to tell the LLM
 * which OTHER variants of the same product exist — so it doesn't grab the
 * wrong-color image or the wrong-variant MPN when a product page lists them
 * side-by-side.
 *
 * Silent when the product has only the current variant (no others to exclude)
 * — returns empty string so the prompt stays tight for single-variant products.
 *
 * PIF-hero does NOT use this helper (it's a separate call path, not per-variant
 * in the same sense). CEF does NOT use this helper (it discovers variants
 * rather than filtering them).
 */

import { resolvePromptTemplate } from '../llm/resolvePromptTemplate.js';
import { resolveGlobalPrompt } from '../llm/prompts/globalPromptRegistry.js';

/**
 * @param {object} opts
 * @param {Array<{key:string,label:string,type:string}>|undefined} opts.allVariants
 * @param {string} opts.currentVariantKey — e.g. "color:black" or "edition:cod-bo6"
 * @param {string} opts.currentVariantLabel — display name of the target variant
 * @param {string} opts.whatToSkip — finder-specific noun: "images" | "MPNs" | "release dates"
 * @returns {string}
 */
export function buildSiblingVariantsPromptBlock({
  allVariants,
  currentVariantKey,
  currentVariantLabel,
  whatToSkip,
}) {
  if (!Array.isArray(allVariants) || allVariants.length === 0) return '';
  const others = allVariants.filter(
    (v) => v && typeof v === 'object' && v.key !== currentVariantKey,
  );
  if (others.length === 0) return '';
  const list = others
    .map((v) => `- "${v.label}" ${v.type === 'edition' ? 'edition' : 'color variant'}`)
    .join('\n');
  return resolvePromptTemplate(resolveGlobalPrompt('siblingVariantsExclusion'), {
    VARIANT_LABEL: currentVariantLabel,
    WHAT_TO_SKIP: whatToSkip,
    SIBLING_VARIANTS_LIST: list,
  });
}

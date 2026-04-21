/**
 * SKU Finder — LLM adapter (per-variant).
 *
 * Each LLM call targets ONE variant and asks for the manufacturer part number
 * (MPN) for that specific color/edition. Web-capable models browse to find the
 * MPN; the response includes evidence refs for the publisher gate.
 *
 * Identity-aware: uses base_model, variant, and sibling exclusion to ensure
 * the correct product is targeted (same pattern as RDF + CEF + PIF).
 *
 * Extended evidence: `includeEvidenceKind: true` opts SKF into the
 * supporting_evidence + evidence_kind shape shared with RDF.
 */

import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { resolvePromptTemplate } from '../../core/llm/resolvePromptTemplate.js';
import { resolveGlobalPrompt } from '../../core/llm/prompts/globalPromptRegistry.js';
import { buildPreviousDiscoveryBlock } from '../../core/finder/discoveryLog.js';
import { buildEvidencePromptBlock } from '../../core/finder/evidencePromptFragment.js';
import { buildEvidenceVerificationPromptBlock } from '../../core/finder/evidenceVerificationPromptFragment.js';
import { buildValueConfidencePromptBlock } from '../../core/finder/valueConfidencePromptFragment.js';
import { buildSiblingVariantsPromptBlock } from '../../core/finder/siblingVariantsPromptFragment.js';
import { buildIdentityWarning } from '../../core/llm/prompts/identityContext.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { skuFinderResponseSchema } from './skuSchema.js';

const FIELD_DOMAIN_NOUN = 'manufacturer part numbers';

/* ── Prompt builder ──────────────────────────────────────────────── */

export const SKF_DEFAULT_TEMPLATE = `Find the manufacturer part number (MPN) for: {{BRAND}} {{MODEL}} — {{VARIANT_DESC}}

{{IDENTITY_INTRO}}
{{IDENTITY_WARNING}}
{{SIBLING_VARIANTS}}

GOAL: The manufacturer-assigned part number that uniquely identifies this specific {{VARIANT_TYPE_WORD}} variant. The MPN is distinct from:
  - Base product MPNs (the non-variant model code; e.g. "G502-HERO" applies to all colors, but "G502-HERO-BLACK" is the variant-specific MPN)
  - Amazon ASINs (10-character, starting with B0; retailer-assigned, not MPN)
  - Retailer-specific SKUs (Best Buy SKU, Newegg item #, B&H item #, etc.)
  - UPC / EAN / GTIN barcodes (12-13 digits; product-identification standards, not manufacturer part numbers)

Return the variant-specific MPN when the manufacturer publishes one. MPN formats vary wildly per brand — Logitech uses "910-XXXXXX", Corsair uses "CH-XXXXXXX-XX", Razer uses "RZ01-XXXXXXXX-XX", etc. Do not normalize the format. Return exactly what the manufacturer publishes, character for character.

{{EVIDENCE_REQUIREMENTS}}

Source guidance — use the strongest signal available:

  PRIMARY — manufacturer authority (tag as tier1)
    Brand product page (spec sheet, datasheet, "Where to Buy" panel listing each
    variant with its own MPN), press release, official documentation, support
    article. Direct manufacturer sources are authoritative for MPN.
    NOTE: Check the manufacturer's product page for THIS VARIANT specifically.
    If the page lists variants side-by-side with distinct MPNs, use the variant MPN.
    If all variants share one MPN, return that MPN with a note in discovery_log.

  RETAILER LISTINGS (tag as tier3)
    Amazon product page (check "Part Number" or "Item model number" in product
    details — ASINs are NOT MPNs), Best Buy, Newegg, B&H. Retailers often
    display MPN in the spec table.
    Cross-check: if two retailers show different "part numbers", the MPN is the
    manufacturer-assigned one, NOT the retailer-specific SKU.
    WARNING: Retailers frequently conflate MPN, SKU, and product codes.
    When uncertain, defer to manufacturer primary source.

  INDEPENDENT CORROBORATION (tag as tier2)
    Reviews, unboxing videos, retailer comparisons that cite the official MPN.
    Use to corroborate primary/retail, not as sole source for MPN.

  SPEC AGGREGATORS / COMMUNITY (tag as tier4 or tier5)
    TechSpecs.com, spec databases, forums. Cross-reference only for MPN —
    community posts frequently propagate typos or cite retailer SKUs as MPNs.

{{SCALAR_SOURCE_GUIDANCE_CLOSER}}

VARIANT DISAMBIGUATION — critical for multi-color / edition products:

If the manufacturer product page shows multiple colors/editions:
  1. Locate this variant's specific SKU/MPN listing (color row, edition selector).
  2. If each variant has a distinct MPN suffix (e.g. "-BLACK", "-WHITE", "-001"),
     return the full variant MPN.
  3. If the manufacturer uses the same base MPN for all variants (entire product
     family uses one MPN regardless of color), return the base MPN and note in
     discovery_log.notes: "Manufacturer uses shared MPN across all variants."
  4. If the page only lists one MPN but multiple colors are in stock, you CANNOT
     assume that one MPN applies to this color. Return "unk" with unknown_reason
     explaining that the variant MPN is not published.

Do NOT return the base product MPN if the manufacturer clearly publishes
variant-specific MPNs for other colors and you cannot find one for this variant.

{{VALUE_CONFIDENCE_GUIDANCE}}
SKF-specific: MPN is exact-or-unknown. Do not return partial codes, guessed
suffixes, or paraphrased values. If your evidence does not literally state a
part number for this specific variant, return "unk" with a clear unknown_reason.

{{PREVIOUS_DISCOVERY}}Return JSON:
- "sku": "<exact MPN string>" | "unk"
{{SCALAR_RETURN_JSON_TAIL}}`;

/**
 * Build the system prompt for a single-variant MPN search.
 *
 * @param {object} opts
 * @param {object} opts.product — { brand, model, base_model, variant }
 * @param {string} opts.variantLabel
 * @param {string} opts.variantType — "color" or "edition"
 * @param {string[]} opts.siblingsExcluded
 * @param {number} opts.familyModelCount
 * @param {string} opts.ambiguityLevel
 * @param {{urlsChecked: string[], queriesRun: string[]}} opts.previousDiscovery
 * @param {string} [opts.promptOverride]
 * @param {string} [opts.templateOverride]
 * @returns {string}
 */
export function buildSkuFinderPrompt({
  product = {},
  variantLabel = '',
  variantType = 'color',
  variantKey = '',
  allVariants = [],
  siblingsExcluded = [],
  familyModelCount = 1,
  ambiguityLevel = 'easy',
  previousDiscovery = { urlsChecked: [], queriesRun: [] },
  promptOverride = '',
  templateOverride = '',
  minEvidenceRefs = 1,
} = {}) {
  const brand = product.brand || '';
  const model = product.model || '';
  const variant = product.variant || '';

  const variantDesc = variantType === 'edition'
    ? `the "${variantLabel}" edition`
    : `the "${variantLabel}" color variant`;

  const identityWarning = buildIdentityWarning({
    familyModelCount,
    ambiguityLevel,
    brand,
    model,
    siblingModels: siblingsExcluded,
    fieldDomainNoun: FIELD_DOMAIN_NOUN,
  });

  const discoverySection = buildPreviousDiscoveryBlock({
    urlsChecked: previousDiscovery.urlsChecked,
    queriesRun: previousDiscovery.queriesRun,
    scopeLabel: 'this variant',
  });

  const template = templateOverride || promptOverride || SKF_DEFAULT_TEMPLATE;

  const variantSuffix = variant ? ` (variant: ${variant})` : '';

  return resolvePromptTemplate(template, {
    BRAND: brand,
    MODEL: model,
    VARIANT_DESC: variantDesc,
    VARIANT_SUFFIX: variantSuffix,
    IDENTITY_INTRO: resolvePromptTemplate(resolveGlobalPrompt('identityIntro'), {
      BRAND: brand, MODEL: model, VARIANT_SUFFIX: variantSuffix,
    }),
    IDENTITY_WARNING: identityWarning,
    SIBLING_VARIANTS: buildSiblingVariantsPromptBlock({
      allVariants,
      currentVariantKey: variantKey,
      currentVariantLabel: variantLabel,
      whatToSkip: 'MPNs',
    }),
    VARIANT_TYPE_WORD: variantType === 'edition' ? 'edition' : 'color',
    PREVIOUS_DISCOVERY: discoverySection,
    EVIDENCE_REQUIREMENTS: `${buildEvidencePromptBlock({ minEvidenceRefs, includeEvidenceKind: true })}\n\n${buildEvidenceVerificationPromptBlock()}`,
    VALUE_CONFIDENCE_GUIDANCE: buildValueConfidencePromptBlock(),
    SCALAR_SOURCE_GUIDANCE_CLOSER: resolveGlobalPrompt('scalarSourceGuidanceCloser'),
    SCALAR_RETURN_JSON_TAIL: resolvePromptTemplate(resolveGlobalPrompt('scalarReturnJsonTail'), {
      VALUE_NOUN: 'MPN',
      VALUE_KEY: 'sku',
      UNKNOWN_REASON_EXAMPLES: '. Examples: "manufacturer does not publish variant-specific MPNs", "product page does not list this color variant", "only found ASIN, not MPN"',
    }),
  });
}

export const SKU_FINDER_SPEC = {
  phase: 'skuFinder',
  reason: 'sku_finding',
  role: 'triage',
  system: (domainArgs) => buildSkuFinderPrompt({
    product: domainArgs.product,
    variantLabel: domainArgs.variantLabel || '',
    variantType: domainArgs.variantType || 'color',
    variantKey: domainArgs.variantKey || '',
    allVariants: domainArgs.allVariants || [],
    siblingsExcluded: domainArgs.siblingsExcluded || [],
    familyModelCount: domainArgs.familyModelCount || 1,
    ambiguityLevel: domainArgs.ambiguityLevel || 'easy',
    previousDiscovery: domainArgs.previousDiscovery || { urlsChecked: [], queriesRun: [] },
    promptOverride: domainArgs.promptOverride || '',
    minEvidenceRefs: domainArgs.minEvidenceRefs,
  }),
  jsonSchema: zodToLlmSchema(skuFinderResponseSchema),
};

/**
 * Factory: create a bound LLM caller for the SKU Finder.
 */
export function createSkuFinderCallLlm(deps) {
  return createPhaseCallLlm(deps, SKU_FINDER_SPEC, (domainArgs) => ({
    user: JSON.stringify({
      brand: domainArgs.product?.brand || '',
      model: domainArgs.product?.model || '',
      base_model: domainArgs.product?.base_model || '',
      variant_label: domainArgs.variantLabel || '',
      variant_type: domainArgs.variantType || 'color',
    }),
  }));
}

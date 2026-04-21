/**
 * Release Date Finder — LLM adapter (per-variant).
 *
 * Each LLM call targets ONE variant and asks for the first-availability release
 * date for that specific color/edition. Web-capable models browse to find the
 * date; the response includes evidence refs for the publisher gate.
 *
 * Identity-aware: uses base_model, variant, and sibling exclusion to ensure
 * the correct product is targeted (same pattern as PIF + CEF).
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
import { releaseDateFinderResponseSchema } from './releaseDateSchema.js';

const FIELD_DOMAIN_NOUN = 'release dates';

/* ── Prompt builder ──────────────────────────────────────────────── */

export const RDF_DEFAULT_TEMPLATE = `Find the first-availability release date for: {{BRAND}} {{MODEL}} — {{VARIANT_DESC}}

{{IDENTITY_INTRO}}
{{IDENTITY_WARNING}}
{{SIBLING_VARIANTS}}

GOAL: The date this specific {{VARIANT_TYPE_WORD}} variant first became available for purchase and shipping to customers. Distinguish from:
  - announcement / reveal dates (do NOT use)
  - pre-order open dates (do NOT use unless they coincide with shipping)
  - regional re-launches (use the EARLIEST global ship date)

Precision ladder — return the most precise date the evidence actually supports, and fall through when you can't hit the top:
  1. YYYY-MM-DD — exact day (tier1 press release, product page, retail "Date First Available", reviewer's purchase/ship date)
  2. YYYY-MM — month only (evidence narrows it to a calendar month but not a specific day)
  3. Month YYYY or MMM YYYY — equivalent to YYYY-MM, whichever form the evidence uses
  4. YYYY — year only (any combination of sources places it in a specific calendar year)
  5. "unk" — ONLY if you genuinely cannot defend a single calendar year

Important framing:
- Under-promising beats over-promising. A confidently-defended YYYY beats a shaky YYYY-MM-DD.
- Older or obscure products often only yield YYYY — that is a valid, useful answer. Do not return "unk" just because a specific day isn't findable.
- NEVER return ranges ("Q1 2024"), relative phrases ("last year"), seasons ("Spring 2024"), or announcements without a confirmed ship date.
- Before returning "unk", ask: can I defensibly name the calendar year? If yes, return YYYY with appropriate confidence and explain your reasoning in discovery_log.notes.

{{EVIDENCE_REQUIREMENTS}}

Source guidance — use the strongest signal available, fall back as needed:

  PRIMARY — manufacturer authority (tag as tier1)
    Brand product page, press release, official news/blog, support article.
    Typically yields YYYY-MM-DD. Treat as authoritative when present.

  STRUCTURED RETAIL BACKUPS (tag as tier3)
    Use when manufacturer sources are dead, redesigned, or undated.
    - Keepa.com, camelcamelcamel.com — price-history start date for the SKU
    - Amazon "Date First Available" in product details
    - Amazon JSON-LD releaseDate / datePublished if populated
    For peripherals, Amazon listing is typically within days of launch.
    But if Amazon/Keepa is your ONLY signal, return YYYY-MM (not YYYY-MM-DD)
    — listing dates can predate shipping by 1–3 months on pre-order launches.

  INDEPENDENT CORROBORATION (tag as tier2)
    Reviews, hands-on coverage, launch posts citing a specific date.
    Use to corroborate primary/retail, not as a sole source.

  COMMUNITY / AGGREGATOR (tag as tier4 or tier5)
    Forum posts, spec databases, review aggregators.
    - For YYYY-MM-DD / YYYY-MM precision: cross-reference only, never sole source.
    - For YYYY precision: multiple independent tier4/tier5 sources agreeing on a
      calendar year are acceptable standalone evidence (e.g. a forum thread from
      2018 discussing the product as current places it in 2018).

{{SCALAR_SOURCE_GUIDANCE_CLOSER}}

{{VALUE_CONFIDENCE_GUIDANCE}}
RDF-specific: below 50, prefer returning the broadest precision level (YYYY) you can defend over returning "unk". Only return "unk" when you cannot defensibly place the product in any calendar year.

{{PREVIOUS_DISCOVERY}}Return JSON:
- "release_date": "YYYY-MM-DD" | "YYYY-MM" | "YYYY" | "MMM YYYY" | "Month YYYY" | "unk"
{{SCALAR_RETURN_JSON_TAIL}}`;

/**
 * Build the system prompt for a single-variant release date search.
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
export function buildReleaseDateFinderPrompt({
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

  const template = templateOverride || promptOverride || RDF_DEFAULT_TEMPLATE;

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
      whatToSkip: 'release dates',
    }),
    VARIANT_TYPE_WORD: variantType === 'edition' ? 'edition' : 'color',
    PREVIOUS_DISCOVERY: discoverySection,
    EVIDENCE_REQUIREMENTS: `${buildEvidencePromptBlock({ minEvidenceRefs, includeEvidenceKind: true })}\n\n${buildEvidenceVerificationPromptBlock()}`,
    VALUE_CONFIDENCE_GUIDANCE: buildValueConfidencePromptBlock(),
    SCALAR_SOURCE_GUIDANCE_CLOSER: resolveGlobalPrompt('scalarSourceGuidanceCloser'),
    SCALAR_RETURN_JSON_TAIL: resolvePromptTemplate(resolveGlobalPrompt('scalarReturnJsonTail'), {
      VALUE_NOUN: 'date',
      VALUE_KEY: 'release_date',
      UNKNOWN_REASON_EXAMPLES: '',
    }),
  });
}

export const RELEASE_DATE_FINDER_SPEC = {
  phase: 'releaseDateFinder',
  reason: 'release_date_finding',
  role: 'triage',
  system: (domainArgs) => buildReleaseDateFinderPrompt({
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
  jsonSchema: zodToLlmSchema(releaseDateFinderResponseSchema),
};

/**
 * Factory: create a bound LLM caller for the Release Date Finder.
 */
export function createReleaseDateFinderCallLlm(deps) {
  return createPhaseCallLlm(deps, RELEASE_DATE_FINDER_SPEC, (domainArgs) => ({
    user: JSON.stringify({
      brand: domainArgs.product?.brand || '',
      model: domainArgs.product?.model || '',
      base_model: domainArgs.product?.base_model || '',
      variant_label: domainArgs.variantLabel || '',
      variant_type: domainArgs.variantType || 'color',
    }),
  }));
}

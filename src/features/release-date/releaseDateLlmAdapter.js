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
import { buildPreviousDiscoveryBlock } from '../../core/finder/discoveryLog.js';
import { buildEvidencePromptBlock } from '../../core/finder/evidencePromptFragment.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { releaseDateFinderResponseSchema } from './releaseDateSchema.js';

/* ── Prompt builder ──────────────────────────────────────────────── */

export const RDF_DEFAULT_TEMPLATE = `Find the first-availability release date for: {{BRAND}} {{MODEL}} — {{VARIANT_DESC}}

IDENTITY: You are looking for the EXACT product "{{BRAND}} {{MODEL}}"{{VARIANT_SUFFIX}}. Not a different model in the same product family. If you encounter sibling models, skip them.
{{IDENTITY_WARNING}}
{{SIBLINGS_LINE}}
GOAL: The date this specific {{VARIANT_TYPE_WORD}} variant first became available for purchase and shipping to customers. Distinguish from:
  - announcement / reveal dates (do NOT use)
  - pre-order open dates (do NOT use unless they coincide with shipping)
  - regional re-launches (use the EARLIEST global ship date)

Date format rules:
- Preferred: YYYY-MM-DD (full date)
- Accepted: YYYY-MM, YYYY, MMM YYYY, Month YYYY
- Return the highest precision the evidence actually supports — under-promising beats over-promising
- NEVER return ranges ("Q1 2024"), relative phrases ("last year"), seasons ("Spring 2024"), or announcements without a confirmed ship date
- If no evidence yields a defensible date, return "unk" and explain in unknown_reason

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
    Forum posts, spec databases. Lowest signal; use only as cross-reference.

You decide which sources to query and in what order — the above describes
what kind of evidence counts and how to tag it, not a script to execute.

Confidence guidance (0-100):
- 90+:   multiple tier1 sources agree, or tier1 + tier3 agree on the date
- 70-89: single tier1, or two tier3 sources agree on month/year
- 50-69: single tier3 only, or multiple tier2 agreeing on year
- <50:   contradicting or weak evidence — prefer returning "unk"

{{PREVIOUS_DISCOVERY}}Return JSON:
- "release_date": "YYYY-MM-DD" | "YYYY-MM" | "YYYY" | "MMM YYYY" | "Month YYYY" | "unk"
- "confidence": 0-100 (your overall confidence in the returned date)
- "unknown_reason": "..." (required if release_date is "unk"; empty string otherwise)
- "evidence_refs": [{ "url": "...", "tier": "tier1|tier2|tier3|tier4|tier5|other", "confidence": 0-100 }, ...]
- "discovery_log": { "urls_checked": [...], "queries_run": [...], "notes": [...] }`;

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

  const familyCount = Math.max(1, familyModelCount || 1);
  const ambiguity = ambiguityLevel || 'easy';

  let identityWarning = '';
  if (ambiguity === 'easy') {
    identityWarning = 'This product has no known siblings — standard identity matching applies.';
  } else if (ambiguity === 'medium') {
    identityWarning = `CAUTION: This product has ${familyCount} models in its family. Verify you are looking at the exact "${model}".`;
  } else {
    identityWarning = `HIGH AMBIGUITY: ${familyCount} models in family under "${brand}". TRIPLE-CHECK every source cites the exact model "${model}".`;
  }

  const siblingLine = siblingsExcluded.length > 0
    ? `\nKnown sibling models to EXCLUDE (do NOT use release dates of these): ${siblingsExcluded.join(', ')}\n`
    : '';

  const discoverySection = buildPreviousDiscoveryBlock({
    urlsChecked: previousDiscovery.urlsChecked,
    queriesRun: previousDiscovery.queriesRun,
    scopeLabel: 'this variant',
  });

  const template = templateOverride || promptOverride || RDF_DEFAULT_TEMPLATE;

  return resolvePromptTemplate(template, {
    BRAND: brand,
    MODEL: model,
    VARIANT_DESC: variantDesc,
    VARIANT_SUFFIX: variant ? ` (variant: ${variant})` : '',
    IDENTITY_WARNING: identityWarning,
    SIBLINGS_LINE: siblingLine,
    VARIANT_TYPE_WORD: variantType === 'edition' ? 'edition' : 'color',
    PREVIOUS_DISCOVERY: discoverySection,
    EVIDENCE_REQUIREMENTS: buildEvidencePromptBlock({ minEvidenceRefs }),
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

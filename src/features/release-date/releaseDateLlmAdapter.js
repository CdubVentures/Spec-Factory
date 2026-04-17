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
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { releaseDateFinderResponseSchema } from './releaseDateSchema.js';

/* ── Per-variant discovery log accumulation ───────────────────────── */

/**
 * Accumulate discovery logs from previous RDF runs for a specific variant.
 * Unions urls_checked and queries_run across all matching runs, respecting cooldown cutoffs.
 *
 * @param {object[]} previousRuns — RDF runs from the JSON store
 * @param {string} variantKey
 * @param {string|null} variantId
 * @param {{urlCutoffIso?: string, queryCutoffIso?: string}} opts
 * @returns {{ urlsChecked: string[], queriesRun: string[] }}
 */
export function accumulateVariantDiscoveryLog(previousRuns, variantKey, variantId, { urlCutoffIso = '', queryCutoffIso = '' } = {}) {
  const urlSet = new Set();
  const querySet = new Set();

  for (const run of previousRuns) {
    const rId = run.response?.variant_id;
    const rKey = run.response?.variant_key;
    const matches = (variantId && rId) ? rId === variantId : rKey === variantKey;
    if (!matches) continue;

    const log = run.response?.discovery_log;
    if (!log) continue;

    const ranAt = run.ran_at || '';
    if (!urlCutoffIso || !ranAt || ranAt >= urlCutoffIso) {
      if (Array.isArray(log.urls_checked)) {
        for (const u of log.urls_checked) urlSet.add(u);
      }
    }
    if (!queryCutoffIso || !ranAt || ranAt >= queryCutoffIso) {
      if (Array.isArray(log.queries_run)) {
        for (const q of log.queries_run) querySet.add(q);
      }
    }
  }

  return { urlsChecked: [...urlSet], queriesRun: [...querySet] };
}

/* ── Prompt builder ──────────────────────────────────────────────── */

export const RDF_DEFAULT_TEMPLATE = `Find the first-availability release date for: {{BRAND}} {{MODEL}} — {{VARIANT_DESC}}

IDENTITY: You are looking for the EXACT product "{{BRAND}} {{MODEL}}"{{VARIANT_SUFFIX}}. Not a different model in the same product family. If you encounter sibling models, skip them.
{{IDENTITY_WARNING}}
{{SIBLINGS_LINE}}
GOAL: Determine the date this specific {{VARIANT_TYPE_WORD}} variant first became available for purchase (retail release, not announcement date).

Date format rules:
- Preferred: YYYY-MM-DD (full date)
- Accepted: YYYY-MM, YYYY, MMM YYYY, Month YYYY
- If you can only prove the year, return "YYYY"
- If you can only prove month+year, return "YYYY-MM" or "MMM YYYY"
- NEVER return ranges (e.g. "Q1 2024"), relative phrases ("last year"), or announcements without launch dates
- If you cannot prove any release date with evidence, return "unk" and explain why in unknown_reason

Evidence requirements (CRITICAL — publisher will reject low-evidence candidates):
- Provide AT LEAST 1 evidence entry with a source URL and excerpt showing the release date
- Include an excerpt string copied from the source that contains the date
- Tag each source with a tier (classification only, no ranking)

Source tiers:
- tier1: manufacturer / brand-official / press release
- tier2: professional testing lab / review lab
- tier3: authorized retailer / marketplace (Amazon first-available, PCPartPicker, TechPowerUp DB)
- tier4: community / forum / blog / user-generated
- tier5: specs aggregator / product database
- other: anything that doesn't fit the above

Confidence guidance:
- 90-100: multiple tier1/tier2 sources agree on exact date
- 70-89:  single tier1 source OR multiple tier2 agreeing on month/year
- 50-69:  single tier2 source OR multiple tier3 agreeing on year
- 0-49:   only weak/contradicting sources — prefer returning "unk" with unknown_reason

{{PREVIOUS_DISCOVERY}}Search strategy:
- Query manufacturer's product page, press page, and news archive
- Check PCPartPicker, TechPowerUp DB, mousespecs.org (for mice), eloshapes.com
- Retailer listings often show "Date first available"
- Reviews typically cite launch dates in opening paragraphs

Return JSON:
- "release_date": "YYYY-MM-DD" | "YYYY-MM" | "YYYY" | "MMM YYYY" | "Month YYYY" | "unk"
- "confidence": 0-100
- "unknown_reason": "..." (required if release_date is "unk"; empty string otherwise)
- "evidence": [{ "source_url": "...", "source_page": "...", "tier": "tier1|tier2|tier3|tier4|tier5|other", "excerpt": "..." }, ...]
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

  const discoverySection = (previousDiscovery.urlsChecked.length > 0 || previousDiscovery.queriesRun.length > 0)
    ? `Previous searches for this variant (do not repeat — find NEW sources or confirm these):\n${previousDiscovery.urlsChecked.length > 0 ? `- URLs already checked: ${JSON.stringify(previousDiscovery.urlsChecked)}\n` : ''}${previousDiscovery.queriesRun.length > 0 ? `- Queries already run: ${JSON.stringify(previousDiscovery.queriesRun)}\n` : ''}\n`
    : '';

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

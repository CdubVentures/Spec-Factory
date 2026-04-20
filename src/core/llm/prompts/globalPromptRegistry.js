/**
 * Global prompt registry — single source of truth for universal prompt
 * fragments shared across finders (CEF, PIF, RDF, future).
 *
 * Adding a new global prompt means editing exactly this one file: declare
 * the key, default template, variables, appliesTo scope, label, and
 * description. Consumers call resolveGlobalPrompt(key) to get the
 * current value (user override from snapshot, or default if unset/blank).
 *
 * Scope of "universal": fragments reused across finders with the same
 * semantic. Per-category main discovery templates stay per-category
 * (category_authority/<cat>/<finder>_settings.json) — those aren't here.
 */

import { getGlobalPrompts } from './globalPromptStore.js';

const IDENTITY_VARS = [
  { name: 'BRAND', required: false },
  { name: 'MODEL', required: false },
  { name: 'FAMILY_MODEL_COUNT', required: false },
  { name: 'FIELD_DOMAIN_NOUN', required: false },
];

const SIBLINGS_VARS = [
  { name: 'SIBLING_LIST', required: true },
  { name: 'FIELD_DOMAIN_NOUN', required: false },
];

const DISCOVERY_VARS = [
  { name: 'SCOPE_LABEL', required: false },
  { name: 'URL_LIST', required: false },
  { name: 'QUERY_LIST', required: false },
];

export const GLOBAL_PROMPTS = {
  evidenceContract: {
    label: 'Evidence contract',
    description: 'Evidence tier rules + minimum evidence refs. Applied to CEF + RDF finders; PIF is the documented exception (image URL is the evidence).',
    appliesTo: ['cef', 'rdf'],
    variables: [{ name: 'MIN_EVIDENCE_REFS', required: true }],
    defaultTemplate: `Evidence requirements (CRITICAL — publisher will reject low-evidence candidates):
- Provide AT LEAST {{MIN_EVIDENCE_REFS}} evidence entry with a source URL
- Tag each source with a tier (classification only, no ranking)
- Rate your confidence (0-100) that each source supports the claim

Source tiers:
- tier1: manufacturer / brand-official / press release
- tier2: professional testing lab / review lab
- tier3: authorized retailer / marketplace
- tier4: community / forum / blog / user-generated
- tier5: specs aggregator / product database
- other: anything that doesn't fit the above`,
  },

  evidenceVerification: {
    label: 'Evidence URL verification',
    description: 'Mandates the LLM fetch each URL live before citing. Paired with evidence contract.',
    appliesTo: ['cef', 'rdf'],
    variables: [],
    defaultTemplate: `Evidence verification (MANDATORY):
- Every URL you cite in evidence_refs MUST be one you personally fetched with your web tool during this session.
- Do NOT synthesize URLs from training knowledge or pattern-match retailer URL shapes. URLs from the past may have moved or been restructured — only cite what loads NOW.
- Fetch each URL at least once and confirm it returns a 2xx status. If it 404s, redirects to an unrelated page, or times out, omit it entirely.
- Fewer verified sources is better than many unverified sources. The publisher HEAD-checks every URL you cite and strips 4xx/5xx automatically, so citing a hallucinated URL gets you nothing.`,
  },

  valueConfidenceRubric: {
    label: 'Overall value confidence rubric',
    description: 'Tier-anchored calibration for the LLM\'s overall per-value confidence (distinct from per-source confidence).',
    appliesTo: ['cef', 'rdf'],
    variables: [],
    defaultTemplate: `Overall confidence (0-100):
Rate your overall confidence in this value, calibrated against the evidence you cite.
- 90+:   multiple tier1 sources agree, OR a single tier1 source is explicit and unambiguous
- 70-89: a single tier1 source without corroboration, OR multiple tier2/tier3 sources agree
- 50-69: tier2/tier3 sources with partial agreement or minor ambiguity
- 30-49: tier4/tier5 only, OR conflicting signals
- 0-29:  weak, inferred, or contradicted evidence
Do not inflate confidence above what your cited evidence supports.`,
  },

  identityWarningEasy: {
    label: 'Identity warning — easy tier',
    description: 'Emitted when the product has no known siblings (familyModelCount ≤ 1). Positive confirmation line.',
    appliesTo: ['cef', 'pif', 'rdf'],
    variables: [],
    defaultTemplate: 'This product has no known siblings — standard identity matching applies.',
  },

  identityWarningMedium: {
    label: 'Identity warning — medium tier',
    description: 'Emitted when the product has 2+ sibling models with medium ambiguity. CAUTION-level wording.',
    appliesTo: ['cef', 'pif', 'rdf'],
    variables: IDENTITY_VARS,
    defaultTemplate: 'CAUTION: This product has {{FAMILY_MODEL_COUNT}} models in its family. Multiple similar products exist under "{{BRAND}}" with overlapping names. Verify model numbers, product page titles, and URL slugs to confirm you are researching exactly "{{MODEL}}" — do not mix {{FIELD_DOMAIN_NOUN}} from sibling models.',
  },

  identityWarningHard: {
    label: 'Identity warning — hard tier',
    description: 'Emitted when the product has many siblings with hard/high ambiguity. HIGH AMBIGUITY + TRIPLE-CHECK wording.',
    appliesTo: ['cef', 'pif', 'rdf'],
    variables: IDENTITY_VARS,
    defaultTemplate: 'HIGH AMBIGUITY: This product has {{FAMILY_MODEL_COUNT}} models in its family. TRIPLE-CHECK every source cites the exact "{{MODEL}}" — do not mix {{FIELD_DOMAIN_NOUN}} from sibling models.',
  },

  siblingsExclusion: {
    label: 'Siblings exclusion line',
    description: 'Appended after the identity warning when known sibling model names are available.',
    appliesTo: ['cef', 'pif', 'rdf'],
    variables: SIBLINGS_VARS,
    defaultTemplate: 'This product is NOT: {{SIBLING_LIST}}. Do not use {{FIELD_DOMAIN_NOUN}} from those models.',
  },

  discoveryHistoryBlock: {
    label: 'Previous discovery history block',
    description: 'Header line for the block showing URLs/queries already tried in prior runs. The URL + query list values are injected as resolved variables.',
    appliesTo: ['cef', 'pif', 'rdf'],
    variables: DISCOVERY_VARS,
    defaultTemplate: 'Previous searches for {{SCOPE_LABEL}} (do not repeat — find NEW sources or confirm these):',
  },
};

export const GLOBAL_PROMPT_KEYS = Object.freeze(Object.keys(GLOBAL_PROMPTS));

export function resolveGlobalPrompt(key) {
  const entry = GLOBAL_PROMPTS[key];
  if (!entry) {
    throw new Error(`unknown global prompt key: ${key}`);
  }
  const override = getGlobalPrompts()[key];
  if (typeof override === 'string' && override.trim().length > 0) {
    return override;
  }
  return entry.defaultTemplate;
}

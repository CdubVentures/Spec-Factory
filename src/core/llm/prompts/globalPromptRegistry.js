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

  evidenceKindGuidance: {
    label: 'Evidence kind guidance',
    description: 'Tags each evidence_ref with supporting_evidence + evidence_kind. Paired with evidence contract. Does Not Apply to: CEF + PIF + Carousel Builder.',
    appliesTo: ['rdf', 'scalar'],
    variables: [],
    defaultTemplate: `For EACH evidence_ref, include TWO additional fields:

- "supporting_evidence": <=280 chars. Either the EXACT on-page quote that
  supports the claim, or — for deductive cases — a one-line summary of the
  reasoning tying the URL to the claim.
- "evidence_kind": one of the following. Pick the most specific match.

  direct_quote          — verbatim on-page text states the claim
  structured_metadata   — JSON-LD / OG / meta tag / "Date First Available"
  byline_timestamp      — the URL's own publish/review date IS the proxy
  artifact_metadata     — PDF manual/datasheet file metadata (footer, rev)
  visual_inspection     — read from product images/renders
  lab_measurement       — third-party test lab value (RTINGS, TFT Central)
  comparative_rebadge   — component is a known OEM-part rebadge
  inferred_reasoning    — chain-of-reasoning across multiple signals
  absence_of_evidence   — the negative case (no listings before X)
  identity_only         — URL proves SKU exists, NOT the field value

Rules:
- identity_only refs do NOT satisfy the minimum-evidence threshold — at least
  one ref per field must be a substantive kind.
- supporting_evidence MUST be "" when evidence_kind is identity_only.
- For direct_quote: copy text exactly as it appears, do not paraphrase.
- For inferred_reasoning: name the signals you combined (e.g. "review dated
  2023-10 + Corsair press release 2023-10-12 + Amazon listing from Oct 2023").`,
  },

  valueConfidenceRubric: {
    label: 'Value confidence rubric',
    description: 'Epistemic calibration for per-source AND overall value-level confidence. Tier is a URL-type label only and does not factor into the confidence number.',
    appliesTo: ['cef', 'rdf'],
    variables: [],
    defaultTemplate: `Confidence (0-100) — per-source AND overall:
Rate how CONCRETE and UNAMBIGUOUS your interpretation of the content is. Epistemic self-rating; tier is a URL-type label ONLY and does not factor into confidence. A tier1 page with vague wording can score 60; a tier4 post stating the claim literally can score 95.

- 90+:   Content states the claim literally or in clear paraphrase. Reading, not inferring.
- 70-89: Content clearly implies the claim; light inference required.
- 50-69: Content partially supports; meaningful interpretation needed.
- 30-49: Content is tangentially related; heavy inference required.
- 0-29:  Weak, contradicted, or not meaningfully supportive.

Overall confidence: compose across sources — do NOT clip to the weakest. A literal 95 source + an implying 75 source = overall 95, because the literal source alone resolves the question.

Do not inflate confidence beyond what the cited evidence supports.`,
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

  identityIntro: {
    label: 'Identity intro line',
    description: 'Opens a discovery prompt with the exact-product lookup + sibling-skip sentence. Shared by PIF-view, PIF-hero, RDF, SKU. CEF has its own opening framing (Find every official color and every official edition) and does NOT consume this fragment.',
    appliesTo: ['pif', 'rdf', 'scalar'],
    variables: [
      { name: 'BRAND', required: false },
      { name: 'MODEL', required: false },
      { name: 'VARIANT_SUFFIX', required: false },
    ],
    defaultTemplate: 'IDENTITY: You are looking for the EXACT product "{{BRAND}} {{MODEL}}"{{VARIANT_SUFFIX}}. Not a different model in the same product family. If you encounter sibling models, skip them.',
  },

  discoveryLogShape: {
    label: 'Discovery log return-JSON shape',
    description: 'Basic discovery_log JSON shape returned by PIF-view, PIF-hero, RDF, SKU. CEF uses an extended shape with identity-gate extras (confirmed_from_known, added_new, rejected_from_known) and does NOT consume this fragment.',
    appliesTo: ['pif', 'rdf', 'scalar'],
    variables: [],
    defaultTemplate: '- "discovery_log": { "urls_checked": [...], "queries_run": [...], "notes": [...] }',
  },

  scalarSourceGuidanceCloser: {
    label: 'Scalar finder — source guidance closer',
    description: 'Closer line after the tier1/tier2/tier3/tier4 source-guidance block in scalar finders (RDF, SKU). Tells the LLM the above describes kind-of-evidence and tagging, not a script.',
    appliesTo: ['rdf', 'scalar'],
    variables: [],
    defaultTemplate: 'You decide which sources to query and in what order — the above describes what kind of evidence counts and how to tag it, not a script to execute.',
  },

  siblingVariantsExclusion: {
    label: 'Sibling variants exclusion',
    description: 'Lists OTHER variants of the same product. Injected into per-variant finder prompts (PIF-view, PIF-loop, RDF, SKU) so the LLM skips images/SKUs/dates for variants other than the target. Empty when the product has only one variant. NOT used by PIF-hero (separate call path) or CEF (generates variants rather than filtering them).',
    appliesTo: ['pif', 'rdf', 'scalar'],
    variables: [
      { name: 'VARIANT_LABEL', required: true },
      { name: 'WHAT_TO_SKIP', required: true },
      { name: 'SIBLING_VARIANTS_LIST', required: true },
    ],
    defaultTemplate: `Other variants of this same product — DO NOT return {{WHAT_TO_SKIP}} for these; this call targets ONLY the "{{VARIANT_LABEL}}" variant:
{{SIBLING_VARIANTS_LIST}}`,
  },

  scalarReturnJsonTail: {
    label: 'Scalar finder — return-JSON tail',
    description: 'Bundles confidence + unknown_reason + extended evidence_refs (5-field) + discovery_log for scalar finders (RDF, SKU, future price/msrp/discontinued). VALUE_NOUN fills phrases like "returned date" or "returned MPN". VALUE_KEY fills the "unk" check. UNKNOWN_REASON_EXAMPLES is an optional suffix — pass empty string when no examples are desired.',
    appliesTo: ['rdf', 'scalar'],
    variables: [
      { name: 'VALUE_NOUN', required: true },
      { name: 'VALUE_KEY', required: true },
      { name: 'UNKNOWN_REASON_EXAMPLES', required: false },
    ],
    defaultTemplate: `- "confidence": 0-100 (your overall confidence in the returned {{VALUE_NOUN}} — see rubric above)
- "unknown_reason": "..." (required if {{VALUE_KEY}} is "unk"; empty string otherwise{{UNKNOWN_REASON_EXAMPLES}})
- "evidence_refs": [{ "url": "...", "tier": "tier1|tier2|tier3|tier4|tier5|other", "confidence": 0-100, "supporting_evidence": "...", "evidence_kind": "..." }, ...]
- "discovery_log": { "urls_checked": [...], "queries_run": [...], "notes": [...] }`,
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

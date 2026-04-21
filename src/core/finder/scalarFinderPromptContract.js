/**
 * Scalar finder prompt contract — shared bundle for variantFieldProducer modules.
 *
 * WHY: RDF, SKU (and future scalar finders — price, msrp, discontinued, upc)
 * all share the same GUI contract for the Discovery Prompt editor:
 *   - 9 canonical template variables (BRAND, MODEL, VARIANT_*, IDENTITY_*,
 *     EVIDENCE_REQUIREMENTS, VALUE_CONFIDENCE_GUIDANCE, SCALAR_*, PREVIOUS_DISCOVERY)
 *   - 5 canonical user-message fields
 *   - storage scope 'module' with settingKey 'discoveryPromptTemplate'
 *
 * Extracting these into this file means adding a new scalar finder requires
 * ONE registry edit (add `defaultTemplateExport` to the FINDER_MODULES entry)
 * and NO edit to phaseSchemaRegistry.js. The overlay is derived at load time
 * from the codegen'd FINDER_SCALAR_DEFAULT_TEMPLATES map.
 *
 * Bespoke finder overlays (CEF identity-check, PIF view + hero, carousel
 * builder per-view eval) do NOT use this contract — their multi-prompt
 * structures have bespoke overlay blocks in phaseSchemaRegistry.js.
 */

export const SCALAR_FINDER_VARIABLES = Object.freeze([
  { name: 'BRAND', description: 'e.g. "Logitech"', required: true, category: 'deterministic' },
  { name: 'MODEL', description: 'e.g. "G502 X Plus"', required: true, category: 'deterministic' },
  { name: 'VARIANT_DESC', description: 'e.g. the "black" color variant — or the "COD BO6" edition', required: true, category: 'deterministic' },
  { name: 'VARIANT_SUFFIX', description: 'e.g. " (variant: black)" — empty when no variant', required: false, category: 'deterministic' },
  { name: 'VARIANT_TYPE_WORD', description: '"color" or "edition"', required: false, category: 'deterministic' },
  { name: 'IDENTITY_INTRO', description: 'Opening "IDENTITY: You are looking for the EXACT product..." line with sibling-skip sentence. Shared by PIF-view, PIF-hero, RDF, SKU. Edit text via Global Prompts (identityIntro).', required: false, category: 'global-fragment' },
  { name: 'IDENTITY_WARNING', description: 'Unified block from buildIdentityWarning (src/core/llm/prompts/). 3 tiers: easy="no known siblings" | medium="CAUTION: ..." | hard="HIGH AMBIGUITY: TRIPLE-CHECK". Includes the siblings-exclusion line when sibling models are provided. Edit text via Global Prompts in LLM Config.', required: false, category: 'global-fragment' },
  { name: 'EVIDENCE_REQUIREMENTS', description: 'Evidence contract + URL verification block. Sourced from the Global Prompts panel (evidenceContract + evidenceVerification).', required: false, category: 'global-fragment' },
  { name: 'VALUE_CONFIDENCE_GUIDANCE', description: 'Epistemic confidence rubric (per-source + overall). Tier is a URL-type label only and does not factor into confidence. Sourced from the Global Prompts panel (valueConfidenceRubric).', required: false, category: 'global-fragment' },
  { name: 'SCALAR_SOURCE_GUIDANCE_CLOSER', description: '"You decide which sources to query..." closer line after the source guidance block. Shared by RDF + SKU + future scalar finders. Edit via Global Prompts (scalarSourceGuidanceCloser).', required: false, category: 'global-fragment' },
  { name: 'PREVIOUS_DISCOVERY', description: 'Previously searched URLs + queries for this variant. Empty on first run. Header text editable in Global Prompts (discoveryHistoryBlock).', required: false, category: 'global-fragment' },
  { name: 'SCALAR_RETURN_JSON_TAIL', description: 'Return-JSON tail bundling confidence + unknown_reason + extended evidence_refs (5-field) + discovery_log. Shared by RDF + SKU. Edit via Global Prompts (scalarReturnJsonTail).', required: false, category: 'global-fragment' },
]);

export const SCALAR_FINDER_USER_MESSAGE_INFO = Object.freeze([
  { field: 'brand', description: 'e.g. "Logitech"' },
  { field: 'model', description: 'e.g. "G502 X Plus"' },
  { field: 'base_model', description: 'e.g. "G502 X"' },
  { field: 'variant_label', description: 'e.g. "black" or "COD BO6 Edition"' },
  { field: 'variant_type', description: '"color" or "edition"' },
]);

/**
 * Build the prompt_templates array for one scalar finder.
 *
 * @param {object} opts
 * @param {string} opts.moduleId — e.g. 'releaseDateFinder'
 * @param {string} opts.defaultTemplate — the finder's default prompt string
 * @param {string} [opts.label='Discovery Prompt']
 * @param {string} [opts.settingKey='discoveryPromptTemplate']
 * @returns {Array}
 */
export function buildScalarFinderPromptTemplates({ moduleId, defaultTemplate, label = 'Discovery Prompt', settingKey = 'discoveryPromptTemplate' }) {
  return [
    {
      promptKey: 'discovery',
      label,
      storageScope: 'module',
      moduleId,
      settingKey,
      defaultTemplate,
      variables: SCALAR_FINDER_VARIABLES,
      userMessageInfo: SCALAR_FINDER_USER_MESSAGE_INFO,
    },
  ];
}

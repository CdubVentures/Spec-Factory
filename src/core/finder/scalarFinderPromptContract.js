/**
 * Scalar finder prompt contract — shared bundle for variantFieldProducer modules.
 *
 * WHY: RDF, SKU (and future variant-scoped scalar finders — price, msrp,
 * discontinued, upc) all share the same GUI contract for the Discovery
 * Prompt editor:
 *   - 15 canonical template variables (BRAND, MODEL, VARIANT_*, IDENTITY_*,
 *     EVIDENCE_REQUIREMENTS, VALUE_CONFIDENCE_GUIDANCE, SOURCE_GUIDANCE,
 *     VARIANT_DISAMBIGUATION, UNK_POLICY, SIBLING_VARIANTS, PREVIOUS_DISCOVERY,
 *     SCALAR_RETURN_JSON_TAIL)
 *   - 5 canonical user-message fields
 *   - storage scope 'module' with settingKey 'discoveryPromptTemplate'
 *
 * Registration auto-wires two globals:
 *   - variantScalarSourceGuidance  ← slot bag sourceVariantGuidanceSlots
 *   - variantScalarDisambiguation  ← slot bag variantDisambiguationSlots
 * Slot-bag validation throws at registration if required keys are missing, so
 * a new variant scalar finder cannot register without declaring both.
 *
 * Bespoke finder overlays (CEF identity-check, PIF view + hero, carousel
 * builder per-view eval) do NOT use this contract — their multi-prompt
 * structures have bespoke overlay blocks in phaseSchemaRegistry.js.
 *
 * keyFinder is product-scoped (no sibling-variant disambiguation, no variant
 * descriptor) and routes to buildKeyFinderPromptTemplates instead.
 */

import {
  VARIANT_SOURCE_GUIDANCE_SLOT_KEYS,
  VARIANT_DISAMBIGUATION_SLOT_KEYS,
} from '../llm/prompts/globalPromptRegistry.js';

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
  { name: 'UNK_POLICY', description: 'Universal "honest unk beats low-confidence guess" policy. Tells the LLM when to return "unk" with a clear unknown_reason vs paraphrased/guessed value. Shared by keyFinder + RDF + SKU. Edit via Global Prompts (unkPolicy).', required: false, category: 'global-fragment' },
  { name: 'SOURCE_GUIDANCE', description: '4-tier source guidance block (PRIMARY / RETAILER / INDEPENDENT / COMMUNITY). Composed from the variantScalarSourceGuidance global and the finder-specific sourceVariantGuidanceSlots bag. Includes the "You decide which sources to query..." closer inline.', required: false, category: 'global-fragment' },
  { name: 'VARIANT_DISAMBIGUATION', description: 'Named VARIANT DISAMBIGUATION block with 4 numbered rules. Composed from the variantScalarDisambiguation global and the finder-specific variantDisambiguationSlots bag. Required for every variant-scoped scalar finder.', required: false, category: 'global-fragment' },
  { name: 'SIBLING_VARIANTS', description: 'Other variants of this same product (e.g. list of other colors/editions the LLM should skip). Empty when the product has only one variant. Shared by PIF-view, PIF-loop, RDF, SKU. Edit text via Global Prompts (siblingVariantsExclusion).', required: false, category: 'global-fragment' },
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

function validateSlotBag(moduleId, bagName, bag, requiredKeys) {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
    throw new Error(`buildScalarFinderPromptTemplates(${moduleId}): ${bagName} must be an object keyed by slot name`);
  }
  const missing = requiredKeys.filter((k) => typeof bag[k] !== 'string');
  if (missing.length > 0) {
    throw new Error(`buildScalarFinderPromptTemplates(${moduleId}): ${bagName} missing required slot(s): ${missing.join(', ')}`);
  }
}

/**
 * Build the prompt_templates array for one variant-scoped scalar finder.
 *
 * @param {object} opts
 * @param {string} opts.moduleId — e.g. 'releaseDateFinder'
 * @param {string} opts.defaultTemplate — the finder's default prompt string
 * @param {object} opts.sourceVariantGuidanceSlots — required; see VARIANT_SOURCE_GUIDANCE_SLOT_KEYS
 * @param {object} opts.variantDisambiguationSlots — required; see VARIANT_DISAMBIGUATION_SLOT_KEYS
 * @param {string} [opts.label='Discovery Prompt']
 * @param {string} [opts.settingKey='discoveryPromptTemplate']
 * @returns {Array}
 */
export function buildScalarFinderPromptTemplates({
  moduleId,
  defaultTemplate,
  sourceVariantGuidanceSlots,
  variantDisambiguationSlots,
  label = 'Discovery Prompt',
  settingKey = 'discoveryPromptTemplate',
}) {
  validateSlotBag(moduleId, 'sourceVariantGuidanceSlots', sourceVariantGuidanceSlots, VARIANT_SOURCE_GUIDANCE_SLOT_KEYS);
  validateSlotBag(moduleId, 'variantDisambiguationSlots', variantDisambiguationSlots, VARIANT_DISAMBIGUATION_SLOT_KEYS);
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

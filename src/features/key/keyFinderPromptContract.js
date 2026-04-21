/**
 * Key Finder prompt contract — productFieldProducer variable set.
 *
 * RDF / SKU are variant-scoped scalar finders and use SCALAR_FINDER_VARIABLES
 * (which includes per-variant tokens like VARIANT_DESC, VARIANT_TYPE_WORD).
 * keyFinder is product-scoped (once per product, primary + optional passengers)
 * so its variable set is fundamentally different. Declaring it here keeps the
 * GUI's PromptTemplateEditor from flagging missing variant-specific variables
 * that keyFinder intentionally omits.
 *
 * Category tags drive the three-section display in VariableReferencePanels:
 *   - deterministic       → system injects based on input (product, field rule)
 *   - global-fragment     → resolved from globalPromptRegistry
 */

export const KEY_FINDER_VARIABLES = Object.freeze([
  // Identity (deterministic)
  { name: 'BRAND', description: 'e.g. "Logitech"', required: true, category: 'deterministic' },
  { name: 'MODEL', description: 'e.g. "G502 X Plus"', required: true, category: 'deterministic' },
  { name: 'VARIANT_SUFFIX', description: 'e.g. " (variant: black)" \u2014 empty when no variant', required: false, category: 'deterministic' },
  { name: 'CATEGORY', description: 'e.g. "mouse"', required: false, category: 'deterministic' },
  { name: 'VARIANT_COUNT', description: 'Total variant count for this product (e.g. "4")', required: false, category: 'deterministic' },

  // Primary key (deterministic, field-rule driven)
  { name: 'PRIMARY_FIELD_KEY', description: 'The primary field_key being extracted (with display_name). Required \u2014 every keyFinder call has exactly one primary.', required: true, category: 'deterministic' },
  { name: 'PRIMARY_FIELD_GUIDANCE', description: 'Extraction guidance for the primary key. Sourced from field_rule.ai_assist.reasoning_note (edited in Field Studio \u2192 Key Navigator \u2192 Extraction Guidance). Empty when unauthored.', required: false, category: 'deterministic' },
  { name: 'PRIMARY_FIELD_CONTRACT', description: 'Return contract for the primary key: type, shape, unit, rounding, list rules, enum values (resolved), variance policy, unknown_reason_default, aliases.', required: true, category: 'deterministic' },
  { name: 'PRIMARY_SEARCH_HINTS', description: 'domain_hints + query_terms + query_templates for the primary key. Gated by the Pipeline Settings knob "Search hints". Primary-only \u2014 passengers inherit the primary search session.', required: false, category: 'deterministic' },
  { name: 'PRIMARY_CROSS_FIELD_CONSTRAINTS', description: 'Rendered from fieldRule.cross_field_constraints. Empty when the rule has no cross-field relations.', required: false, category: 'deterministic' },
  { name: 'PRIMARY_COMPONENT_KEYS', description: 'Component context relevant to the primary key (parent type + resolved value). Gated by the Pipeline Settings knob "Component values". Empty when no relation.', required: false, category: 'deterministic' },

  // Additional keys \u2014 split into top-level placeholders (mirrors primary structure)
  { name: 'ADDITIONAL_FIELD_KEYS', description: 'Outline of passenger keys with display names. Empty when bundling is off or no passengers in this call.', required: false, category: 'deterministic' },
  { name: 'ADDITIONAL_FIELD_GUIDANCE', description: 'Per-passenger extraction guidance concatenated with labels. Empty when no passengers have non-empty reasoning_note.', required: false, category: 'deterministic' },
  { name: 'ADDITIONAL_FIELD_CONTRACT', description: 'Per-passenger return contract sections (aliases included). Empty when no passengers.', required: false, category: 'deterministic' },
  { name: 'ADDITIONAL_CROSS_FIELD_CONSTRAINTS', description: 'Per-passenger cross-field constraints. Empty when passengers have no cross-field relations.', required: false, category: 'deterministic' },
  { name: 'ADDITIONAL_COMPONENT_KEYS', description: 'Per-passenger component context. Gated by the Pipeline Settings knob "Component values".', required: false, category: 'deterministic' },

  // Product-level context (deterministic, shared across primary + passengers)
  { name: 'KNOWN_PRODUCT_FIELDS', description: 'Already-published non-component field values on this product. Gated by the Pipeline Settings knob "Known fields".', required: false, category: 'deterministic' },

  // Global fragments
  { name: 'IDENTITY_INTRO', description: 'Opening "IDENTITY: You are looking for the EXACT product..." line with sibling-skip sentence. Edit text via Global Prompts (identityIntro).', required: false, category: 'global-fragment' },
  { name: 'IDENTITY_WARNING', description: 'Tiered identity-ambiguity warning (easy / medium / hard). Edit text via Global Prompts (identityWarning*).', required: false, category: 'global-fragment' },
  { name: 'EVIDENCE_CONTRACT', description: 'Evidence requirements + tier definitions + supporting_evidence / evidence_kind guidance. Sourced from Global Prompts (evidenceContract + evidenceKindGuidance).', required: false, category: 'global-fragment' },
  { name: 'EVIDENCE_VERIFICATION', description: 'URL verification mandate (LLM must fetch each URL live). Sourced from Global Prompts (evidenceVerification).', required: false, category: 'global-fragment' },
  { name: 'SOURCE_TIER_STRATEGY', description: 'Universal source-tier strategy (PRIMARY/INDEPENDENT/RETAILER/COMMUNITY). Sourced from Global Prompts (scalarSourceTierStrategy). Shared with future scalar finders; RDF/SKU keep their own field-specific variants.', required: false, category: 'global-fragment' },
  { name: 'SCALAR_SOURCE_GUIDANCE_CLOSER', description: 'Closer line after the source strategy block. Tells the LLM the tier structure describes what kind of evidence counts, not a script. Sourced from Global Prompts (scalarSourceGuidanceCloser).', required: false, category: 'global-fragment' },
  { name: 'VALUE_CONFIDENCE_GUIDANCE', description: 'Epistemic confidence rubric (0-100 scale, tier-independent). Sourced from Global Prompts (valueConfidenceRubric).', required: false, category: 'global-fragment' },
  { name: 'PREVIOUS_DISCOVERY', description: 'URLs + queries from prior runs scoped to this (product, field_key). Header text editable via Global Prompts (discoveryHistoryBlock).', required: false, category: 'global-fragment' },

  // Return shape (deterministic \u2014 composed from primary + passenger keys)
  { name: 'RETURN_JSON_SHAPE', description: 'Multi-key response envelope: primary_field_key, results[...] per field, discovery_log. Composed at prompt build time from the call\u2019s primary + passenger list.', required: true, category: 'deterministic' },
]);

export const KEY_FINDER_USER_MESSAGE_INFO = Object.freeze([
  { field: 'brand', description: 'e.g. "Logitech"' },
  { field: 'model', description: 'e.g. "G502 X Plus"' },
  { field: 'primary_field_key', description: 'The field_key this call targets as primary' },
  { field: 'passenger_count', description: 'Number of passenger keys bundled into this call (0 when solo)' },
  { field: 'variant_count', description: 'Total variant count for this product' },
]);

/**
 * Build the prompt_templates array for keyFinder's Discovery Prompt editor.
 *
 * @param {object} opts
 * @param {string} opts.moduleId        \u2014 always 'keyFinder'
 * @param {string} opts.defaultTemplate \u2014 KEY_FINDER_DEFAULT_TEMPLATE
 * @param {string} [opts.label='Discovery Prompt']
 * @param {string} [opts.settingKey='discoveryPromptTemplate']
 */
export function buildKeyFinderPromptTemplates({ moduleId, defaultTemplate, label = 'Discovery Prompt', settingKey = 'discoveryPromptTemplate' }) {
  return [
    {
      promptKey: 'discovery',
      label,
      storageScope: 'module',
      moduleId,
      settingKey,
      defaultTemplate,
      variables: KEY_FINDER_VARIABLES,
      userMessageInfo: KEY_FINDER_USER_MESSAGE_INFO,
    },
  ];
}

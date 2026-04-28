// ── Studio constants: option arrays, tooltip text, shared styles ────

// ── Shared style classes ────────────────────────────────────────────
import { FIELD_RULE_STUDIO_TIPS } from '../../../../src/field-rules/fieldRuleSchema.js';

export const selectCls = 'sf-input w-full rounded border px-2 py-1.5 sf-text-label';
export const inputCls = 'sf-input w-full rounded border px-2 py-1.5 sf-text-label';
export const labelCls = 'sf-text-caption font-medium mb-1';

// ── Dropdown option arrays ──────────────────────────────────────────
// WHY: UNITS constant removed — contract.unit dropdown now pulls from the
// managed unit registry API (GET /unit-registry/canonicals).
export const GROUPS = [
  'general', 'connectivity', 'construction', 'controls', 'dimensions',
  'electronics', 'encoder', 'ergonomics', 'sensor_performance', 'switches',
];
export const NORMALIZE_MODES = [
  { value: 'lower_trim', label: 'Lowercase + Trim' },
  { value: 'raw', label: 'Raw (as-is)' },
  { value: 'lower', label: 'Lowercase only' },
];

// ── Tag-picker suggestion arrays ────────────────────────────────────
export const DOMAIN_HINT_SUGGESTIONS = [
  'manufacturer', 'rtings.com', 'techpowerup.com', 'support', 'manual', 'pdf', 'datasheet',
];
export const CONTENT_TYPE_SUGGESTIONS = [
  'spec_sheet', 'datasheet', 'review', 'manual', 'pdf', 'product_page', 'support', 'forum',
];
// ── Tier definitions for TierPicker ─────────────────────────────────
export const TIER_DEFS = [
  { id: 'tier1', label: 'Tier 1 \u2013 Manufacturer (OEM specs)' },
  { id: 'tier2', label: 'Tier 2 \u2013 Lab / Independent tests' },
  { id: 'tier3', label: 'Tier 3 \u2013 Retailer (store listings)' },
  { id: 'tier4', label: 'Tier 4 \u2013 Community (forums/reviews)' },
  { id: 'tier5', label: 'Tier 5 \u2013 Aggregator (comparison sites)' },
] as const;

// ── Tooltip text for every studio input ─────────────────────────────
const LOCAL_STUDIO_TIPS: Record<string, string> = {
  // Tab 1: Mapping Studio
  tooltip_bank_file: 'Path to a JS/JSON/MD file with tooltip text for field keys. Auto-discovered if matching hbs_tooltips*.',
  tooltip_section_tooltip_bank: 'Tooltips source controls the shared tooltip reference file used for field guidance.',
  tooltip_section_component_sources: 'Component Source Mapping stores component identity aliases, links, and attributes used for matching.',
  tooltip_section_enums: 'Enum lists define canonical values for fields and drive enum validation and suggestions.',
  component_type: 'Type of component this row declares (sensor, switch, encoder, material). Used as the component reference key.',
  comp_field_key: 'Select a field key to bind this component attribute to. Type, unit, parse template, and evidence rules are inherited from the field key definition.',
  comp_variance_policy: 'How the component DB value relates to the product spec value.\n\n'
    + 'authoritative \u2014 Component value IS the product value (default).\n'
    + 'upper_bound \u2014 Component gives the maximum possible value.\n'
    + 'lower_bound \u2014 Component gives the minimum value.\n'
    + 'range \u2014 Component provides reference range (\u00b1tolerance).',
  comp_override_allowed: 'When checked, products are allowed to have different values for this property without triggering review flags.\n\n'
    + 'Matching: Property comparison still runs during component identification but with reduced confidence (0.60 vs 0.85).\n'
    + 'Review Grid: Variance enforcement is skipped entirely \u2014 no violation flags, no review needed.\n'
    + 'Cascade: When this component property changes, propagation to linked products is lowest priority.\n\n'
    + 'Use this for properties that can legitimately vary per product implementation, '
    + 'e.g. a sensor supports 30K DPI but the product firmware limits it to 26K.',
  comp_tolerance: 'Numeric tolerance for upper_bound/lower_bound policies. E.g. tolerance=5 means \u00b15 from the component value.',
  comp_constraints: 'Cross-field validation rules. E.g. "component_release_date <= product_release_date" ensures the component existed before the product.',

  // Enums
  data_list_field: 'Enum bucket name (e.g. "form_factor"). Becomes the data_lists.{name} reference used by enum sources.',
  data_list_normalize: 'How to normalize enum values. Lowercase + Trim is recommended.',
  data_list_manual_values: 'Enum values for this field. Used during extraction and validation.',

  // Tab 2: Key Navigator - Contract
  key_section_contract: 'Contract defines the field data type, shape, unit, and numeric formatting applied during parsing and reporting.',
  list_rules: 'List normalization rules for list-shaped contracts. IDX applies these rules during runtime normalization when the field resolves to a list.',
  list_rules_item_union: 'How approved list candidates merge across sources. Leave blank to keep the winning list only.',

  // Tab 2: Key Navigator - Priority
  key_section_priority: 'Extraction priority controls scheduling, routing, and model/search budget.',
  // Tab 2: Key Navigator - Enum
  key_section_enum: 'Enum policy and enum source define accepted vocabulary, matching behavior, and suggestions for this field.',
  // Tab 2: Key Navigator - Enum (expanded)
  enum_value_source: 'Where enum values come from. Values are authored in the Mapping Studio data lists. Use data_lists.{name} to link a field to an enum list.',
  enum_detected_values: 'Values currently in the known_values list for this field. Blue = from canonical source. Amber = discovered during pipeline runs (not yet in canonical list).',
  enum_component_values: 'Entity names from the component database. Shows all components of this type with their maker and aliases.',

  // Tab 2: Key Navigator - Evidence
  key_section_evidence: 'Evidence settings determine proof requirements and confidence thresholds for accepting values for this field.',
  // Tab 2: Key Navigator - UI & Display
  key_section_ui: 'Tooltip guidance is display help for users in generated product views. It is separate from the AI reasoning note.',
  ui_label: 'Human-readable display name shown in UI and reports (e.g. \'Weight\' instead of \'weight_grams\').',
  ui_group: 'Category for organizing fields in the sidebar and reports. Fields with the same group appear together.',
  display_mode: 'When to show this field. all: always, summary: compact views only, detailed: expanded views only.',
  ui_suffix: 'Text after the value in display (e.g. \'g\' for \'80 g\'). Usually matches the unit.',
  ui_prefix: 'Text before the value (e.g. \'$\' for \'$59.99\').',
  display_decimals: 'Decimal places for display rendering. Does not affect stored precision.',
  ui_order: 'Sort position within its group. Lower = first. Same order = alphabetical.',
  tooltip_guidance: 'Markdown tooltip shown to users in the final spec output. UI-only; not the AI reasoning note sent to keyFinder.',
  // Tab 2: Key Navigator - Search Hints & Aliases
  key_section_search: 'Search hints and aliases bias crawling and extraction by prioritizing source phrases, domains, content types, and query terms.',
  content_types: 'Content types most likely to have this data. E.g. spec_sheet, datasheet, review, manual, pdf.',

  // Tab 2: Key Navigator - Component
  key_section_components: 'Component settings control matching and inference from component databases.',
  component_lock: 'This key is locked as a component. Source is owned by the Field Studio Map.',
  key_section_constraints: 'Cross-field constraints enforce logical relationships and consistency checks between this field and others.',
  comp_allow_new: 'If enabled, the pipeline can suggest new components not in the database when no fuzzy match meets the flag_review_score threshold. Suggestions are flagged for review. If disabled, unmatched values are rejected.',
  comp_require_identity_evidence: 'If enabled, component identity matching requires supporting evidence from at least one source. Prevents phantom component assignments from noisy extraction.',

  // Tab 2: Key Navigator - Ai Assist
  key_section_ai_assist: 'AI Assist controls field-specific prompt guidance and whether keyFinder receives color and edition context.',
  // Tab 3: Field Rules Workbench
  field_contract_table: 'Read-only overview of all field contracts. Edit fields in the Key Navigator tab.',

  // Tab 4: Compile & Reports
  run_compile: 'Generates all pipeline artifacts from current configuration. Check Indexing Lab process output for progress.',
  compile_errors: 'Fatal issues preventing artifact generation. Must be resolved.',
  compile_warnings: 'Non-fatal issues. Review and fix when possible.',
  generated_artifacts: 'Files from the last successful compile. These drive the extraction pipeline.',
  guardrails_report: 'Automated validation checking field rules for consistency and completeness.',
};

export const STUDIO_TIPS: Record<string, string> = Object.freeze({
  ...LOCAL_STUDIO_TIPS,
  ...FIELD_RULE_STUDIO_TIPS,
});

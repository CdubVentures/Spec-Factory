/**
 * Field-rule schema registry — central catalog of authorable field-rule knobs.
 *
 * Each entry describes ONE rule parameter:
 *   - path:       dot-notation accessor into the compiled rule
 *   - label:      human-facing name
 *   - kind:       value kind
 *   - options:    allowed values for enum-like kinds
 *   - appliesWhen: optional rule conditions for meaningful applicability
 *   - doc:        one-line teaching string for author/audit surfaces
 */

export const FIELD_RULE_KINDS = new Set([
  'enum',
  'string',
  'integer',
  'number-nullable',
  'boolean',
  'string-list',
  'ordered-list',
  'constraint-list',
  'component-ref',
  'enum-or-freeform',
  'prose',
  'group-ref',
]);

export const FIELD_RULE_SCHEMA = Object.freeze([
  {
    path: 'priority.required_level',
    label: 'Required level',
    kind: 'enum',
    options: ['mandatory', 'non_mandatory'],
    doc: 'Drives needset scheduling, unk-block publish gate, and per-key LLM budget. Mandatory fields block publish when unk.',
  },
  {
    path: 'priority.availability',
    label: 'Availability',
    kind: 'enum',
    options: ['always', 'sometimes', 'rare'],
    doc: 'Primary sort key in bundling and needset scheduling. Common fields run before rare ones.',
  },
  {
    path: 'priority.difficulty',
    label: 'Difficulty',
    kind: 'enum',
    options: ['easy', 'medium', 'hard', 'very_hard'],
    doc: 'Routes to a tier bundle which selects model + reasoning + thinking + web search.',
  },
  {
    path: 'contract.type',
    label: 'Data type',
    kind: 'enum',
    options: ['string', 'number', 'integer', 'boolean', 'date'],
    doc: 'Drives JSON primitive emission AND filter-UI control — numeric types render as range sliders, strings as toggle chips.',
  },
  {
    path: 'contract.shape',
    label: 'Shape',
    kind: 'enum',
    options: ['scalar', 'list'],
    doc: 'Scalar = single value. List = array with dedupe+sort via list_rules; filter UI becomes multi-select.',
  },
  {
    path: 'contract.unit',
    label: 'Unit',
    kind: 'string',
    doc: 'Storage contract — numeric values stored unit-less, unit applied at render (e.g. "g", "mm", "ms", "hz").',
  },
  {
    path: 'contract.rounding.decimals',
    label: 'Rounding decimals',
    kind: 'integer',
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'Precision for equality compare in the index. Without it, 128 and 128.0000001 survive as different values.',
  },
  {
    path: 'contract.rounding.mode',
    label: 'Rounding mode',
    kind: 'enum',
    options: ['nearest', 'floor', 'ceil', 'half_even'],
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'How to round at precision boundaries. Defaults to nearest.',
  },
  {
    path: 'contract.list_rules.dedupe',
    label: 'List dedupe',
    kind: 'boolean',
    appliesWhen: { 'contract.shape': 'list' },
    doc: 'Removes duplicate values from the emitted list. Usually on for filter-facet lists.',
  },
  {
    path: 'contract.list_rules.sort',
    label: 'List sort',
    kind: 'enum',
    options: ['none', 'asc', 'desc', 'insert'],
    appliesWhen: { 'contract.shape': 'list' },
    doc: 'Stable list order. Use desc for numeric lists where highest-first is the consumer convention.',
  },
  {
    path: 'contract.range.min',
    label: 'Range min',
    kind: 'number-nullable',
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'Numeric lower bound. Stops the LLM from guessing out-of-range values.',
  },
  {
    path: 'contract.range.max',
    label: 'Range max',
    kind: 'number-nullable',
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'Numeric upper bound. Stops the LLM from emitting impossible out-of-range values.',
  },
  {
    path: 'enum.policy',
    label: 'Enum policy',
    kind: 'enum',
    options: ['closed', 'open_prefer_known', 'open'],
    doc: 'closed = reject non-listed. open_prefer_known = accept new with needs_curation. open = trust evidence. Mismatched policy is the most common source of enum pollution.',
  },
  {
    path: 'enum.values',
    label: 'Enum values',
    kind: 'string-list',
    doc: 'Vocabulary for this field. Each non-numeric value becomes a filter chip on the consumer site. Value count is a UX metric: ≤10 healthy, 11–15 fine, 16–20 tolerable, 21–30 fatigue, 30+ broken.',
  },
  {
    path: 'enum.source',
    label: 'Enum source',
    kind: 'enum-or-freeform',
    options: ['(inline)', 'data_lists.<name>'],
    doc: 'Inline values on the rule, or a reference to a shared data list in known_values.',
  },
  {
    path: 'aliases',
    label: 'Aliases',
    kind: 'string-list',
    doc: 'Source-text synonyms the LLM normalizes to the canonical value before emitting.',
  },
  {
    path: 'variance_policy',
    label: 'Variance policy',
    kind: 'enum',
    options: ['authoritative', 'upper_bound', 'lower_bound', 'majority_vote'],
    doc: 'How to resolve disagreeing sources when a product has multiple variants. Left empty for scalar fields without variant variance.',
  },
  {
    path: 'ai_assist.reasoning_note',
    label: 'Extraction guidance',
    kind: 'prose',
    doc: 'The ONE editable extraction-guidance slot. Visual cues, semantic disambiguation, gotchas. Do NOT duplicate anything the generic template already renders (enum list, source tiers, unk policy, evidence contract).',
  },
  {
    path: 'ai_assist.variant_inventory_usage.enabled',
    label: 'Variant inventory context',
    kind: 'boolean',
    doc: 'Single on/off Key Finder checkbox. Enable only when edition/SKU/release/colorway/PIF identity facts add evidence-filter value for this key without ambiguity. Field-specific union/exact/base/default interpretation belongs in ai_assist.reasoning_note.',
  },
  {
    path: 'ai_assist.pif_priority_images.enabled',
    label: 'PIF Priority Images',
    kind: 'boolean',
    doc: 'Single on/off Key Finder checkbox. Enable only for visually answerable keys where default/base PIF priority-view images help. Default/base images are supporting context only; edition-specific interpretation belongs in ai_assist.reasoning_note.',
  },
  {
    path: 'search_hints.domain_hints',
    label: 'Preferred source domains',
    kind: 'string-list',
    doc: 'Hint set the LLM web search prioritizes for this field. Typically manufacturer + a handful of review domains.',
  },
  {
    path: 'search_hints.query_terms',
    label: 'Search query terms',
    kind: 'string-list',
    doc: 'Candidate queries for the LLM search. Keep field-specific; generic product queries belong at the product level.',
  },
  {
    path: 'constraints',
    label: 'Cross-field constraints',
    kind: 'constraint-list',
    doc: 'DSL: "<field> <op> <target>" where op ∈ {lte, lt, gte, gt, eq}. Rendered into the live Key Finder prompt after normalization alongside structured cross_field_constraints.',
  },
  {
    path: 'component.type',
    label: 'Component type',
    kind: 'component-ref',
    doc: 'When this field IS the identity of a component database. Blank for standalone fields or for subfields (subfield relation comes from the component database properties list).',
  },
  {
    path: 'evidence.min_evidence_refs',
    label: 'Min evidence refs',
    kind: 'integer',
    doc: 'Minimum independent supporting evidence URLs to accept a value. Identity-anchoring fields should usually require at least 2 independent sources.',
  },
  {
    path: 'evidence.tier_preference',
    label: 'Evidence tier preference',
    kind: 'ordered-list',
    options: ['tier1', 'tier2', 'tier3'],
    doc: 'Ordered list from most authoritative to least. Default order is tier1 → tier2 → tier3; override per field when a lower-tier source is more trustworthy for that measurement.',
  },
  {
    path: 'group',
    label: 'Group',
    kind: 'group-ref',
    doc: 'Field group (mirrors ui.group). Drives bundling pool eligibility when groupBundlingOnly is on, plus sidebar/section organization in Field Studio and (future) consumer site.',
  },
]);

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
    path: 'variant_dependent',
    label: 'Variant dependent',
    kind: 'boolean',
    doc: 'When true, the field resolves per variant instead of once at product scope. Variant-dependent fields are excluded from product-scoped bundling and render per-variant review lanes.',
    studioControlId: 'variant_dependent',
    studioControlLabel: 'Variant Dependent',
    studioWidget: 'dependency_toggle',
    studioTrueDescription: 'One value per variant (colors, editions, release_date, ...)',
    studioFalseDescription: 'One value per product (weight, dpi, connection, ...)',
    studioTrueAriaLabel: 'Per-variant (on)',
    studioFalseAriaLabel: 'Per-product (off)',
  },
  {
    path: 'product_image_dependent',
    label: 'Product image dependent',
    kind: 'boolean',
    doc: 'When true, resolved values for this field are injected into Product Image Finder search and eval prompts as exact-product identity context.',
    studioControlId: 'product_image_dependent',
    studioControlLabel: 'Product Image Dependent',
    studioWidget: 'dependency_toggle',
    studioTrueDescription: 'Resolved value is injected into PIF search and eval identity context',
    studioFalseDescription: 'PIF image prompts ignore this field value',
    studioTrueAriaLabel: 'Product image dependent (on)',
    studioFalseAriaLabel: 'Product image dependent (off)',
  },
  {
    path: 'priority.required_level',
    label: 'Required level',
    kind: 'enum',
    options: ['mandatory', 'non_mandatory'],
    doc: 'Drives scheduling, publish gate, and per-key LLM budget. Mandatory blocks publish on unk; non_mandatory resolves quietly.',
    studioTipKey: 'required_level',
    studioTip: 'Mandatory if a normal buyer can find this in public evidence (spec sheet, manufacturer page, credible review, canonical product render, or stated component identity) for the typical product in the category. Non_mandatory if the value typically requires lab measurement, product disassembly, or proprietary internal-component identity work that public sources rarely expose.',
    studioControlLabel: 'Required Level',
    studioFallback: 'non_mandatory',
    studioLegacyPath: 'required_level',
    studioOptions: ['mandatory', 'non_mandatory'],
  },
  {
    path: 'priority.availability',
    label: 'Availability',
    kind: 'enum',
    options: ['always', 'sometimes', 'rare'],
    doc: 'Primary sort key in scheduling. Drives how early in a run a field gets searched; common fields run before rare ones.',
    studioTipKey: 'availability',
    studioTip: 'Across the median catalog, what fraction of products expose this in public sources? always = nearly every product (spec sheet/manufacturer page/canonical render carries it). sometimes = uneven; flagships have it, budget/older/boutique brands often do not. rare = only specialist sources (lab benchmark sites, teardown reports, niche reviews) for a small fraction of the category.',
    studioControlLabel: 'Availability',
    studioFallback: 'sometimes',
    studioLegacyPath: 'availability',
    studioOptions: ['always', 'sometimes', 'rare'],
  },
  {
    path: 'priority.difficulty',
    label: 'Difficulty',
    kind: 'enum',
    options: ['easy', 'medium', 'hard', 'very_hard'],
    doc: 'Routes to a tier bundle (model + reasoning + thinking + web search). Grade for the typical product in the category, not the best-documented flagship.',
    studioTipKey: 'difficulty',
    studioTip: 'How much search effort does the typical product (not the flagship) need? easy = first SERP for the obvious query, OR visible in any product render. medium = page 2, refined query, OR a specific angle/spec section is needed. hard = multiple queries + sites + light cross-analysis; the answer still exists in public text once found. very_hard = same effort PLUS deduction across signals (component lineage, indirect inference) OR lab-only/instrumented measurements OR proprietary internal-component identities behind unmarked silicon.',
    studioControlLabel: 'Difficulty',
    studioFallback: 'easy',
    studioLegacyPath: 'difficulty',
    studioOptions: ['very_hard', 'hard', 'medium', 'easy'],
  },
  {
    path: 'contract.type',
    label: 'Data type',
    kind: 'enum',
    options: ['string', 'number', 'integer', 'boolean', 'date', 'url', 'range', 'mixed_number_range'],
    doc: 'Drives JSON primitive emission AND filter-UI control — numeric types render as range sliders, strings as toggle chips.',
    studioTipKey: 'data_type',
    studioTip: 'Fundamental data type. string: text, number: decimal, integer: whole, boolean: yes/no, date, url, enum: from a fixed set, component_ref: links to component DB.',
    studioControlId: 'contract_type',
    studioControlLabel: 'Data Type',
    studioWidget: 'select',
    studioFallback: 'string',
    consumerGateLegacyPaths: ['data_type', 'type'],
  },
  {
    path: 'contract.shape',
    label: 'Shape',
    kind: 'enum',
    options: ['scalar', 'list'],
    doc: 'Scalar = single value. List = array with dedupe+sort via list_rules; filter UI becomes multi-select.',
    studioTipKey: 'shape',
    studioTip: 'Value cardinality. scalar: single value, list: array, structured: nested object, key_value: dictionary.',
    studioControlId: 'contract_shape',
    studioControlLabel: 'Shape',
    studioWidget: 'select',
    studioFallback: 'scalar',
    consumerGateLegacyPaths: ['output_shape', 'shape'],
  },
  {
    path: 'contract.unit',
    label: 'Unit',
    kind: 'string',
    doc: 'Storage contract — numeric values stored unit-less, unit applied at render (e.g. "g", "mm", "ms", "hz").',
    studioTipKey: 'contract_unit',
    studioTip: 'Measurement unit for numeric fields (g, mm, Hz, dpi, ms). Blank for non-numeric.',
    studioControlId: 'contract_unit',
    studioControlLabel: 'Unit',
    studioWidget: 'unit_select',
    consumerGateLegacyPaths: ['unit'],
  },
  {
    path: 'contract.rounding.decimals',
    label: 'Rounding decimals',
    kind: 'integer',
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'Precision for equality compare in the index. Without it, 128 and 128.0000001 survive as different values.',
    studioTipKey: 'rounding_decimals',
    studioTip: 'Decimal places for rounding numeric values. 0 = integer. Only affects number/integer types.',
    studioControlId: 'contract_rounding_decimals',
    studioControlLabel: 'Rounding Decimals',
    studioWidget: 'number_input',
    studioFallback: 0,
  },
  {
    path: 'contract.rounding.mode',
    label: 'Rounding mode',
    kind: 'enum',
    options: ['nearest', 'floor', 'ceil', 'half_even'],
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'How to round at precision boundaries. Defaults to nearest.',
    studioTipKey: 'rounding_mode',
    studioTip: 'nearest: standard rounding, floor: always down, ceil: always up.',
    studioControlId: 'contract_rounding_mode',
    studioControlLabel: 'Rounding Mode',
    studioWidget: 'select',
    studioFallback: 'nearest',
    studioOptions: ['nearest', 'floor', 'ceil'],
  },
  {
    path: 'contract.list_rules.dedupe',
    label: 'List dedupe',
    kind: 'boolean',
    appliesWhen: { 'contract.shape': 'list' },
    doc: 'Removes duplicate values from the emitted list. Usually on for filter-facet lists.',
    studioTipKey: 'list_rules_dedupe',
    studioTip: 'Remove duplicate list items during runtime normalization. Case-insensitive for strings; exact-match for numbers.',
    studioControlId: 'contract_list_dedupe',
    studioControlLabel: 'Dedupe',
    studioWidget: 'boolean_select',
    studioFallback: true,
    studioOptions: ['yes', 'no'],
    consumerGatePath: 'contract.list_rules',
    consumerGateLegacyPaths: ['list_rules'],
  },
  {
    path: 'contract.list_rules.sort',
    label: 'List sort',
    kind: 'enum',
    options: ['none', 'asc', 'desc', 'insert'],
    appliesWhen: { 'contract.shape': 'list' },
    doc: 'Stable list order. Use desc for numeric lists where highest-first is the consumer convention.',
    studioTipKey: 'list_rules_sort',
    studioTip: 'Sort list items after parsing. none keeps source order; asc/desc apply normalized list ordering.',
    studioControlId: 'contract_list_sort',
    studioControlLabel: 'Sort',
    studioWidget: 'select',
    studioFallback: 'none',
    studioOptions: ['none', 'asc', 'desc'],
  },
  {
    path: 'contract.list_rules.item_union',
    label: 'List item union',
    kind: 'enum',
    options: ['winner_only', 'set_union', 'ordered_union'],
    appliesWhen: { 'contract.shape': 'list' },
    doc: 'Controls how approved list candidates merge across sources. Blank/winner_only keeps the winning list only; set_union and ordered_union merge unique items.',
    studioTipKey: 'list_rules_item_union',
    studioTip: 'How approved list candidates merge across sources. Leave blank to keep the winning list only.',
    studioControlId: 'contract_list_item_union',
    studioControlLabel: 'Item Union',
    studioWidget: 'select',
    studioFallback: '',
    studioOptions: ['', 'set_union', 'ordered_union'],
    studioOptionLabels: ['winner_only', 'set_union', 'ordered_union'],
  },
  {
    path: 'contract.range.min',
    label: 'Range min',
    kind: 'number-nullable',
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'Numeric lower bound. Stops the LLM from guessing out-of-range values.',
    studioTipKey: 'contract_range',
    studioTip: 'Optional min/max bounds for numeric values. IDX uses these limits during extraction guidance and runtime validation.',
    studioControlId: 'contract_range_min',
    studioControlLabel: 'Range Min',
    studioWidget: 'number_input',
    studioPlaceholder: 'Min',
  },
  {
    path: 'contract.range.max',
    label: 'Range max',
    kind: 'number-nullable',
    appliesWhen: { 'contract.type': ['number', 'integer', 'float'] },
    doc: 'Numeric upper bound. Stops the LLM from emitting impossible out-of-range values.',
    studioControlId: 'contract_range_max',
    studioControlLabel: 'Range Max',
    studioWidget: 'number_input',
    studioPlaceholder: 'Max',
  },
  {
    path: 'enum.policy',
    label: 'Enum policy',
    kind: 'enum',
    options: ['closed', 'open_prefer_known', 'open'],
    doc: 'closed = reject non-listed. open_prefer_known = accept new with needs_curation. open = trust evidence and must not carry enum.source. closed/open_prefer_known derive enum.source from the field key. Component-linked keys cannot use open.',
    studioTipKey: 'enum_policy',
    studioTip: 'Enum Policy controls vocabulary matching after parsing. closed and open_prefer_known auto-lock Source to data_lists.{field_key}. open accepts any value and locks Source to none. Component identity keys use component_db.{type} and can only be closed or open_prefer_known. For boolean fields, this is auto-locked to closed/yes_no.',
    studioControlId: 'enum_policy',
    studioControlLabel: 'Policy',
    studioWidget: 'select',
    studioFallback: 'open',
    studioOptions: ['open', 'closed', 'open_prefer_known'],
    consumerGateLegacyPaths: ['enum_policy'],
  },
  {
    path: 'enum.values',
    label: 'Enum values',
    kind: 'string-list',
    authoringDoc: 'Field Studio authors choose enum.policy; enum.source is derived from the field key for known policies. Inline enum values are legacy runtime projection only.',
    doc: 'Vocabulary for this field. Each non-numeric value becomes a filter chip on the consumer site. Value count is a UX metric: ≤10 healthy, 11–15 fine, 16–20 tolerable, 21–30 fatigue, 30+ broken.',
  },
  {
    path: 'enum.source',
    label: 'Enum source',
    kind: 'enum-or-freeform',
    options: ['data_lists.<name>', 'component_db.<type>', 'yes_no'],
    doc: 'Derived reference to a shared known list or component database. open policy locks this to none; closed/open_prefer_known lock this to data_lists.<field_key>; component identity locks to component_db.<field_key>. Inline authored values are legacy-only and not a Field Studio authoring path.',
    studioTipKey: 'enum_source',
    studioTip: 'Enum value list source is derived and read-only: data_lists.{field_key} for known policies, component_db.{field_key} for component identity keys, yes_no for booleans, and none for open.',
    studioControlId: 'enum_source',
    studioControlLabel: 'Source',
    studioWidget: 'enum_source_select',
    consumerGateLegacyPaths: ['enum_source'],
  },
  {
    path: 'enum.match.format_hint',
    label: 'Format pattern',
    kind: 'string',
    doc: 'Regex or template applied as a custom publisher validation format check after extraction. This is not used for parse-time input matching.',
    studioControlId: 'enum_format_hint',
    studioControlLabel: 'Format Pattern',
    studioWidget: 'format_pattern_input',
    consumerGateLegacyPaths: ['enum_match_format_hint'],
  },
  {
    path: 'aliases',
    label: 'Aliases',
    kind: 'string-list',
    doc: 'Source-text synonyms the LLM normalizes to the canonical value before emitting.',
    studioTipKey: 'aliases',
    studioTip: 'Alternative source phrases and field names used for search enrichment and source-text matching. Keep enum values and display tooltip text separate.',
    studioControlLabel: 'Aliases',
    studioWidget: 'tag_picker',
    studioPlaceholder: 'source phrases and alternate field names',
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
    studioTipKey: 'ai_reasoning_note',
    studioTip: 'Extraction guidance injected directly into the LLM prompt for this field. The AI reads this note when deciding how to extract the value.\n\n'
      + 'When empty, guidance is auto-generated from field properties (data type, difficulty, evidence requirements, enum policy, component type).\n\n'
      + 'Examples:\n'
      + '• "Check manufacturer spec sheets first, this value is often in PDF datasheets not web pages"\n'
      + '• "This is a calculated field: polling rate = 1000/response_time_ms"\n'
      + '• "Multiple conflicting values are common — prefer tier 1 manufacturer specs over reviews"\n\n'
      + 'Write a custom note to override the auto-generated guidance.',
  },
  {
    path: 'ai_assist.color_edition_context.enabled',
    label: 'Color & Edition Context',
    kind: 'boolean',
    doc: 'Single on/off Key Finder checkbox. When ON, the prompt receives this product\'s color × edition × SKU × release_date table (from CEF). Enable when the variant table helps decide this field\'s value — either as classification context for a scalar (e.g. a `design` or `edition_type` enum classified by variant names like "Fortnite Edition" → `collaboration`) or as evidence for a `shape=list` field (multiple values coexist across variants, e.g. mouse coating, apparel material, watch case material). Leave OFF for spec invariants where variant data adds nothing — components or measurements that don\'t change with colorway/edition (mouse sensor, phone processor, watch movement, car engine).',
    studioTipKey: 'color_edition_context',
    studioTip: 'Adds the product\'s color × edition × SKU × release_date table to the prompt. Turn ON when the variant table helps decide this field\'s value — as classification context for a scalar (e.g. `design` or `edition_type`) or as evidence for a `shape=list` field (mouse coating, apparel material, watch case material). Turn OFF for spec invariants — components or measurements that don\'t change with colorway (mouse sensor, phone processor, watch movement, car engine).',
    studioTogglePath: 'ai_assist.color_edition_context',
    studioControlLabel: 'Color & Edition',
    studioAriaLabel: 'Use color and edition context',
    aiAssistToggleKey: 'color_edition_context',
    aiAssistAcceptDirectBoolean: true,
    aiAssistDefaultEnabled: true,
    aiAssistLegacyKeys: ['variant_inventory_usage'],
    aiAssistLegacyAcceptDirectBoolean: false,
    aiAssistLegacyEnabledModes: ['default', 'append', 'override'],
    aiAssistLegacyDisabledModes: ['off'],
    consumerBadgeType: 'object',
    consumerBadgeSection: 'Extraction Priority & Guidance',
    consumerBadgeConsumers: {
      'llm.kf': { desc: 'Single on/off checkbox. Enable only when edition/SKU/release/colorway/PIF identity facts add evidence-filter value without ambiguity; field-specific interpretation belongs in ai_assist.reasoning_note.' },
    },
  },
  {
    path: 'ai_assist.pif_priority_images.enabled',
    label: 'PIF Priority Images',
    kind: 'boolean',
    doc: 'Single on/off Key Finder checkbox. When ON, the default/base PIF priority-view images are attached to the prompt as visual context. Enable when inspecting the photo can either (a) provide the answer directly, (b) corroborate text/documentation evidence, or (c) disprove documentation when source claims contradict what the photo shows. Best for externally visible features a buyer could read off the canonical product photo — shapes, layouts, counts, port positions, body styles. Examples: mouse `shape` and `button_layout`; phone `camera_count` and `port_count`; watch `case_shape` and `crown_position`; car `body_style` and `door_count`. Leave OFF for spec/internal values no camera can reveal — measurements, ratings, components, internal identifiers. Examples: mouse `dpi` and `sensor_model`; phone `processor` and `ram_gb`; watch `water_resistance_rating` and `movement_caliber`; car `horsepower` and `fuel_economy_mpg`. "Priority" refers to PIF\'s ranked default-view photo set, not field importance. Only the default/base set is attached — edition-specific imagery is not routed by this toggle; put any edition-specific visual interpretation rules in ai_assist.reasoning_note. Missing or unparseable images are not negative evidence.',
    studioTipKey: 'pif_priority_images',
    studioTip: 'Attach default/base PIF priority-view images to the prompt as visual context. Enable when inspecting the photo can answer, corroborate, or disprove text-source evidence — externally visible features like shape, layout, count, or port positions. Leave OFF for measurements, ratings, components, or internal identifiers a camera cannot reveal. "Priority" refers to PIF\'s ranked default-view set, not field importance. Edition-specific image handling belongs in AI reasoning note. Missing images are not negative evidence.',
    studioTogglePath: 'ai_assist.pif_priority_images',
    studioControlLabel: 'PIF Priority Images',
    studioAriaLabel: 'Use PIF priority images',
    aiAssistToggleKey: 'pif_priority_images',
    aiAssistAcceptDirectBoolean: true,
    aiAssistDefaultEnabled: false,
    aiAssistLegacyKeys: [],
    aiAssistLegacyAcceptDirectBoolean: false,
    aiAssistLegacyEnabledModes: [],
    aiAssistLegacyDisabledModes: [],
    consumerBadgeType: 'object',
    consumerBadgeSection: 'Extraction Priority & Guidance',
    consumerBadgeConsumers: {
      'llm.kf': { desc: 'Single on/off checkbox. Enable only when default/base PIF priority-view images add visual evidence value. Missing images are not negative evidence; edition/list interpretation belongs in ai_assist.reasoning_note.' },
    },
  },
  {
    path: 'search_hints.domain_hints',
    label: 'Preferred source domains',
    kind: 'string-list',
    doc: 'Hint set the LLM web search prioritizes for this field. Typically manufacturer + a handful of review domains.',
    studioTipKey: 'domain_hints',
    studioTip: 'Preferred website domains/types. E.g. \'manufacturer\' for OEM sites, or specific domains like \'rtings.com\'.',
    studioControlLabel: 'Domain Hints',
    studioWidget: 'tag_picker',
    studioPlaceholder: 'manufacturer, rtings.com...',
    studioSuggestionsKey: 'domain_hints',
  },
  {
    path: 'search_hints.content_types',
    label: 'Content types',
    kind: 'string-list',
    doc: 'Content classes the LLM search should favor for this field, such as product pages, spec sheets, manuals, reviews, PDFs, or support pages.',
    studioTipKey: 'content_types',
    studioTip: 'Content types most likely to have this data. E.g. spec_sheet, datasheet, review, manual, pdf.',
    studioControlLabel: 'Content Types',
    studioWidget: 'tag_picker',
    studioPlaceholder: 'spec_sheet, datasheet...',
    studioSuggestionsKey: 'content_types',
  },
  {
    path: 'search_hints.query_terms',
    label: 'Search query terms',
    kind: 'string-list',
    doc: 'Candidate queries for the LLM search. Keep field-specific; generic product queries belong at the product level.',
    studioTipKey: 'query_terms',
    studioTip: 'Extra search terms for this field. E.g. for polling_rate: \'report rate\', \'USB poll rate\'.',
    studioControlLabel: 'Query Terms',
    studioWidget: 'tag_picker',
    studioPlaceholder: 'alternative search terms',
  },
  {
    path: 'constraints',
    label: 'Cross-field constraints',
    kind: 'constraint-list',
    doc: 'DSL: "<field> <op> <target>" where op ∈ {lte, lt, gte, gt, eq}. Rendered into the live Key Finder prompt after normalization alongside structured cross_field_constraints.',
    studioControlLabel: 'Cross-field constraints',
    studioWidget: 'constraint_editor',
  },
  {
    path: 'evidence.min_evidence_refs',
    label: 'Min evidence refs',
    kind: 'integer',
    doc: 'Minimum independent supporting evidence URLs to accept a value. Identity-anchoring fields should usually require at least 2 independent sources.',
    studioTipKey: 'min_evidence_refs',
    studioTip: 'Minimum distinct source references needed to accept a value. Higher = more confident but more unknowns.',
    studioControlLabel: 'Min Evidence Refs',
    studioWidget: 'number_stepper',
    studioLegacyPath: 'min_evidence_refs',
    studioAriaLabel: 'min evidence refs',
  },
  {
    path: 'evidence.tier_preference',
    label: 'Evidence tier preference',
    kind: 'ordered-list',
    options: ['tier1', 'tier2', 'tier3'],
    doc: 'Ordered list from most authoritative to least. Default order is tier1 → tier2 → tier3; override per field when a lower-tier source is more trustworthy for that measurement.',
    studioTipKey: 'tier_preference',
    studioTip: 'Source trust ordering. Tier 1 (Manufacturer): OEM specs. Tier 2 (Lab): independent tests. Tier 3 (Retailer): store listings. Tier 4 (Community): forums/reviews. Tier 5 (Aggregator): comparison sites.',
    studioControlLabel: 'Tier Preference',
    studioWidget: 'tier_picker',
    studioDefault: ['tier1', 'tier2', 'tier3'],
  },
  {
    path: 'group',
    label: 'Group',
    kind: 'group-ref',
    doc: 'Field group (mirrors ui.group). Drives bundling pool eligibility when groupBundlingOnly is on, plus sidebar/section organization in Field Studio and (future) consumer site.',
  },
]);

export const FIELD_RULE_STUDIO_TIPS = Object.freeze(Object.fromEntries(
  FIELD_RULE_SCHEMA
    .filter((entry) => entry.studioTipKey && entry.studioTip)
    .map((entry) => [entry.studioTipKey, entry.studioTip]),
));

export const FIELD_RULE_CONSUMER_GATE_ALIAS_PATHS = Object.freeze(Object.fromEntries(
  FIELD_RULE_SCHEMA
    .map((entry) => {
      const aliases = [
        entry.studioLegacyPath,
        ...(entry.consumerGateLegacyPaths || []),
      ].filter(Boolean);
      if (aliases.length === 0) return null;
      return [
        entry.consumerGatePath || entry.path,
        Object.freeze([...new Set(aliases)]),
      ];
    })
    .filter(Boolean),
));

function deriveStudioControls(predicate) {
  return Object.freeze(
    FIELD_RULE_SCHEMA
      .filter((entry) => entry.studioWidget && predicate(entry))
      .map((entry) => Object.freeze({
        path: entry.path,
        controlId: entry.studioControlId,
        label: entry.studioControlLabel,
        tooltipKey: entry.studioTipKey,
        widget: entry.studioWidget,
        fallback: entry.studioFallback,
        options: entry.studioOptions
          ? Object.freeze([...entry.studioOptions])
          : (entry.options ? Object.freeze([...entry.options]) : undefined),
        optionLabels: entry.studioOptionLabels
          ? Object.freeze([...entry.studioOptionLabels])
          : undefined,
        placeholder: entry.studioPlaceholder,
      })),
  );
}

export const FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS = Object.freeze(
  FIELD_RULE_SCHEMA
    .filter((entry) => entry.studioWidget === 'dependency_toggle')
    .map((entry) => Object.freeze({
      path: entry.path,
      controlId: entry.studioControlId,
      label: entry.studioControlLabel,
      trueDescription: entry.studioTrueDescription,
      falseDescription: entry.studioFalseDescription,
      trueAriaLabel: entry.studioTrueAriaLabel,
      falseAriaLabel: entry.studioFalseAriaLabel,
    })),
);

export const FIELD_RULE_CONTRACT_CONTROLS = deriveStudioControls(
  (entry) => entry.path.startsWith('contract.'),
);

export const FIELD_RULE_ENUM_CONTROLS = deriveStudioControls(
  (entry) => entry.path.startsWith('enum.'),
);

export const FIELD_RULE_AI_ASSIST_TOGGLE_CONTROLS = Object.freeze(
  FIELD_RULE_SCHEMA
    .filter((entry) => entry.path.startsWith('ai_assist.') && entry.path.endsWith('.enabled'))
    .map((entry) => Object.freeze({
      path: entry.studioTogglePath,
      label: entry.studioControlLabel,
      ariaLabel: entry.studioAriaLabel,
      tooltipKey: entry.studioTipKey,
    })),
);

export const FIELD_RULE_AI_ASSIST_TOGGLE_SPECS = Object.freeze(
  FIELD_RULE_SCHEMA
    .filter((entry) => entry.aiAssistToggleKey)
    .map((entry) => Object.freeze({
      key: entry.aiAssistToggleKey,
      path: entry.studioTogglePath,
      enabledPath: entry.path,
      acceptDirectBoolean: entry.aiAssistAcceptDirectBoolean === true,
      defaultEnabled: entry.aiAssistDefaultEnabled === true,
      legacyKeys: Object.freeze([...(entry.aiAssistLegacyKeys || [])]),
      legacyAcceptDirectBoolean: entry.aiAssistLegacyAcceptDirectBoolean === true,
      legacyEnabledModes: Object.freeze([...(entry.aiAssistLegacyEnabledModes || [])]),
      legacyDisabledModes: Object.freeze([...(entry.aiAssistLegacyDisabledModes || [])]),
    })),
);

export const FIELD_RULE_AI_ASSIST_TOGGLE_KEYS = Object.freeze(
  FIELD_RULE_AI_ASSIST_TOGGLE_SPECS.map((entry) => entry.key),
);

export const FIELD_RULE_AI_ASSIST_TOGGLE_BY_KEY = Object.freeze(Object.fromEntries(
  FIELD_RULE_AI_ASSIST_TOGGLE_SPECS.map((entry) => [entry.key, entry]),
));

export const FIELD_RULE_AI_ASSIST_TOGGLE_ALIAS_BY_KEY = Object.freeze(Object.fromEntries(
  FIELD_RULE_AI_ASSIST_TOGGLE_SPECS.flatMap((entry) =>
    entry.legacyKeys.map((legacyKey) => [legacyKey, entry])),
));

function normalizeAiAssistToggleToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function lookupAiAssistToggleSpec(toggleKey) {
  return FIELD_RULE_AI_ASSIST_TOGGLE_BY_KEY[toggleKey]
    || FIELD_RULE_AI_ASSIST_TOGGLE_ALIAS_BY_KEY[toggleKey]
    || null;
}

function normalizeToggleValue(spec, value, { acceptDirectBoolean } = {}) {
  if (typeof value === 'boolean') {
    return acceptDirectBoolean ? { enabled: value } : null;
  }
  if (!isPlainObject(value)) return null;
  if (typeof value.enabled === 'boolean') return { enabled: value.enabled };

  const legacyMode = normalizeAiAssistToggleToken(value.mode);
  if (legacyMode && spec.legacyDisabledModes.includes(legacyMode)) {
    return { enabled: false };
  }
  if (legacyMode && spec.legacyEnabledModes.includes(legacyMode)) {
    return { enabled: true };
  }
  return null;
}

export function normalizeFieldRuleAiAssistToggle(toggleKey, value) {
  const spec = lookupAiAssistToggleSpec(toggleKey);
  if (!spec) return null;
  const isCanonicalKey = spec.key === toggleKey;
  return normalizeToggleValue(spec, value, {
    acceptDirectBoolean: isCanonicalKey
      ? spec.acceptDirectBoolean
      : spec.legacyAcceptDirectBoolean,
  });
}

export function normalizeFieldRuleAiAssistToggleFromConfig(aiAssist, toggleKey) {
  const spec = FIELD_RULE_AI_ASSIST_TOGGLE_BY_KEY[toggleKey] || null;
  if (!spec || !isPlainObject(aiAssist)) return null;

  const canonical = normalizeFieldRuleAiAssistToggle(spec.key, aiAssist[spec.key]);
  if (canonical) return canonical;

  for (const legacyKey of spec.legacyKeys) {
    const legacy = normalizeFieldRuleAiAssistToggle(legacyKey, aiAssist[legacyKey]);
    if (legacy) return legacy;
  }
  return null;
}

export function isFieldRuleAiAssistToggleAuthored(aiAssist, toggleKey) {
  return normalizeFieldRuleAiAssistToggleFromConfig(aiAssist, toggleKey) !== null;
}

export function readFieldRuleAiAssistToggleEnabled(toggleKey, fieldRule = {}, fallback = false) {
  const normalized = normalizeFieldRuleAiAssistToggleFromConfig(fieldRule?.ai_assist, toggleKey);
  return normalized ? normalized.enabled : fallback;
}

export const FIELD_RULE_PRIORITY_CONTROLS = Object.freeze(
  FIELD_RULE_SCHEMA
    .filter((entry) => entry.path.startsWith('priority.') && Array.isArray(entry.studioOptions))
    .map((entry) => Object.freeze({
      path: entry.path,
      label: entry.studioControlLabel,
      legacyPath: entry.studioLegacyPath,
      fallback: entry.studioFallback,
      tooltipKey: entry.studioTipKey,
      options: Object.freeze([...entry.studioOptions]),
    })),
);

export const FIELD_RULE_EVIDENCE_CONTROLS = Object.freeze(
  FIELD_RULE_SCHEMA
    .filter((entry) => entry.path.startsWith('evidence.') && entry.studioWidget)
    .map((entry) => Object.freeze({
      path: entry.path,
      label: entry.studioControlLabel,
      tooltipKey: entry.studioTipKey,
      widget: entry.studioWidget,
      legacyPath: entry.studioLegacyPath,
      ariaLabel: entry.studioAriaLabel,
      defaultValue: entry.studioDefault,
      options: entry.options,
    })),
);

export const FIELD_RULE_SEARCH_HINT_CONTROLS = Object.freeze(
  FIELD_RULE_SCHEMA
    .filter((entry) => entry.studioWidget === 'tag_picker')
    .map((entry) => Object.freeze({
      path: entry.path,
      label: entry.studioControlLabel,
      tooltipKey: entry.studioTipKey,
      placeholder: entry.studioPlaceholder,
      suggestionsKey: entry.studioSuggestionsKey,
    })),
);

export const FIELD_RULE_CONSTRAINT_CONTROL = Object.freeze(
  FIELD_RULE_SCHEMA
    .filter((entry) => entry.studioWidget === 'constraint_editor')
    .map((entry) => Object.freeze({
      path: entry.path,
      label: entry.studioControlLabel,
    }))[0],
);

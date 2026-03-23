import { resolveConsumerGate } from '../../../field-rules/consumerGate.js';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

// WHY: Unified registry — adding a new IDX field path = 1 registry entry, zero switch edits.
// Each entry carries the extractor (how to detect a meaningful value) and docs (tooltip text).

// ---------------------------------------------------------------------------
// Extraction helpers — 5 patterns cover all 28 field paths
// ---------------------------------------------------------------------------

function extractString(rule, ...accessors) {
  for (const accessor of accessors) {
    const value = accessor(rule);
    if (normalizeText(value)) return true;
  }
  return false;
}

function extractNumeric(rule, ...accessors) {
  for (const accessor of accessors) {
    const value = accessor(rule);
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) return true;
  }
  return false;
}

function extractArray(rule, accessor) {
  return toArray(accessor(rule)).length > 0;
}

function extractArrayFiltered(rule, accessor) {
  return toArray(accessor(rule)).map(normalizeText).filter(Boolean).length > 0;
}

function extractPresence(rule, ...accessors) {
  return accessors.some((accessor) => accessor(rule) !== undefined);
}

function extractObjectTruthy(rule, ...accessors) {
  return accessors.some((accessor) => hasTruthyObjectEntries(accessor(rule)));
}

// ---------------------------------------------------------------------------
// IDX_FIELD_PATH_REGISTRY — single source of truth for field paths
// ---------------------------------------------------------------------------

const IDX_FIELD_PATH_REGISTRY = [
  // --- Contract ---
  { path: 'contract.type', extractor: (r) => extractString(r, r => r?.contract?.type, r => r?.data_type, r => r?.type),
    section: 'Contract (Type, Shape, Unit)', key: 'Data Type',
    on: 'This runtime stage uses the declared data type to normalize and validate extracted values.',
    off: 'This runtime stage ignores the field-specific IDX data-type rule and falls back to default handling.' },
  { path: 'contract.shape', extractor: (r) => extractString(r, r => r?.contract?.shape, r => r?.output_shape, r => r?.shape),
    section: 'Contract (Type, Shape, Unit)', key: 'Shape',
    on: 'This runtime stage uses the declared output shape when normalizing extracted values.',
    off: 'This runtime stage ignores the field-specific IDX shape rule and falls back to default handling.' },
  { path: 'contract.unit', extractor: (r) => extractString(r, r => r?.contract?.unit, r => r?.unit),
    section: 'Contract (Type, Shape, Unit)', key: 'Unit',
    on: 'This runtime stage uses the configured unit for numeric normalization and extraction context.',
    off: 'This runtime stage ignores the field-specific IDX unit rule and keeps default unit handling.' },
  { path: 'contract.range', extractor: (r) => extractPresence(r, r => r?.contract?.range?.min, r => r?.contract?.range?.max),
    section: 'Contract (Type, Shape, Unit)', key: 'Range',
    on: 'This runtime stage uses the configured min/max range for numeric validation.',
    off: 'This runtime stage ignores the field-specific IDX range rule and skips that min/max guard.' },
  { path: 'contract.list_rules', extractor: (r) => extractObjectTruthy(r, r => r?.contract?.list_rules, r => r?.list_rules),
    section: 'Contract (Type, Shape, Unit)', key: 'List Rules',
    on: 'This runtime stage uses the configured list rules for dedupe, ordering, and item limits.',
    off: 'This runtime stage ignores the field-specific IDX list-rule settings and falls back to default list handling.' },
  { path: 'contract.unknown_token', extractor: (r) => extractString(r, r => r?.contract?.unknown_token, r => r?.unknown_token),
    section: 'Contract (Type, Shape, Unit)', key: 'Unknown Token',
    on: 'This runtime stage includes the configured unknown token in extraction guidance when the field cannot be resolved.',
    off: 'This runtime stage omits the field-specific unknown token and falls back to default extraction guidance.' },
  // --- Priority ---
  { path: 'priority.required_level', extractor: (r) => extractString(r, r => r?.priority?.required_level, r => r?.required_level),
    section: 'Priority & Effort', key: 'Required Level',
    on: 'This runtime stage uses the configured required level to prioritize missing or weak fields.',
    off: 'This runtime stage ignores the field-specific IDX required-level override and falls back to default priority handling.' },
  { path: 'priority.availability', extractor: (r) => extractString(r, r => r?.priority?.availability, r => r?.availability),
    section: 'Priority & Effort', key: 'Availability',
    on: 'This runtime stage uses the configured availability to tune search and extraction effort.',
    off: 'This runtime stage ignores the field-specific IDX availability override and falls back to default effort handling.' },
  { path: 'priority.difficulty', extractor: (r) => extractString(r, r => r?.priority?.difficulty, r => r?.difficulty),
    section: 'Priority & Effort', key: 'Difficulty',
    on: 'This runtime stage uses the configured difficulty to choose extraction strategy and batching.',
    off: 'This runtime stage ignores the field-specific IDX difficulty override and falls back to default strategy handling.' },
  { path: 'priority.effort', extractor: (r) => extractNumeric(r, r => r?.priority?.effort, r => r?.effort),
    section: 'Priority & Effort', key: 'Effort',
    on: 'This runtime stage uses the configured effort budget to scale search and extraction work.',
    off: 'This runtime stage ignores the field-specific IDX effort override and falls back to default budgeting.' },
  // --- AI Assist ---
  { path: 'ai_assist.mode', extractor: (r) => extractString(r, r => r?.ai_assist?.mode),
    section: 'AI Assist', key: 'Mode',
    on: 'This runtime stage uses the configured AI assist mode when deciding whether and how to invoke LLM extraction.',
    off: 'This runtime stage ignores the field-specific IDX AI mode override and falls back to default AI routing.' },
  { path: 'ai_assist.model_strategy', extractor: (r) => extractString(r, r => r?.ai_assist?.model_strategy),
    section: 'AI Assist', key: 'Model Strategy',
    on: 'This runtime stage uses the configured AI model strategy when selecting fast versus deep reasoning.',
    off: 'This runtime stage ignores the field-specific IDX model-strategy override and falls back to automatic model selection.' },
  { path: 'ai_assist.max_tokens', extractor: (r) => extractNumeric(r, r => r?.ai_assist?.max_tokens),
    section: 'AI Assist', key: 'Max Tokens',
    on: 'This runtime stage uses the configured AI token budget when shaping extraction output limits.',
    off: 'This runtime stage ignores the field-specific IDX max-token override and falls back to automatic token budgeting.' },
  { path: 'ai_assist.reasoning_note', extractor: (r) => extractString(r, r => r?.ai_assist?.reasoning_note),
    section: 'AI Assist', key: 'Reasoning Note',
    on: 'This runtime stage injects the configured reasoning note into extraction guidance for the field.',
    off: 'This runtime stage ignores the field-specific IDX reasoning note and relies on default guidance only.' },
  // --- Parse ---
  { path: 'parse.template', extractor: (r) => extractString(r, r => r?.parse?.template, r => r?.parse_template),
    section: 'Parse Rules', key: 'Parse Template',
    on: 'This runtime stage uses the configured parse template when shaping extraction prompts and normalization.',
    off: 'This runtime stage ignores the field-specific IDX parse template and falls back to default parsing guidance.' },
  // --- Enum ---
  { path: 'enum.policy', extractor: (r) => extractString(r, r => r?.enum?.policy, r => r?.enum_policy),
    section: 'Enum Policy', key: 'Policy',
    on: 'This runtime stage uses the configured enum policy when normalizing and validating enumerated values.',
    off: 'This runtime stage ignores the field-specific IDX enum policy and falls back to default enum handling.' },
  { path: 'enum.source', extractor: (r) => extractString(r, r => r?.enum?.source, r => r?.enum_source),
    section: 'Enum Policy', key: 'Source',
    on: 'This runtime stage uses the configured enum source to bias normalization toward known values.',
    off: 'This runtime stage ignores the field-specific IDX enum source and falls back to default enum sourcing.' },
  // --- Evidence ---
  { path: 'evidence.required', extractor: (r) => extractPresence(r, r => r?.evidence?.required, r => r?.evidence_required),
    section: 'Evidence Requirements', key: 'Evidence Required',
    on: 'This runtime stage uses the configured evidence-required policy when judging extraction quality.',
    off: 'This runtime stage ignores the field-specific IDX evidence-required setting and relaxes that field-specific gate.' },
  { path: 'evidence.min_evidence_refs', extractor: (r) => extractNumeric(r, r => r?.evidence?.min_evidence_refs, r => r?.min_evidence_refs),
    section: 'Evidence Requirements', key: 'Min Evidence Refs',
    on: 'This runtime stage uses the configured minimum evidence reference count when prioritizing and validating the field.',
    off: 'This runtime stage ignores the field-specific IDX minimum-evidence requirement and falls back to default evidence thresholds.' },
  { path: 'evidence.conflict_policy', extractor: (r) => extractString(r, r => r?.evidence?.conflict_policy),
    section: 'Evidence Requirements', key: 'Conflict Policy',
    on: 'This runtime stage includes the configured conflict policy in extraction guidance for conflicting evidence.',
    off: 'This runtime stage ignores the field-specific IDX conflict policy and falls back to default conflict guidance.' },
  { path: 'evidence.tier_preference', extractor: (r) => extractArray(r, r => r?.evidence?.tier_preference),
    section: 'Evidence Requirements', key: 'Tier Preference',
    on: 'This runtime stage includes the configured tier preference when prioritizing supporting evidence.',
    off: 'This runtime stage ignores the field-specific IDX tier preference and falls back to default evidence ordering.' },
  // --- Constraints ---
  { path: 'constraints', extractor: (r) => extractArray(r, r => r?.constraints),
    section: 'Cross-Field Constraints', key: 'Constraints',
    on: 'This runtime stage includes the configured cross-field constraints in extraction and validation context.',
    off: 'This runtime stage ignores the field-specific IDX constraints and falls back to unconstrained field handling.' },
  // --- Components ---
  { path: 'component.type', extractor: (r) => extractString(r, r => r?.component?.type, r => r?.component_db_ref),
    section: 'Components', key: 'Component Type',
    on: 'This runtime stage uses the configured component type when matching and validating component references.',
    off: 'This runtime stage ignores the field-specific IDX component type and falls back to generic value handling.' },
  // --- Aliases & Hints ---
  { path: 'aliases', extractor: (r) => extractArray(r, r => r?.aliases),
    section: 'Extraction Hints & Aliases', key: 'Aliases',
    on: 'This runtime stage uses the configured aliases when building and tracing field-aware search queries.',
    off: 'This runtime stage ignores the field-specific IDX aliases and falls back to canonical field names only.' },
  { path: 'ui.tooltip_md', extractor: (r) => extractString(r, r => r?.ui?.tooltip_md, r => r?.tooltip_md),
    section: 'Extraction Hints & Aliases', key: 'Tooltip Markdown',
    on: 'This runtime stage uses the configured tooltip guidance when expanding field-aware query and extraction context.',
    off: 'This runtime stage ignores the field-specific IDX tooltip guidance and relies on default field naming only.' },
  // --- Search Hints ---
  { path: 'search_hints.query_terms', extractor: (r) => extractArrayFiltered(r, r => r?.search_hints?.query_terms),
    section: 'Search Hints', key: 'Query Terms',
    on: 'This runtime stage uses the configured query-term hints to expand field-aware discovery queries.',
    off: 'This runtime stage ignores the field-specific IDX query terms and falls back to default query generation.' },
  { path: 'search_hints.domain_hints', extractor: (r) => extractArrayFiltered(r, r => r?.search_hints?.domain_hints),
    section: 'Search Hints', key: 'Domain Hints',
    on: 'This runtime stage uses the configured domain hints to bias discovery toward relevant hosts.',
    off: 'This runtime stage ignores the field-specific IDX domain hints and does not apply those host hints.' },
  { path: 'search_hints.preferred_content_types', extractor: (r) => extractArrayFiltered(r, r => r?.search_hints?.preferred_content_types),
    section: 'Search Hints', key: 'Preferred Content Types',
    on: 'This runtime stage uses the configured preferred content types to bias which source formats it pursues.',
    off: 'This runtime stage ignores the field-specific IDX preferred content types and falls back to generic source selection.' },
];

const FIELD_PATH_LOOKUP = new Map(IDX_FIELD_PATH_REGISTRY.map((e) => [e.path, e]));

const SEARCH_RUNTIME_FIELDS = [
  'priority.required_level',
  'aliases',
  'search_hints.query_terms',
  'search_hints.domain_hints',
  'search_hints.preferred_content_types',
  'ui.tooltip_md',
];

const EXTRACTION_RUNTIME_FIELDS = [
  'contract.type',
  'contract.shape',
  'contract.unit',
  'contract.range',
  'contract.list_rules',
  'contract.unknown_token',
  'priority.required_level',
  'priority.availability',
  'priority.difficulty',
  'priority.effort',
  'ai_assist.mode',
  'ai_assist.model_strategy',
  'ai_assist.max_tokens',
  'ai_assist.reasoning_note',
  'parse.template',
  'enum.policy',
  'enum.source',
  'evidence.required',
  'evidence.min_evidence_refs',
  'evidence.conflict_policy',
  'evidence.tier_preference',
  'constraints',
  'component.type',
  'aliases',
  'ui.tooltip_md',
];

const PREFETCH_SURFACE_SPECS = {
  needset: {
    label: 'NeedSet',
    fields: [
      'priority.required_level',
      'evidence.min_evidence_refs',
      'aliases',
      'search_hints.query_terms',
      'search_hints.domain_hints',
      'search_hints.preferred_content_types',
      'ui.tooltip_md',
    ],
  },
  search_profile: {
    label: 'Search Profile',
    fields: ['aliases', 'search_hints.query_terms', 'search_hints.domain_hints', 'search_hints.preferred_content_types', 'ui.tooltip_md'],
  },
  brand_resolver: {
    label: 'Brand Resolver',
    fields: [],
  },
  search_planner: {
    label: 'Search Planner',
    fields: SEARCH_RUNTIME_FIELDS,
  },
  query_journey: {
    label: 'Query Journey',
    fields: SEARCH_RUNTIME_FIELDS,
  },
  search_results: {
    label: 'Search Results',
    fields: SEARCH_RUNTIME_FIELDS,
  },
  serp_selector: {
    label: 'SERP Selector',
    fields: [],
  },
  domain_classifier: {
    label: 'Domain Classifier',
    fields: [],
  },
};

function fieldRulesMap(fieldRulesPayload = {}) {
  if (isObject(fieldRulesPayload?.fields)) {
    return fieldRulesPayload.fields;
  }
  return isObject(fieldRulesPayload) ? fieldRulesPayload : {};
}

function hasTruthyObjectEntries(value) {
  return isObject(value) && Object.values(value).some((entry) => entry !== null && entry !== undefined && normalizeText(entry) !== '');
}

// WHY: Registry-driven — adding a new field path = 1 entry in IDX_FIELD_PATH_REGISTRY above.
export function hasMeaningfulValue(rule = {}, fieldPath = '') {
  const entry = FIELD_PATH_LOOKUP.get(fieldPath);
  return entry ? entry.extractor(rule) : false;
}

function buildBadgesForFields(fieldRulesPayload = {}, fieldPaths = [], surfaceLabel = '') {
  const rules = Object.values(fieldRulesMap(fieldRulesPayload)).filter((rule) => isObject(rule));
  const badges = [];

  for (const fieldPath of fieldPaths) {
    const configuredRules = rules.filter((rule) => hasMeaningfulValue(rule, fieldPath));
    // WHY: always show all surface-specified fields — unconfigured ones render as 'off'
    const hasActiveRule = configuredRules.length > 0
      && configuredRules.some((rule) => resolveConsumerGate(rule, fieldPath, 'indexlab').enabled);
    badges.push({
      field_path: fieldPath,
      label: `idx.${fieldPath}`,
      state: hasActiveRule ? 'active' : 'off',
      tooltip: buildRuntimeIdxTooltip({
        fieldPath,
        surfaceLabel,
        active: hasActiveRule,
      }),
    });
  }

  return badges;
}

export function buildRuntimeIdxTooltip({
  fieldPath = '',
  surfaceLabel = '',
  active = true,
} = {}) {
  const doc = FIELD_PATH_LOOKUP.get(fieldPath) || {
    section: 'Field Studio',
    key: fieldPath,
    on: 'This runtime stage uses the configured IDX rule for this field.',
    off: 'This runtime stage ignores the field-specific IDX rule for this field.',
  };
  const label = `idx.${fieldPath}`;
  const surface = normalizeText(surfaceLabel) || 'this runtime surface';

  return [
    label,
    `This feature is enabled in Key Navigation > ${doc.section} > ${doc.key}.`,
    `Surface: ${surface}`,
    '',
    `Status: ${active ? 'ON' : 'OFF'}`,
    `When ON: ${doc.on}`,
    `When OFF: ${doc.off}`,
  ].join('\n');
}

export function buildRuntimeIdxBadgesBySurface(fieldRulesPayload = {}) {
  return Object.fromEntries(
    Object.entries(PREFETCH_SURFACE_SPECS).map(([surface, spec]) => [
      surface,
      buildBadgesForFields(fieldRulesPayload, spec.fields, spec.label),
    ])
  );
}

// WHY: Derives LLM worker field paths from PREFETCH_SURFACE_SPECS (SSOT).
// Unknown tabs fall back to EXTRACTION_RUNTIME_FIELDS for backward compat.
function llmWorkerFieldPaths(worker = {}) {
  const prefetchTab = normalizeText(worker?.prefetch_tab);
  const spec = PREFETCH_SURFACE_SPECS[prefetchTab];
  return spec ? spec.fields : EXTRACTION_RUNTIME_FIELDS;
}

const WORKER_POOL_FIELD_MAP = {
  search: { fields: SEARCH_RUNTIME_FIELDS, label: 'Search Worker' },
  fetch:  { fields: EXTRACTION_RUNTIME_FIELDS, label: 'Fetch Worker' },
};

export function buildRuntimeIdxBadgesForWorker({ fieldRulesPayload = {}, worker = {} } = {}) {
  const pool = normalizeText(worker?.pool).toLowerCase();
  if (pool === 'llm') {
    return buildBadgesForFields(fieldRulesPayload, llmWorkerFieldPaths(worker), 'LLM');
  }
  const mapping = WORKER_POOL_FIELD_MAP[pool];
  return mapping ? buildBadgesForFields(fieldRulesPayload, mapping.fields, mapping.label) : [];
}

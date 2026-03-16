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

const FIELD_DOCS = {
  'contract.type': {
    section: 'Contract (Type, Shape, Unit)',
    key: 'Data Type',
    on: 'This runtime stage uses the declared data type to normalize and validate extracted values.',
    off: 'This runtime stage ignores the field-specific IDX data-type rule and falls back to default handling.',
  },
  'contract.shape': {
    section: 'Contract (Type, Shape, Unit)',
    key: 'Shape',
    on: 'This runtime stage uses the declared output shape when normalizing extracted values.',
    off: 'This runtime stage ignores the field-specific IDX shape rule and falls back to default handling.',
  },
  'contract.unit': {
    section: 'Contract (Type, Shape, Unit)',
    key: 'Unit',
    on: 'This runtime stage uses the configured unit for numeric normalization and extraction context.',
    off: 'This runtime stage ignores the field-specific IDX unit rule and keeps default unit handling.',
  },
  'contract.range': {
    section: 'Contract (Type, Shape, Unit)',
    key: 'Range',
    on: 'This runtime stage uses the configured min/max range for numeric validation.',
    off: 'This runtime stage ignores the field-specific IDX range rule and skips that min/max guard.',
  },
  'contract.list_rules': {
    section: 'Contract (Type, Shape, Unit)',
    key: 'List Rules',
    on: 'This runtime stage uses the configured list rules for dedupe, ordering, and item limits.',
    off: 'This runtime stage ignores the field-specific IDX list-rule settings and falls back to default list handling.',
  },
  'contract.unknown_token': {
    section: 'Contract (Type, Shape, Unit)',
    key: 'Unknown Token',
    on: 'This runtime stage includes the configured unknown token in extraction guidance when the field cannot be resolved.',
    off: 'This runtime stage omits the field-specific unknown token and falls back to default extraction guidance.',
  },
  'priority.required_level': {
    section: 'Priority & Effort',
    key: 'Required Level',
    on: 'This runtime stage uses the configured required level to prioritize missing or weak fields.',
    off: 'This runtime stage ignores the field-specific IDX required-level override and falls back to default priority handling.',
  },
  'priority.availability': {
    section: 'Priority & Effort',
    key: 'Availability',
    on: 'This runtime stage uses the configured availability to tune search and extraction effort.',
    off: 'This runtime stage ignores the field-specific IDX availability override and falls back to default effort handling.',
  },
  'priority.difficulty': {
    section: 'Priority & Effort',
    key: 'Difficulty',
    on: 'This runtime stage uses the configured difficulty to choose extraction strategy and batching.',
    off: 'This runtime stage ignores the field-specific IDX difficulty override and falls back to default strategy handling.',
  },
  'priority.effort': {
    section: 'Priority & Effort',
    key: 'Effort',
    on: 'This runtime stage uses the configured effort budget to scale search and extraction work.',
    off: 'This runtime stage ignores the field-specific IDX effort override and falls back to default budgeting.',
  },
  'ai_assist.mode': {
    section: 'AI Assist',
    key: 'Mode',
    on: 'This runtime stage uses the configured AI assist mode when deciding whether and how to invoke LLM extraction.',
    off: 'This runtime stage ignores the field-specific IDX AI mode override and falls back to default AI routing.',
  },
  'ai_assist.model_strategy': {
    section: 'AI Assist',
    key: 'Model Strategy',
    on: 'This runtime stage uses the configured AI model strategy when selecting fast versus deep reasoning.',
    off: 'This runtime stage ignores the field-specific IDX model-strategy override and falls back to automatic model selection.',
  },
  'ai_assist.max_tokens': {
    section: 'AI Assist',
    key: 'Max Tokens',
    on: 'This runtime stage uses the configured AI token budget when shaping extraction output limits.',
    off: 'This runtime stage ignores the field-specific IDX max-token override and falls back to automatic token budgeting.',
  },
  'ai_assist.reasoning_note': {
    section: 'AI Assist',
    key: 'Reasoning Note',
    on: 'This runtime stage injects the configured reasoning note into extraction guidance for the field.',
    off: 'This runtime stage ignores the field-specific IDX reasoning note and relies on default guidance only.',
  },
  'parse.template': {
    section: 'Parse Rules',
    key: 'Parse Template',
    on: 'This runtime stage uses the configured parse template when shaping extraction prompts and normalization.',
    off: 'This runtime stage ignores the field-specific IDX parse template and falls back to default parsing guidance.',
  },
  'enum.policy': {
    section: 'Enum Policy',
    key: 'Policy',
    on: 'This runtime stage uses the configured enum policy when normalizing and validating enumerated values.',
    off: 'This runtime stage ignores the field-specific IDX enum policy and falls back to default enum handling.',
  },
  'enum.source': {
    section: 'Enum Policy',
    key: 'Source',
    on: 'This runtime stage uses the configured enum source to bias normalization toward known values.',
    off: 'This runtime stage ignores the field-specific IDX enum source and falls back to default enum sourcing.',
  },
  'evidence.required': {
    section: 'Evidence Requirements',
    key: 'Evidence Required',
    on: 'This runtime stage uses the configured evidence-required policy when judging extraction quality.',
    off: 'This runtime stage ignores the field-specific IDX evidence-required setting and relaxes that field-specific gate.',
  },
  'evidence.min_evidence_refs': {
    section: 'Evidence Requirements',
    key: 'Min Evidence Refs',
    on: 'This runtime stage uses the configured minimum evidence reference count when prioritizing and validating the field.',
    off: 'This runtime stage ignores the field-specific IDX minimum-evidence requirement and falls back to default evidence thresholds.',
  },
  'evidence.conflict_policy': {
    section: 'Evidence Requirements',
    key: 'Conflict Policy',
    on: 'This runtime stage includes the configured conflict policy in extraction guidance for conflicting evidence.',
    off: 'This runtime stage ignores the field-specific IDX conflict policy and falls back to default conflict guidance.',
  },
  'evidence.tier_preference': {
    section: 'Evidence Requirements',
    key: 'Tier Preference',
    on: 'This runtime stage includes the configured tier preference when prioritizing supporting evidence.',
    off: 'This runtime stage ignores the field-specific IDX tier preference and falls back to default evidence ordering.',
  },
  constraints: {
    section: 'Cross-Field Constraints',
    key: 'Constraints',
    on: 'This runtime stage includes the configured cross-field constraints in extraction and validation context.',
    off: 'This runtime stage ignores the field-specific IDX constraints and falls back to unconstrained field handling.',
  },
  'component.type': {
    section: 'Components',
    key: 'Component Type',
    on: 'This runtime stage uses the configured component type when matching and validating component references.',
    off: 'This runtime stage ignores the field-specific IDX component type and falls back to generic value handling.',
  },
  aliases: {
    section: 'Extraction Hints & Aliases',
    key: 'Aliases',
    on: 'This runtime stage uses the configured aliases when building and tracing field-aware search queries.',
    off: 'This runtime stage ignores the field-specific IDX aliases and falls back to canonical field names only.',
  },
  'ui.tooltip_md': {
    section: 'Extraction Hints & Aliases',
    key: 'Tooltip Markdown',
    on: 'This runtime stage uses the configured tooltip guidance when expanding field-aware query and extraction context.',
    off: 'This runtime stage ignores the field-specific IDX tooltip guidance and relies on default field naming only.',
  },
  'search_hints.query_terms': {
    section: 'Search Hints',
    key: 'Query Terms',
    on: 'This runtime stage uses the configured query-term hints to expand field-aware discovery queries.',
    off: 'This runtime stage ignores the field-specific IDX query terms and falls back to default query generation.',
  },
  'search_hints.domain_hints': {
    section: 'Search Hints',
    key: 'Domain Hints',
    on: 'This runtime stage uses the configured domain hints to bias discovery toward relevant hosts.',
    off: 'This runtime stage ignores the field-specific IDX domain hints and does not apply those host hints.',
  },
  'search_hints.preferred_content_types': {
    section: 'Search Hints',
    key: 'Preferred Content Types',
    on: 'This runtime stage uses the configured preferred content types to bias which source formats it pursues.',
    off: 'This runtime stage ignores the field-specific IDX preferred content types and falls back to generic source selection.',
  },
};

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
  serp_triage: {
    label: 'SERP Triage',
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

function hasMeaningfulValue(rule = {}, fieldPath = '') {
  switch (fieldPath) {
    case 'contract.type':
      return Boolean(normalizeText(rule?.contract?.type || rule?.data_type || rule?.type));
    case 'contract.shape':
      return Boolean(normalizeText(rule?.contract?.shape || rule?.output_shape || rule?.shape));
    case 'contract.unit':
      return Boolean(normalizeText(rule?.contract?.unit || rule?.unit));
    case 'contract.range':
      return rule?.contract?.range?.min !== undefined || rule?.contract?.range?.max !== undefined;
    case 'contract.list_rules':
      return hasTruthyObjectEntries(rule?.contract?.list_rules) || hasTruthyObjectEntries(rule?.list_rules);
    case 'contract.unknown_token':
      return Boolean(normalizeText(rule?.contract?.unknown_token || rule?.unknown_token));
    case 'priority.required_level':
      return Boolean(normalizeText(rule?.priority?.required_level || rule?.required_level));
    case 'priority.availability':
      return Boolean(normalizeText(rule?.priority?.availability || rule?.availability));
    case 'priority.difficulty':
      return Boolean(normalizeText(rule?.priority?.difficulty || rule?.difficulty));
    case 'priority.effort':
      return Number.isFinite(Number(rule?.priority?.effort ?? rule?.effort));
    case 'ai_assist.mode':
      return Boolean(normalizeText(rule?.ai_assist?.mode));
    case 'ai_assist.model_strategy':
      return Boolean(normalizeText(rule?.ai_assist?.model_strategy));
    case 'ai_assist.max_tokens':
      return Number.isFinite(Number(rule?.ai_assist?.max_tokens));
    case 'ai_assist.reasoning_note':
      return Boolean(normalizeText(rule?.ai_assist?.reasoning_note));
    case 'parse.template':
      return Boolean(normalizeText(rule?.parse?.template || rule?.parse_template));
    case 'enum.policy':
      return Boolean(normalizeText(rule?.enum?.policy || rule?.enum_policy));
    case 'enum.source':
      return Boolean(normalizeText(rule?.enum?.source || rule?.enum_source));
    case 'evidence.required':
      return rule?.evidence?.required !== undefined || rule?.evidence_required !== undefined;
    case 'evidence.min_evidence_refs':
      return Number.isFinite(Number(rule?.evidence?.min_evidence_refs ?? rule?.min_evidence_refs));
    case 'evidence.conflict_policy':
      return Boolean(normalizeText(rule?.evidence?.conflict_policy));
    case 'evidence.tier_preference':
      return toArray(rule?.evidence?.tier_preference).length > 0;
    case 'constraints':
      return toArray(rule?.constraints).length > 0;
    case 'component.type':
      return Boolean(normalizeText(rule?.component?.type || rule?.component_db_ref));
    case 'aliases':
      return toArray(rule?.aliases).length > 0;
    case 'ui.tooltip_md':
      return Boolean(normalizeText(rule?.ui?.tooltip_md || rule?.tooltip_md));
    case 'search_hints.query_terms':
      return toArray(rule?.search_hints?.query_terms).map(normalizeText).filter(Boolean).length > 0;
    case 'search_hints.domain_hints':
      return toArray(rule?.search_hints?.domain_hints).map(normalizeText).filter(Boolean).length > 0;
    case 'search_hints.preferred_content_types':
      return toArray(rule?.search_hints?.preferred_content_types).map(normalizeText).filter(Boolean).length > 0;
    default:
      return false;
  }
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
  const doc = FIELD_DOCS[fieldPath] || {
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

function llmWorkerFieldPaths(worker = {}) {
  const prefetchTab = normalizeText(worker?.prefetch_tab);
  if (prefetchTab === 'search_planner' || prefetchTab === 'query_journey' || prefetchTab === 'search_results' || prefetchTab === 'search_profile') {
    return SEARCH_RUNTIME_FIELDS;
  }
  if (prefetchTab === 'brand_resolver' || prefetchTab === 'serp_triage' || prefetchTab === 'domain_classifier') {
    return [];
  }
  return EXTRACTION_RUNTIME_FIELDS;
}

export function buildRuntimeIdxBadgesForWorker({ fieldRulesPayload = {}, worker = {} } = {}) {
  const pool = normalizeText(worker?.pool).toLowerCase();
  if (pool === 'search') {
    return buildBadgesForFields(fieldRulesPayload, SEARCH_RUNTIME_FIELDS, 'Search Worker');
  }
  if (pool === 'fetch') {
    return buildBadgesForFields(fieldRulesPayload, EXTRACTION_RUNTIME_FIELDS, 'Fetch Worker');
  }
  if (pool === 'llm') {
    return buildBadgesForFields(fieldRulesPayload, llmWorkerFieldPaths(worker), 'LLM');
  }
  return [];
}

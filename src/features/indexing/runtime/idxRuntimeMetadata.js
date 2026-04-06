import { resolveConsumerGate } from '../../../field-rules/consumerGate.js';
import { isObject, toArray, normalizeText } from '../../../shared/primitives.js';

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

// WHY: Only the field paths the needset engine / search pipeline actually reads
// at runtime. Aspirational entries (contract.type/shape/unit/range/list_rules/
// unknown_token, ai_assist.*, parse.*, enum.*, evidence.conflict_policy,
// evidence.tier_preference, constraints, component.type, priority.effort)
// were removed 2026-04-05 — zero pipeline consumers. Re-add when extraction
// phase is built.
const IDX_FIELD_PATH_REGISTRY = [
  // --- Priority (controls scheduling & budget) ---
  { path: 'priority.required_level', extractor: (r) => extractString(r, r => r?.priority?.required_level, r => r?.required_level),
    section: 'Priority & Effort', key: 'Required Level',
    on: 'Maps to priority bucket (core/secondary/optional). Identity=100pts, critical=80, required=60, expected=30, optional=10 in need_score. Core fields get scheduled first; budget exhaustion means optional fields never search.',
    off: 'Field defaults to optional priority. May never get searched if budget is tight.' },
  { path: 'priority.availability', extractor: (r) => extractString(r, r => r?.priority?.availability, r => r?.availability),
    section: 'Priority & Effort', key: 'Availability',
    on: 'Primary sort key in sorted_unresolved_keys. Common fields searched before rare ones. If budget exhausts on common fields, rare fields never run.',
    off: 'Field uses default availability ranking. May be misordered relative to other fields.' },
  { path: 'priority.difficulty', extractor: (r) => extractString(r, r => r?.priority?.difficulty, r => r?.difficulty),
    section: 'Priority & Effort', key: 'Difficulty',
    on: 'Secondary sort within same bucket. Hard fields sorted after easy. Does not prevent search, just reorders.',
    off: 'Field uses default difficulty ranking.' },
  { path: 'priority.block_publish_when_unk', extractor: (r) => extractPresence(r, r => r?.priority?.block_publish_when_unk, r => r?.block_publish_when_unk),
    section: 'Priority & Effort', key: 'Block Publish When Unknown',
    on: 'NeedSet adds publish_gate_block reason when this field is unresolved. Blocks publishing.',
    off: 'Field does not block publishing when unknown.' },
  // --- Evidence ---
  { path: 'evidence.min_evidence_refs', extractor: (r) => extractNumeric(r, r => r?.evidence?.min_evidence_refs, r => r?.min_evidence_refs),
    section: 'Evidence Requirements', key: 'Min Evidence Refs',
    on: 'NeedSet adds min_refs_fail reason when refs_found < min_evidence_refs. Increases need_score, keeping the field in the search queue longer.',
    off: 'No minimum evidence check. Single-source values accepted without penalty.' },
  // --- Search Hints (controls what queries look like) ---
  { path: 'search_hints.query_terms', extractor: (r) => extractArrayFiltered(r, r => r?.search_hints?.query_terms),
    section: 'Search Hints', key: 'Query Terms',
    on: 'Aggregated per bundle, unioned per focus group, sent to LLM planner, AND used directly in fieldSynonyms() for literal query construction.',
    off: 'Field uses only canonical key name for queries. No synonym expansion.' },
  { path: 'search_hints.domain_hints', extractor: (r) => extractArrayFiltered(r, r => r?.search_hints?.domain_hints),
    section: 'Search Hints', key: 'Domain Hints',
    on: 'Unioned per group, sent to LLM planner. At repeat_count>=2 added as literal terms to Tier 3 queries. Also boosts matching URLs in result scoring (domain_hint_match reason code).',
    off: 'No domain bias applied. Search results scored without host preference.' },
  { path: 'search_hints.preferred_content_types', extractor: (r) => extractArrayFiltered(r, r => r?.search_hints?.preferred_content_types),
    section: 'Search Hints', key: 'Preferred Content Types',
    on: 'Used as the bundle grouping key — fields with different content types get separate bundles. At repeat_count>=3 adds content suffixes to queries ("specification", "datasheet pdf").',
    off: 'Field grouped into default bundle. No content-type query variation on retries.' },
  // --- Grouping ---
  { path: 'group', extractor: (r) => extractString(r, r => r?.group),
    section: 'Field Groups', key: 'Group',
    on: 'Fields with the same group get ONE shared Tier 2 query (e.g. "Razer Viper V3 Pro sensor_performance"). Also drives group productivity scoring and phase scheduling.',
    off: 'Field placed in _ungrouped bucket. No shared Tier 2 query generation.' },
  // --- Aliases & Hints ---
  { path: 'aliases', extractor: (r) => extractArray(r, r => r?.aliases),
    section: 'Extraction Hints & Aliases', key: 'Aliases',
    on: 'Included in buildAllAliases() and shardAliases(). At repeat_count>=1 added to Tier 3 queries via applyAliasEnrichment(). Only fires on retries, not first pass.',
    off: 'Field uses only canonical key name. No alias enrichment on retries.' },
  { path: 'ui.tooltip_md', extractor: (r) => extractString(r, r => r?.ui?.tooltip_md, r => r?.tooltip_md),
    section: 'Extraction Hints & Aliases', key: 'Tooltip Markdown',
    on: 'extractTooltipTerms() parses markdown for 2+ word phrases (max 4), merged into fieldSynonyms() when ui.tooltip_md consumer gate is enabled for indexlab.',
    off: 'No tooltip-derived terms in query expansion.' },
  // --- Contract ---
  { path: 'contract.exact_match', extractor: (r) => extractPresence(r, r => r?.contract?.exact_match),
    section: 'Contract', key: 'Exact Match',
    on: 'Sets search_intent: "exact_match" sent to the LLM planner as a prompt signal. The LLM may generate stricter queries. Indirect effect — pipeline code does not enforce it.',
    off: 'Default broad search intent. LLM generates standard queries.' },
];

const FIELD_PATH_LOOKUP = new Map(IDX_FIELD_PATH_REGISTRY.map((e) => [e.path, e]));

const SEARCH_RUNTIME_FIELDS = [
  'priority.required_level',
  'aliases',
  'search_hints.query_terms',
  'search_hints.domain_hints',
  'search_hints.preferred_content_types',
  'group',
  'ui.tooltip_md',
];

const PREFETCH_SURFACE_SPECS = {
  needset: {
    label: 'NeedSet',
    fields: [
      'priority.required_level',
      'priority.availability',
      'priority.difficulty',
      'priority.block_publish_when_unk',
      'evidence.min_evidence_refs',
      'search_hints.query_terms',
      'search_hints.domain_hints',
      'search_hints.preferred_content_types',
      'group',
      'contract.exact_match',
      'aliases',
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
// Unknown tabs fall back to SEARCH_RUNTIME_FIELDS (the real pipeline fields).
function llmWorkerFieldPaths(worker = {}) {
  const prefetchTab = normalizeText(worker?.prefetch_tab);
  const spec = PREFETCH_SURFACE_SPECS[prefetchTab];
  return spec ? spec.fields : SEARCH_RUNTIME_FIELDS;
}

const WORKER_POOL_FIELD_MAP = {
  search: { fields: SEARCH_RUNTIME_FIELDS, label: 'Search Worker' },
  fetch:  { fields: SEARCH_RUNTIME_FIELDS, label: 'Fetch Worker' },
};

export function buildRuntimeIdxBadgesForWorker({ fieldRulesPayload = {}, worker = {} } = {}) {
  const pool = normalizeText(worker?.pool).toLowerCase();
  if (pool === 'llm') {
    return buildBadgesForFields(fieldRulesPayload, llmWorkerFieldPaths(worker), 'LLM');
  }
  const mapping = WORKER_POOL_FIELD_MAP[pool];
  return mapping ? buildBadgesForFields(fieldRulesPayload, mapping.fields, mapping.label) : [];
}

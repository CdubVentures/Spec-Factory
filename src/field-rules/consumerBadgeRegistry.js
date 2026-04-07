// WHY: Unified SSOT for all consumer badge definitions.
// One entry per field rule path. Each entry declares which runtime sub-consumers
// read that path and what they do with it. GUI badges, tooltips, and system maps
// are all derived from this single registry.
//
// O(1): one entry here → badge appears in Field Studio, tooltip works,
// FIELD_SYSTEM_MAP auto-updates, idxRuntimeMetadata auto-adapts.

import { isObject, toArray, normalizeText } from '../shared/primitives.js';

// ── Extractor helpers ────────────────────────────────────────────────
// 4 patterns cover all field paths. Each returns true if the rule has a
// meaningful (non-empty, non-null) value at the given path.

function extractString(rule, ...accessors) {
  for (const accessor of accessors) {
    const value = accessor(rule);
    if (normalizeText(value)) return true;
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

// ── Extractor factory ────────────────────────────────────────────────

function buildAccessorsForPath(path) {
  const segments = path.split('.');
  return (rule) => segments.reduce((obj, seg) => obj?.[seg], rule);
}

export function buildExtractor(entry) {
  const primary = buildAccessorsForPath(entry.path);
  const aliases = (entry.flatAliases || []).map((alias) => (rule) => rule?.[alias]);
  const all = [primary, ...aliases];

  if (entry.type === 'string') return (r) => extractString(r, ...all);
  if (entry.type === 'array') return (r) => extractArray(r, primary);
  if (entry.type === 'filteredArray') return (r) => extractArrayFiltered(r, primary);
  if (entry.type === 'presence') return (r) => extractPresence(r, ...all);
  return () => false;
}

// ── Parent groups (badge chip rendering) ─────────────────────────────

export const PARENT_GROUPS = Object.freeze({
  idx:  { label: 'IDX',  title: 'Indexing Lab' },
  eng:  { label: 'ENG',  title: 'Field Rules Engine' },
  rev:  { label: 'REV',  title: 'LLM Review' },
  seed: { label: 'SEED', title: 'Seed Pipeline' },
  comp: { label: 'COMP', title: 'Component System' },
});

// ── Registry (SSOT) ──────────────────────────────────────────────────

export const CONSUMER_BADGE_REGISTRY = Object.freeze([

  // ═══ Priority & Effort ═══════════════════════════════════════════════

  { path: 'priority.required_level', type: 'string', flatAliases: ['required_level'],
    section: 'Priority & Effort', key: 'Required Level',
    consumers: {
      'idx.needset': { desc: 'Maps to priority bucket (core/secondary/optional). Identity=100pts, critical=80, required=60, expected=30, optional=10 in need_score. Core fields scheduled first.' },
      'eng.gate': { desc: 'Weights field in runtime evidence enforcement. Identity/required fields get stricter validation.' },
      'rev.grid': { desc: 'Weights field by importance during consensus scoring. Identity/required fields get stricter validation.' },
    } },

  { path: 'priority.availability', type: 'string', flatAliases: ['availability'],
    section: 'Priority & Effort', key: 'Availability',
    consumers: {
      'idx.needset': { desc: 'Primary sort key in sorted_unresolved_keys. Common fields searched before rare ones. Budget exhaustion means rare fields never run.' },
    } },

  { path: 'priority.difficulty', type: 'string', flatAliases: ['difficulty'],
    section: 'Priority & Effort', key: 'Difficulty',
    consumers: {
      'idx.needset': { desc: 'Secondary sort within same bucket. Hard fields sorted after easy. Does not prevent search, just reorders.' },
    } },

  { path: 'priority.effort', type: 'string', flatAliases: ['effort'],
    section: 'Priority & Effort', key: 'Effort',
    consumers: {
      'eng.gate': { desc: 'Derives AI call budget and model tier from effort score.' },
    } },

  // ═══ Contract ════════════════════════════════════════════════════════

  { path: 'contract.type', type: 'string', flatAliases: ['data_type', 'type'],
    section: 'Contract (Type, Shape, Unit)', key: 'Data Type',
    consumers: {
      'eng.validate': { desc: 'Validates candidate values match the expected data type (string, number, integer, boolean).' },
      'rev.grid': { desc: 'Flags candidates with type mismatches for correction.' },
    } },

  { path: 'contract.shape', type: 'string', flatAliases: ['output_shape', 'shape'],
    section: 'Contract (Type, Shape, Unit)', key: 'Shape',
    consumers: {
      'eng.validate': { desc: 'Validates output shape (scalar, list, object) matches declaration.' },
      'rev.grid': { desc: 'Flags list values in scalar fields and vice versa.' },
      'seed.schema': { desc: 'Sets up correct storage structure in SpecDb: single value column vs array vs structured object.' },
    } },

  { path: 'contract.unit', type: 'string', flatAliases: ['unit'],
    section: 'Contract (Type, Shape, Unit)', key: 'Unit',
    consumers: {
      'eng.normalize': { desc: 'Normalizes extracted values to the declared unit (e.g. "58 grams" to "58g").' },
      'rev.grid': { desc: 'Flags candidates with unexpected or missing units.' },
    } },

  { path: 'contract.range.min', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'Range Min',
    consumers: {
      'eng.validate': { desc: 'Rejects values below the declared minimum.' },
    } },

  { path: 'contract.range.max', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'Range Max',
    consumers: {
      'eng.validate': { desc: 'Rejects values above the declared maximum.' },
    } },

  { path: 'contract.list_rules', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'List Rules',
    consumers: {
      'eng.list': { desc: 'Applies deduplication, sorting, and item count limits to list-shaped field values.' },
    } },

  { path: 'contract.list_rules.dedupe', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'List Dedupe',
    consumers: {
      'eng.list': { desc: 'Removes duplicate entries from list values.' },
    } },

  { path: 'contract.list_rules.sort', type: 'string', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'List Sort',
    consumers: {
      'eng.list': { desc: 'Sorts list values using the declared sort order (asc, desc, none).' },
    } },

  { path: 'contract.list_rules.max_items', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'List Max Items',
    consumers: {
      'eng.list': { desc: 'Truncates list values exceeding the declared maximum item count.' },
    } },

  { path: 'contract.list_rules.min_items', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'List Min Items',
    consumers: {
      'eng.list': { desc: 'Flags list values with fewer items than the declared minimum.' },
    } },

  { path: 'contract.normalization_fn', type: 'string', flatAliases: ['normalization_fn'],
    section: 'Contract (Type, Shape, Unit)', key: 'Normalization Function',
    consumers: {
      'eng.normalize': { desc: 'Applies a named normalization function to extracted values before storage.' },
    } },

  { path: 'contract.enum', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'Contract Enum',
    consumers: {
      'eng.enum': { desc: 'Provides inline enum values for matching when no external enum source is configured.' },
    } },

  { path: 'contract.aliases', type: 'array', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'Contract Aliases',
    consumers: {
      'eng.enum': { desc: 'Provides alternate value names for enum alias resolution during matching.' },
    } },

  // ═══ Enum ════════════════════════════════════════════════════════════

  { path: 'enum.policy', type: 'string', flatAliases: ['enum_policy'],
    section: 'Enum Policy', key: 'Policy',
    consumers: {
      'eng.enum': { desc: 'Enforces enum policy (open, closed, open_prefer_known) during value extraction and matching.' },
      'rev.enum': { desc: 'Enforces enum constraints during candidate scoring. Unknown values in closed enums are flagged.' },
      'seed.schema': { desc: 'Seeds enum policy into SpecDb field meta for downstream query use.' },
    } },

  { path: 'enum.source', type: 'string', flatAliases: ['enum_source'],
    section: 'Enum Policy', key: 'Source',
    consumers: {
      'rev.grid': { desc: 'Matches candidates against the declared enum value list during scoring.' },
      'rev.component': { desc: 'Resolves component property enum values from declared source.' },
      'seed.schema': { desc: 'Loads the enum value list (data_lists, component_db, yes_no) into SpecDb as allowed values.' },
    } },

  { path: 'enum.match.fuzzy_threshold', type: 'presence', flatAliases: [],
    section: 'Enum Policy', key: 'Fuzzy Threshold',
    consumers: {
      'eng.enum': { desc: 'Sets the similarity threshold for fuzzy enum matching during extraction.' },
    } },

  { path: 'enum.match.strategy', type: 'string', flatAliases: [],
    section: 'Enum Policy', key: 'Match Strategy',
    consumers: {
      'rev.enum': { desc: 'Uses this matching strategy (alias, exact, fuzzy) when comparing candidates to enum values.' },
    } },

  { path: 'enum.match.format_hint', type: 'string', flatAliases: ['enum_match_format_hint'],
    section: 'Enum Policy', key: 'Format Pattern',
    consumers: {
      'rev.enum': { desc: 'Uses this format template as output guidance during enum consistency runs.' },
    } },

  { path: 'enum.additional_values', type: 'array', flatAliases: [],
    section: 'Enum Policy', key: 'Additional Values',
    consumers: {
      'rev.enum': { desc: 'Includes custom strings in review-time enum matching and consistency decisions.' },
    } },

  { path: 'enum.aliases', type: 'array', flatAliases: [],
    section: 'Enum Policy', key: 'Enum Aliases',
    consumers: {
      'eng.enum': { desc: 'Provides alternate value names for alias-based enum matching.' },
    } },

  // ═══ Evidence ════════════════════════════════════════════════════════

  { path: 'evidence.min_evidence_refs', type: 'presence', flatAliases: [],
    section: 'Evidence Requirements', key: 'Min Evidence Refs',
    consumers: {
      'eng.gate': { desc: 'Rejects field value if distinct evidence refs fall below this threshold.' },
      'rev.flag': { desc: 'Flags field for manual review when evidence ref count is insufficient.' },
    } },

  { path: 'evidence.conflict_policy', type: 'string', flatAliases: [],
    section: 'Evidence Requirements', key: 'Conflict Policy',
    consumers: {
      'rev.flag': { desc: 'Applies the configured conflict resolution policy when multiple candidates disagree.' },
    } },

  { path: 'evidence.required', type: 'presence', flatAliases: ['evidence_required'],
    section: 'Evidence Requirements', key: 'Evidence Required',
    consumers: {
      'eng.gate': { desc: 'Enforces that the field must have evidence backing before acceptance.' },
    } },

  { path: 'evidence.tier_preference', type: 'array', flatAliases: [],
    section: 'Evidence Requirements', key: 'Tier Preference',
    consumers: {
      'eng.gate': { desc: 'Prioritizes evidence from preferred tiers during conflict resolution. Higher-preferred tiers win ties.' },
    } },

  { path: 'evidence.evidence_tier_minimum', type: 'presence', flatAliases: [],
    section: 'Evidence Requirements', key: 'Tier Minimum',
    consumers: {
      'eng.gate': { desc: 'Rejects evidence from tiers below the minimum. Derived from tier_preference at compile time.' },
    } },

  // ═══ Parse Rules ═════════════════════════════════════════════════════

  { path: 'parse.template', type: 'string', flatAliases: ['parse_template'],
    section: 'Parse Rules', key: 'Parse Template',
    consumers: {
      'eng.parse': { desc: 'Applies the named parse template (text_field, numeric_field, boolean_yes_no_unk, etc.) to extract values from raw text.' },
    } },

  // ═══ AI Assist ═══════════════════════════════════════════════════════

  { path: 'ai_assist.mode', type: 'string', flatAliases: [],
    section: 'AI Assist', key: 'Mode',
    consumers: {
      'eng.component': { desc: 'Sets the AI assist mode (off, advisory, planner, judge) for LLM-assisted extraction.' },
    } },

  { path: 'ai_assist.model_strategy', type: 'string', flatAliases: [],
    section: 'AI Assist', key: 'Model Strategy',
    consumers: {
      'eng.component': { desc: 'Controls which model tier is selected for AI-assisted extraction calls.' },
    } },

  { path: 'ai_assist.max_calls', type: 'presence', flatAliases: [],
    section: 'AI Assist', key: 'Max Calls',
    consumers: {
      'eng.component': { desc: 'Caps the number of LLM calls per field per extraction cycle.' },
    } },

  { path: 'ai_assist.max_tokens', type: 'presence', flatAliases: [],
    section: 'AI Assist', key: 'Max Tokens',
    consumers: {
      'eng.component': { desc: 'Sets the max output token budget per LLM extraction call.' },
    } },

  { path: 'ai_assist.reasoning_note', type: 'string', flatAliases: [],
    section: 'AI Assist', key: 'Extraction Guidance',
    consumers: {
      'eng.component': { desc: 'Sent to the LLM as extraction guidance. Describes expected format, units, and edge cases.' },
    } },

  // ═══ Search Hints ════════════════════════════════════════════════════

  { path: 'search_hints.query_terms', type: 'filteredArray', flatAliases: [],
    section: 'Search Hints', key: 'Query Terms',
    consumers: {
      'idx.needset': { desc: 'Aggregated per bundle, unioned per focus group, sent to LLM planner for search plan generation.' },
      'idx.search': { desc: 'Used directly in fieldSynonyms() for literal query construction and synonym expansion.' },
    } },

  { path: 'search_hints.domain_hints', type: 'filteredArray', flatAliases: [],
    section: 'Search Hints', key: 'Domain Hints',
    consumers: {
      'idx.needset': { desc: 'Unioned per group, sent to LLM planner. Boosts matching URLs in result scoring.' },
      'idx.search': { desc: 'At repeat_count>=2 added as literal terms to Tier 3 queries. domain_hint_match reason code.' },
    } },

  { path: 'search_hints.content_types', type: 'filteredArray', flatAliases: [],
    section: 'Search Hints', key: 'Content Types',
    consumers: {
      'idx.needset': { desc: 'Bundle grouping key. Fields with different content types get separate bundles.' },
      'idx.search': { desc: 'At repeat_count>=3 adds content suffixes to queries ("specification", "datasheet pdf").' },
    } },

  // ═══ Extraction Hints & Aliases ══════════════════════════════════════

  { path: 'aliases', type: 'array', flatAliases: [],
    section: 'Extraction Hints & Aliases', key: 'Aliases',
    consumers: {
      'idx.needset': { desc: 'Included in buildAllAliases() and shardAliases(). At repeat_count>=1 added to Tier 3 queries via applyAliasEnrichment().' },
      'eng.enum': { desc: 'Used for alias-based enum matching resolution.' },
    } },

  { path: 'ui.tooltip_md', type: 'string', flatAliases: ['tooltip_md'],
    section: 'Extraction Hints & Aliases', key: 'Tooltip Markdown',
    consumers: {
      'idx.needset': { desc: 'Tooltip metadata included in field assessment output.' },
      'idx.search': { desc: 'extractTooltipTerms() parses markdown for 2+ word phrases (max 4), merged into fieldSynonyms().' },
    } },

  // ═══ UI & Display ════════════════════════════════════════════════════

  { path: 'ui.label', type: 'string', flatAliases: ['label', 'display_name'],
    section: 'UI Display', key: 'Label',
    consumers: {
      'idx.needset': { desc: 'Used as display_name in field assessments. Fallback for group description and field identification.' },
      'rev.grid': { desc: 'Displayed as field label in review grid column headers.' },
    } },

  { path: 'group', type: 'string', flatAliases: [],
    section: 'Field Groups', key: 'Group',
    consumers: {
      'idx.needset': { desc: 'Fields with the same group get one shared Tier 2 query. Drives group productivity scoring and phase scheduling.' },
    } },

  { path: 'ui.group', type: 'string', flatAliases: [],
    section: 'Field Groups', key: 'UI Group',
    consumers: {
      'eng.enum': { desc: 'Groups enum fields for shared alias resolution context.' },
    } },

  // ═══ Components ══════════════════════════════════════════════════════

  { path: 'component.type', type: 'string', flatAliases: ['component_type'],
    section: 'Components', key: 'Component Type',
    consumers: {
      'eng.component': { desc: 'Identifies the component type for component DB matching and identity resolution.' },
      'rev.component': { desc: 'Validates component identity candidates against the known component database.' },
      'seed.schema': { desc: 'Creates component identity records and links in SpecDb.' },
    } },

  { path: 'component.match.name_weight', type: 'presence', flatAliases: [],
    section: 'Components', key: 'Name Weight',
    consumers: {
      'eng.component': { desc: 'Weight for component name similarity in match scoring.' },
    } },

  { path: 'component.match.property_weight', type: 'presence', flatAliases: [],
    section: 'Components', key: 'Property Weight',
    consumers: {
      'eng.component': { desc: 'Weight for component property alignment in match scoring.' },
    } },

  { path: 'component.match.property_keys', type: 'array', flatAliases: [],
    section: 'Components', key: 'Property Keys',
    consumers: {
      'eng.component': { desc: 'Declares which property fields are compared during component matching.' },
      'comp.review': { desc: 'Maps property columns in component review panel.' },
    } },

  { path: 'component.match.auto_accept_score', type: 'presence', flatAliases: [],
    section: 'Components', key: 'Auto Accept Score',
    consumers: {
      'eng.component': { desc: 'Threshold above which component matches are automatically accepted.' },
    } },

  { path: 'component.match.flag_review_score', type: 'presence', flatAliases: [],
    section: 'Components', key: 'Flag Review Score',
    consumers: {
      'eng.component': { desc: 'Threshold below which component matches are flagged for manual review.' },
    } },

  { path: 'component.match.fuzzy_threshold', type: 'presence', flatAliases: [],
    section: 'Components', key: 'Match Fuzzy Threshold',
    consumers: {
      'eng.component': { desc: 'Fuzzy similarity threshold for component name matching.' },
    } },

  { path: 'component.ai.reasoning_note', type: 'string', flatAliases: [],
    section: 'Components', key: 'Component AI Guidance',
    consumers: {
      'eng.component': { desc: 'Sent to the LLM as component-specific extraction guidance.' },
    } },

  { path: 'component.allow_new_components', type: 'presence', flatAliases: [],
    section: 'Components', key: 'Allow New Components',
    consumers: {
      'eng.component': { desc: 'When true, extraction can create new component identities not in the existing DB.' },
    } },

  { path: 'component_db_ref', type: 'string', flatAliases: [],
    section: 'Components', key: 'Component DB Reference',
    consumers: {
      'eng.component': { desc: 'Links to the component database for identity resolution and property lookup.' },
    } },

  // ═══ Cross-Field Constraints ═════════════════════════════════════════

  { path: 'constraints', type: 'presence', flatAliases: [],
    section: 'Cross-Field Constraints', key: 'Constraints',
    consumers: {
      'rev.component': { desc: 'Enforces constraint rules during component review property validation.' },
      'seed.component': { desc: 'Seeds constraint definitions into component property meta for review-time enforcement.' },
    } },

  { path: 'variance_policy', type: 'string', flatAliases: [],
    section: 'Cross-Field Constraints', key: 'Variance Policy',
    consumers: {
      'rev.component': { desc: 'Controls how component property variance is handled during review.' },
      'seed.component': { desc: 'Seeds variance policy into component property meta.' },
    } },

]);

// ── Derived constants ────────────────────────────────────────────────

// WHY: parent group keys per path — drives badge chip rendering in GUI.
export const FIELD_PARENT_MAP = Object.freeze(
  Object.fromEntries(
    CONSUMER_BADGE_REGISTRY.map((entry) => {
      const parents = [...new Set(
        Object.keys(entry.consumers).map((k) => k.split('.')[0])
      )].sort();
      return [entry.path, parents];
    })
  )
);

// WHY: full consumer detail per path — drives tooltip content in GUI.
export const FIELD_CONSUMER_MAP = Object.freeze(
  Object.fromEntries(
    CONSUMER_BADGE_REGISTRY.map((entry) => [entry.path, entry.consumers])
  )
);

// WHY: IDX-specific paths — used by idxRuntimeMetadata.js.
export const IDX_FIELD_PATHS = Object.freeze(
  CONSUMER_BADGE_REGISTRY
    .filter((entry) => Object.keys(entry.consumers).some((k) => k.startsWith('idx.')))
    .map((entry) => entry.path)
);

// WHY: all registered paths.
export const BADGE_FIELD_PATHS = Object.freeze(
  CONSUMER_BADGE_REGISTRY.map((entry) => entry.path)
);

// WHY: navigation metadata per path — used by GUI for "Key Navigation > Section > Key" breadcrumbs.
export const NAVIGATION_MAP = Object.freeze(
  Object.fromEntries(
    CONSUMER_BADGE_REGISTRY
      .filter((entry) => entry.section && entry.key)
      .map((entry) => [entry.path, { section: entry.section, key: entry.key }])
  )
);

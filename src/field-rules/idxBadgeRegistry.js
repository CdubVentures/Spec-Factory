// WHY: Single source of truth for IDX (indexlab) badge definitions.
// Adding a new IDX badge = one entry here. consumerGate.js, systemMapping.ts,
// and idxRuntimeMetadata.js all derive from this registry.
//
// O(1): one entry → badge appears in studio + runtime ops + FIELD_SYSTEM_MAP.
// Zero deps on consumerGate.js (avoids circular import).

import { isObject, toArray, normalizeText } from '../shared/primitives.js';

// ── Extractor helpers (moved from idxRuntimeMetadata.js) ─────────────
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
// Builds the extractor function from entry metadata so each registry
// entry only needs { path, type, flatAliases } — no manual lambda.

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

// ── Registry (SSOT) ──────────────────────────────────────────────────
// Each entry = one IDX badge. Tooltip text describes actual pipeline behavior.

export const IDX_BADGE_REGISTRY = Object.freeze([
  // --- Priority (controls scheduling & budget) ---
  { path: 'priority.required_level', type: 'string', flatAliases: ['required_level'],
    section: 'Priority & Effort', key: 'Required Level',
    on: 'Maps to priority bucket (core/secondary/optional). Identity=100pts, critical=80, required=60, expected=30, optional=10 in need_score. Core fields get scheduled first; budget exhaustion means optional fields never search.',
    off: 'Field defaults to optional priority. May never get searched if budget is tight.' },
  { path: 'priority.availability', type: 'string', flatAliases: ['availability'],
    section: 'Priority & Effort', key: 'Availability',
    on: 'Primary sort key in sorted_unresolved_keys. Common fields searched before rare ones. If budget exhausts on common fields, rare fields never run.',
    off: 'Field uses default availability ranking. May be misordered relative to other fields.' },
  { path: 'priority.difficulty', type: 'string', flatAliases: ['difficulty'],
    section: 'Priority & Effort', key: 'Difficulty',
    on: 'Secondary sort within same bucket. Hard fields sorted after easy. Does not prevent search, just reorders.',
    off: 'Field uses default difficulty ranking.' },

  // --- Grouping ---
  { path: 'group', type: 'string', flatAliases: [],
    section: 'Field Groups', key: 'Group',
    on: 'Fields with the same group get ONE shared Tier 2 query (e.g. "Razer Viper V3 Pro sensor_performance"). Also drives group productivity scoring and phase scheduling.',
    off: 'Field placed in _ungrouped bucket. No shared Tier 2 query generation.' },

  // --- Aliases & Hints ---
  { path: 'aliases', type: 'array', flatAliases: [],
    section: 'Extraction Hints & Aliases', key: 'Aliases',
    on: 'Included in buildAllAliases() and shardAliases(). At repeat_count>=1 added to Tier 3 queries via applyAliasEnrichment(). Only fires on retries, not first pass.',
    off: 'Field uses only canonical key name. No alias enrichment on retries.' },

  // --- Search Hints ---
  { path: 'search_hints.query_terms', type: 'filteredArray', flatAliases: [],
    section: 'Search Hints', key: 'Query Terms',
    on: 'Aggregated per bundle, unioned per focus group, sent to LLM planner, AND used directly in fieldSynonyms() for literal query construction.',
    off: 'Field uses only canonical key name for queries. No synonym expansion.' },
  { path: 'search_hints.domain_hints', type: 'filteredArray', flatAliases: [],
    section: 'Search Hints', key: 'Domain Hints',
    on: 'Unioned per group, sent to LLM planner. At repeat_count>=2 added as literal terms to Tier 3 queries. Also boosts matching URLs in result scoring (domain_hint_match reason code).',
    off: 'No domain bias applied. Search results scored without host preference.' },
  { path: 'search_hints.content_types', type: 'filteredArray', flatAliases: [],
    section: 'Search Hints', key: 'Content Types',
    on: 'Used as the bundle grouping key — fields with different content types get separate bundles. At repeat_count>=3 adds content suffixes to queries ("specification", "datasheet pdf").',
    off: 'Field grouped into default bundle. No content-type query variation on retries.' },
  // --- UI ---
  { path: 'ui.tooltip_md', type: 'string', flatAliases: ['tooltip_md'],
    section: 'Extraction Hints & Aliases', key: 'Tooltip Markdown',
    on: 'extractTooltipTerms() parses markdown for 2+ word phrases (max 4), merged into fieldSynonyms() when ui.tooltip_md consumer gate is enabled for indexlab.',
    off: 'No tooltip-derived terms in query expansion.' },
  { path: 'ui.label', type: 'string', flatAliases: ['label', 'display_name'],
    section: 'UI Display', key: 'Label',
    on: 'Used as display_name in field assessments. Also read as fallback for group description and field identification in NeedSet output.',
    off: 'Field uses canonical key as its display name.' },
]);

// ── Derived constants ────────────────────────────────────────────────

export const IDX_FIELD_PATHS = Object.freeze(IDX_BADGE_REGISTRY.map((e) => e.path));

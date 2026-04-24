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

function extractObject(rule, ...accessors) {
  return accessors.some((accessor) => {
    const value = accessor(rule);
    return isObject(value) && Object.keys(value).length > 0;
  });
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
  if (entry.type === 'object') return (r) => extractObject(r, ...all);
  return () => false;
}

// ── Parent groups (badge chip rendering) ─────────────────────────────

export const PARENT_GROUPS = Object.freeze({
  idx:  { label: 'IDX',  title: 'Indexing Lab' },
  eng:  { label: 'ENG',  title: 'Field Rules Engine' },
  rev:  { label: 'REV',  title: 'Component Review' },
  flag: { label: 'FLAG', title: 'Review Flags' },
  seed: { label: 'SEED', title: 'Seed Pipeline' },
  comp: { label: 'COMP', title: 'Component System' },
  val:  { label: 'VAL',  title: 'Publish Pipeline Validation' },
  pub:  { label: 'PUB',  title: 'Publisher Pipeline' },
  llm:  { label: 'LLM',  title: 'LLM Finder' },
});

// ── Registry (SSOT) ──────────────────────────────────────────────────

export const CONSUMER_BADGE_REGISTRY = Object.freeze([

  // Extraction Priority & Guidance

  { path: 'priority.required_level', type: 'string', flatAliases: ['required_level'],
    section: 'Extraction Priority & Guidance', key: 'Required Level',
    consumers: {
      'idx.needset': { desc: 'Maps to priority bucket (core/secondary/optional). Identity=100pts, critical=80, required=60, expected=30, optional=10 in need_score. Core fields scheduled first.' },
      'llm.budget': { desc: 'Adds mandatory/non_mandatory points to per-key attempt budget. keyBudgetCalc.js:14.' },
      'llm.bundle': { desc: 'Passenger eligibility filter — bundler requires a valid required_level (mandatory|non_mandatory) or the peer is dropped. keyBundler.js:86-87.' },
      'val.publish_gate': { desc: 'At publish time, the unk-block gate rejects "unk" values for mandatory/identity fields so missing critical data never reaches published state. shouldBlockUnkPublish.js:10, phaseRegistry.js:174-181.' },
    } },

  { path: 'priority.availability', type: 'string', flatAliases: ['availability'],
    section: 'Extraction Priority & Guidance', key: 'Availability',
    consumers: {
      'idx.needset': { desc: 'Primary sort key in sorted_unresolved_keys. Common fields searched before rare ones. Budget exhaustion means rare fields never run.' },
      'llm.budget': { desc: 'Adds availability points (always/sometimes/rare) to per-key attempt budget. keyBudgetCalc.js:15.' },
      'llm.bundle': { desc: 'Primary sort key in passenger packing — most-available peers pack first (cheap-wins-first). keyBundler.js:96-98.' },
    } },

  { path: 'priority.difficulty', type: 'string', flatAliases: ['difficulty'],
    section: 'Extraction Priority & Guidance', key: 'Difficulty',
    consumers: {
      'idx.needset': { desc: 'Secondary sort within same bucket. Hard fields sorted after easy. Does not prevent search, just reorders.' },
      'llm.route': { desc: 'Selects which LLM model handles this key via resolvePhaseModelByTier(policy, difficulty) — tier name (easy/medium/hard/very_hard) billing-tags the call. keyFinder.js:152-153, keyFinderPreviewPrompt.js:165.' },
      'llm.budget': { desc: 'Adds difficulty points (easy=1, medium=2, hard=3, very_hard=4 default) to per-key attempt budget. keyBudgetCalc.js:16.' },
      'llm.bundle': { desc: 'Sets primary bundling pool size, filters passengers by passengerDifficultyPolicy, sorts after availability, and determines passenger point cost. keyBundler.js:69, 89, 99-100, 114.' },
    } },

  // ═══ Contract ════════════════════════════════════════════════════════

  { path: 'variant_dependent', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'Variant Dependent',
    consumers: {
      'llm.bundle': { desc: 'Passenger safety filter — variant-dependent fields are excluded from passenger bundling because the primary call is product-scoped (variantId: null). keyBundler.js:85.' },
      'rev.grid': { desc: 'Determines whether the review grid renders per-variant lanes or a single product-scoped lane. reviewGridData.js:140.' },
    } },

  { path: 'contract.type', type: 'string', flatAliases: ['data_type', 'type'],
    section: 'Contract (Type, Shape, Unit)', key: 'Data Type',
    consumers: {
      'eng.validate': { desc: 'Validates candidate values match the expected data type (string, number, integer, boolean).' },
      'val.type': { desc: 'Type Check. Verifies and coerces value type. Safe coercion only (e.g., "42" to 42).' },
      'rev.grid': { desc: 'Flows through normalizeFieldContract() into the review grid layout metadata. reviewGridHelpers.js:127.' },
      'llm.kf': { desc: 'Injected into return-contract block as the "Type:" line in the per-key finder prompt. keyLlmAdapter.js:118.' },
    } },

  { path: 'contract.shape', type: 'string', flatAliases: ['output_shape', 'shape'],
    section: 'Contract (Type, Shape, Unit)', key: 'Shape',
    consumers: {
      'eng.validate': { desc: 'Validates output shape (scalar, list, object) matches declaration.' },
      'val.shape': { desc: 'Shape Check. Validates value matches expected shape. Short-circuits pipeline on failure.' },
      'seed.schema': { desc: 'Sets is_list_field on the seeded fieldMeta, which drives item_list_links seeding for list-shaped fields. seed.js:473.' },
      'rev.grid': { desc: 'Flows through normalizeFieldContract() into the review grid layout metadata. reviewGridHelpers.js:128.' },
      'llm.kf': { desc: 'Drives scalar-vs-list formatting in the return-contract block and list-rules injection. keyLlmAdapter.js:119.' },
    } },

  { path: 'contract.unit', type: 'string', flatAliases: ['unit'],
    section: 'Contract (Type, Shape, Unit)', key: 'Unit',
    consumers: {
      'eng.normalize': { desc: 'Normalizes extracted values to the declared unit (e.g. "58 grams" to "58g").' },
      'val.unit': { desc: 'Unit Verification. Matches value unit against contract.unit (case-insensitive), rejects unknown units.' },
      'rev.grid': { desc: 'Flows through normalizeFieldContract() into the review grid layout metadata. reviewGridHelpers.js:130.' },
      'llm.kf': { desc: 'Injected into contract block as numeric-precision context so the LLM returns bare numbers with known units. keyLlmAdapter.js:120.' },
    } },

  { path: 'contract.range.min', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'Range Min',
    consumers: {
      'eng.validate': { desc: 'Rejects values below the declared minimum.' },
      'val.range': { desc: 'Range Check. Rejects values outside bounds. No clamping.' },
    } },

  { path: 'contract.range.max', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'Range Max',
    consumers: {
      'eng.validate': { desc: 'Rejects values above the declared maximum.' },
      'val.range': { desc: 'Range Check. Rejects values outside bounds. No clamping.' },
    } },

  { path: 'contract.list_rules', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'List Rules',
    consumers: {
      'eng.list': { desc: 'Applies deduplication, sorting, and item count limits to list-shaped field values.' },
      'val.list': { desc: 'List Rules. Enforces dedupe, sort, min/max items on list-shaped values.' },
      'pub.union': { desc: 'Applies set-union merge for list fields — new candidate values are added to the published list.' },
      'llm.kf': { desc: 'Dedupe + sort rules injected into the contract block for list-shaped fields. keyLlmAdapter.js:122.' },
    } },

  { path: 'contract.list_rules.dedupe', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'List Dedupe',
    consumers: {
      'eng.list': { desc: 'Removes duplicate entries from list values.' },
      'val.list': { desc: 'Deduplicates list values, preserving first occurrence.' },
    } },

  { path: 'contract.list_rules.sort', type: 'string', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'List Sort',
    consumers: {
      'eng.list': { desc: 'Sorts list values using the declared sort order (asc, desc, none).' },
      'val.list': { desc: 'Sorts list values (alpha, numeric, or none).' },
    } },

  { path: 'contract.list_rules.item_union', type: 'string', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'Item Union',
    consumers: {
      'pub.union': { desc: 'Controls how list-field candidates merge with published values. set_union = append unique values to published list. Publisher also implicitly dedupes during merge via Set semantics (publishCandidate.js, republishField.js, reconcileThreshold.js).' },
      'rev.override': { desc: 'Read in normalizeOverrideValue() to decide whether GUI-submitted comma-separated strings should be split into arrays before candidate submission. itemMutationService.js:97-103, called by itemMutationRoutes.js:88,125.' },
    } },


  { path: 'contract.rounding.decimals', type: 'presence', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'Rounding Decimals',
    consumers: {
      'val.rounding': { desc: 'Rounds numeric values to this many decimal places.' },
      'llm.kf': { desc: 'Decimal precision hint injected into the contract block. keyLlmAdapter.js:121.' },
    } },

  { path: 'contract.rounding.mode', type: 'string', flatAliases: [],
    section: 'Contract (Type, Shape, Unit)', key: 'Rounding Mode',
    consumers: {
      'val.rounding': { desc: 'Rounding mode: nearest, floor, or ceil.' },
      'llm.kf': { desc: 'Rounding mode hint injected into the contract block alongside decimals. keyLlmAdapter.js:121.' },
    } },

  { path: 'contract.normalization_fn', type: 'string', flatAliases: ['normalization_fn', 'parse.normalization_fn'],
    section: 'Contract (Type, Shape, Unit)', key: 'Normalization Function',
    consumers: {
      'eng.normalize': { desc: 'Applies a named normalization function to extracted values before storage. Engine checks rule.normalization_fn, contract.normalization_fn, then parse.normalization_fn in that order. fieldRulesEngine.js:50-54.' },
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
      'seed.schema': { desc: 'Seeds enum policy into SpecDb field meta via the compile pass (used for downstream query construction).' },
      'val.enum': { desc: 'Enum Check. Validates values against known-values list using policy. closed: exact match. open_prefer_known: alias resolution.' },
      'pub.gate': { desc: 'Candidate gate persists the submitted value into the discovered-values store when policy is open_prefer_known. submitCandidate.js:237.' },
      'rev.metadata': { desc: 'Surfaced in the component review grid as per-column enum policy metadata. componentReviewHelpers.js:226.' },
      'llm.kf': { desc: 'Injected into the return-contract block as the enum policy hint for the LLM. keyLlmAdapter.js:123.' },
    } },

  { path: 'enum.source', type: 'string', flatAliases: ['enum_source'],
    section: 'Enum Policy', key: 'Source',
    consumers: {
      'seed.schema': { desc: 'Compile pass loads the enum value list (data_lists, component_db, yes_no) into SpecDb as allowed values (via fieldRules.knownValues.enums).' },
      'rev.metadata': { desc: 'Resolves the list_key used to fetch known values during component review. componentReviewHelpers.js:227-230.' },
      'rev.grid': { desc: 'Flows through normalizeFieldContract() into the review grid layout metadata as enum_source. reviewGridHelpers.js:133.' },
    } },

  { path: 'enum.values', type: 'array', flatAliases: [],
    section: 'Enum Policy', key: 'Inline Values',
    consumers: {
      'llm.kf': { desc: 'Rendered into the return-contract block as "Allowed values (policy: ...): a | b | c" and into the return-JSON shape as a union type. First 24 values injected. keyLlmAdapter.js:124, 140-141, 308-311.' },
    } },

  { path: 'enum.match.format_hint', type: 'string', flatAliases: ['enum_match_format_hint'],
    section: 'Enum Policy', key: 'Format Pattern',
    consumers: {
      'val.format': { desc: 'Format Check. Custom regex pattern applied after template registry check.' },
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
      'pub.gate': { desc: 'Rejects candidate at publish time if distinct evidence refs fall below threshold.' },
      'rev.grid': { desc: 'Surfaced in the review grid as the evidence-insufficient threshold displayed per row. reviewGridHelpers.js:134.' },
      'llm.kf': { desc: 'Injected into the evidence requirements block of the per-key finder prompt. keyLlmAdapter.js:422-424.' },
    } },

  { path: 'evidence.tier_preference', type: 'array', flatAliases: [],
    section: 'Evidence Requirements', key: 'Tier Preference',
    consumers: {
      'eng.gate': { desc: 'Prioritizes evidence from preferred tiers during conflict resolution. Higher-preferred tiers win ties.' },
    } },

  // ═══ Parse Rules ═════════════════════════════════════════════════════

  // WHY: parse.template retired — type+shape is the contract. Consumers migrated in Phase 1-2.

  // AI Assist

  { path: 'ai_assist.reasoning_note', type: 'string', flatAliases: [],
    section: 'Extraction Priority & Guidance', key: 'AI Reasoning Note',
    consumers: {
      'llm.kf': { desc: 'Sent to the per-key finder LLM as extraction guidance. Describes expected format, units, edge cases. keyLlmAdapter.js:112.' },
    } },

  { path: 'ai_assist.variant_inventory_usage', type: 'object', flatAliases: [],
    section: 'Extraction Priority & Guidance', key: 'Variant Inventory Usage',
    consumers: {
      'llm.kf': { desc: 'Single on/off checkbox. Enable only when edition/SKU/release/colorway/PIF identity facts add evidence-filter value without ambiguity; field-specific interpretation belongs in ai_assist.reasoning_note.' },
    } },

  { path: 'ai_assist.pif_priority_images', type: 'object', flatAliases: [],
    section: 'Extraction Priority & Guidance', key: 'PIF Priority Images',
    consumers: {
      'llm.kf': { desc: 'Single on/off checkbox. Enable only when default/base PIF priority-view images add visual evidence value. Missing images are not negative evidence; edition/list interpretation belongs in ai_assist.reasoning_note.' },
    } },

  // Search Hints & Aliases

  { path: 'search_hints.query_terms', type: 'filteredArray', flatAliases: [],
    section: 'Search Hints & Aliases', key: 'Query Terms',
    consumers: {
      'idx.needset': { desc: 'Aggregated per bundle, unioned per focus group, sent to LLM planner for search plan generation.' },
      'idx.search': { desc: 'Used directly in fieldSynonyms() for literal query construction and synonym expansion.' },
      'llm.kf': { desc: 'Injected into the search hints block of the per-key finder prompt. keyLlmAdapter.js:165.' },
    } },

  { path: 'search_hints.domain_hints', type: 'filteredArray', flatAliases: [],
    section: 'Search Hints & Aliases', key: 'Domain Hints',
    consumers: {
      'idx.needset': { desc: 'Unioned per group, sent to LLM planner. Boosts matching URLs in result scoring.' },
      'idx.search': { desc: 'At repeat_count>=2 added as literal terms to Tier 3 queries. domain_hint_match reason code.' },
      'llm.kf': { desc: 'Injected into the search hints block as preferred source domains. keyLlmAdapter.js:164.' },
    } },

  { path: 'search_hints.content_types', type: 'filteredArray', flatAliases: [],
    section: 'Search Hints & Aliases', key: 'Content Types',
    consumers: {
      'idx.needset': { desc: 'Bundle grouping key. Fields with different content types get separate bundles.' },
      'idx.search': { desc: 'At repeat_count>=3 adds content suffixes to queries ("specification", "datasheet pdf").' },
    } },

  // Search Hints & Aliases

  { path: 'aliases', type: 'array', flatAliases: [],
    section: 'Search Hints & Aliases', key: 'Aliases',
    consumers: {
      'idx.needset': { desc: 'Included in buildAllAliases() and shardAliases(). At repeat_count>=1 added to Tier 3 queries via applyAliasEnrichment().' },
      'idx.search': { desc: 'At repeat_count>=1, applyAliasEnrichment() adds all_aliases to Tier 3 query terms. queryBuilder.js:591, 662, 669.' },
      'eng.enum': { desc: 'Used for alias-based enum matching resolution.' },
      'llm.kf': { desc: 'Listed in the contract block as alternate names the LLM should recognize in source text. keyLlmAdapter.js:125.' },
    } },

  { path: 'ui.tooltip_md', type: 'string', flatAliases: ['tooltip_md'],
    section: 'Tooltip / Guidance', key: 'Display Tooltip',
    consumers: {
      'idx.needset': { desc: 'Tooltip metadata included in field assessment output.' },
      'idx.search': { desc: 'extractTooltipTerms() parses markdown for 2+ word phrases (max 4), merged into fieldSynonyms().' },
    } },

  // ═══ UI & Display ════════════════════════════════════════════════════

  { path: 'ui.label', type: 'string', flatAliases: ['label', 'display_name'],
    section: 'UI Display', key: 'Label',
    consumers: {
      'idx.needset': { desc: 'Used as display_name in field assessments. Fallback for group description and field identification.' },
      'rev.grid': { desc: 'Rendered as the column label in the review grid layout. reviewGridData.js:63.' },
      'llm.kf': { desc: 'Resolved as the field display name in prompt headers. keyLlmAdapter.js:98.' },
    } },

  { path: 'group', type: 'string', flatAliases: [],
    section: 'Field Groups', key: 'Group',
    consumers: {
      'idx.needset': { desc: 'Fields with the same group get one shared Tier 2 query. Drives group productivity scoring and phase scheduling.' },
      'llm.bundle': { desc: 'Group-only bundling filter — when groupBundlingOnly is on, only same-group peers are eligible as passengers for a primary key\'s LLM call. keyPassengerBuilder.js:17,24.' },
    } },

  { path: 'ui.group', type: 'string', flatAliases: [],
    section: 'Field Groups', key: 'UI Group',
    consumers: {
      'eng.enum': { desc: 'Groups enum fields for shared alias resolution context.' },
      'rev.grid': { desc: 'Groups review-grid columns under the declared UI group. reviewGridData.js:62, 134.' },
    } },

  // ═══ Components ══════════════════════════════════════════════════════

  { path: 'component.type', type: 'string', flatAliases: ['component_type'],
    section: 'Components', key: 'Component Type',
    consumers: {
      'eng.component': { desc: 'Identifies the component type for component DB matching and identity resolution.' },
      'rev.component': { desc: 'Validates component identity candidates against the known component database. Also used to resolve declared component property columns in the review surface. componentReviewHelpers.js:165.' },
      'seed.schema': { desc: 'Creates component identity records and links in SpecDb via the compiled componentDBs.' },
      'llm.kf': { desc: 'Rendered as the type label in the always-on PRODUCT_COMPONENTS inventory block and in the per-key relation pointer ("This key IS the {type} component identity" / "This key belongs to the {type} component"). keyLlmAdapter.js:211-216, 219-236; productResolvedStateReader.js:86, 108.' },
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
      'llm.kf': { desc: 'Drives the subfield list under each component in the PRODUCT_COMPONENTS inventory block and the subfield→parent map used for the per-key relation pointer. productResolvedStateReader.js:31-36, 72-83.' },
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

  { path: 'constraints', type: 'presence', flatAliases: ['cross_field_constraints'],
    section: 'Cross-Field Constraints', key: 'Constraints',
    consumers: {
      'rev.component': { desc: 'Enforces constraint rules during component review property validation.' },
      'seed.component': { desc: 'Seeds constraint definitions into component property meta for review-time enforcement.' },
      'llm.kf': { desc: 'Rendered as the cross-field constraints block in the per-key finder prompt (uses cross_field_constraints alias). keyLlmAdapter.js:198.' },
    } },

  { path: 'variance_policy', type: 'string', flatAliases: [],
    section: 'Cross-Field Constraints', key: 'Variance Policy',
    consumers: {
      'rev.component': { desc: 'Controls how component property variance is handled during review.' },
      'seed.component': { desc: 'Seeds variance policy into component property meta.' },
      'llm.kf': { desc: 'Injected into the contract block as "Variance policy" to tell the LLM how to resolve disagreeing sources. keyLlmAdapter.js:126.' },
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

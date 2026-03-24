// ── System Consumer Mapping ──────────────────────────────────────────
// Static mapping of field rule properties to downstream system consumers.
// Badge configs, field-to-system map, and helpers for consumer override logic.
//
// ── MAINTENANCE GUIDE ────────────────────────────────────────────────
//
// When adding a new field rule property:
//   1. Add one entry to FIELD_CONSUMER_REGISTRY.
//   2. Run: node --test test/systemMappingCoverage.test.js
//
// Backend cross-references (trace these for consumer evidence):
//   - src/engine/ruleAccessors.js    — universal getters for field rule properties
//   - src/db/seed.js                 — seedSourceAndKeyReview, deriveSchemaFromFieldRules
//   - src/categories/loader.js       — loadCategoryConfig, schema derivation
//   - src/indexlab/needsetEngine.js   — NeedSet score computation
//   - src/llm/extractCandidatesLLM.js — LLM extraction context
//   - src/retrieve/tierAwareRetriever.js — tier preference retrieval
//   - implementation/ai-implenentation-plans/ai-source-review.md — review route matrix

export type DownstreamSystem = 'indexlab' | 'seed' | 'review';

export const SYSTEM_BADGE_CONFIGS: Record<DownstreamSystem, {
  label: string;
  title: string;
  cls: string;
  clsDim: string;
}> = {
  indexlab: {
    label: 'IDX',
    title: 'Indexing Lab',
    cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    clsDim: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 line-through',
  },
  seed: {
    label: 'SEED',
    title: 'Seed Pipeline',
    cls: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
    clsDim: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 line-through',
  },
  review: {
    label: 'REV',
    title: 'LLM Review',
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    clsDim: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 line-through',
  },
};

type SystemSet = DownstreamSystem[];

const IDX: SystemSet = ['indexlab'];
const IDX_REV: SystemSet = ['indexlab', 'review'];
const IDX_SEED_REV: SystemSet = ['indexlab', 'seed', 'review'];
const SEED_IDX_REV: SystemSet = ['seed', 'indexlab', 'review'];
const REV: SystemSet = ['review'];

// ── Single source of truth: field → systems + navigation + tooltips ──

type ConsumerTip = { on: string; off: string };

interface FieldConsumerEntry {
  systems: SystemSet;
  navigation?: { section: string; key: string };
  tooltips: Partial<Record<DownstreamSystem, ConsumerTip>>;
}

const FIELD_CONSUMER_REGISTRY: Record<string, FieldConsumerEntry> = {
  // ── Contract ──────────────────────────────────────────────────────────
  'contract.type': {
    systems: IDX_SEED_REV,
    navigation: { section: 'Contract (Type, Shape, Unit)', key: 'Data Type' },
    tooltips: {
      indexlab: {
        on: 'IndexLab selects the correct parser and validator based on data type (string, number, boolean, etc.). Values are type-checked before acceptance.',
        off: 'IndexLab skips type-aware parsing. Extracted values pass through without type validation — may produce misformatted data.',
      },
      seed: {
        on: 'Seed Pipeline creates correctly-typed columns in SpecDb. The database schema matches the declared type.',
        off: 'Seed Pipeline skips this field during schema creation. The field will not appear in seeded data.',
      },
      review: {
        on: 'LLM Review validates that candidate values match the expected data type. Type mismatches are flagged for correction.',
        off: 'LLM Review accepts candidates regardless of type format. Misformatted values (e.g., text in a number field) are not caught.',
      },
    },
  },
  'contract.shape': {
    systems: IDX_SEED_REV,
    navigation: { section: 'Contract (Type, Shape, Unit)', key: 'Shape' },
    tooltips: {
      indexlab: {
        on: 'IndexLab parses according to the declared shape: scalar (single value), list (multiple values), or structured (key-value pairs).',
        off: 'IndexLab ignores shape — may misparse lists as single values or vice versa. Data structure may be incorrect.',
      },
      seed: {
        on: 'Seed Pipeline sets up the correct storage structure in SpecDb: single value column vs array vs structured object.',
        off: 'Seed Pipeline defaults to scalar storage. List or structured data may be flattened or lost.',
      },
      review: {
        on: 'LLM Review validates that candidate shape matches the declaration. A list value in a scalar field is flagged.',
        off: 'LLM Review ignores shape mismatches. Wrong-shape values pass through unchecked.',
      },
    },
  },
  'contract.unit': {
    systems: IDX_REV,
    navigation: { section: 'Contract (Type, Shape, Unit)', key: 'Unit' },
    tooltips: {
      indexlab: {
        on: 'IndexLab normalizes all extracted values to this unit (e.g., g, mm, Hz). Values in alternate units are converted automatically.',
        off: 'IndexLab skips unit normalization. Values arrive in whatever unit was found on the source page — may be inconsistent.',
      },
      review: {
        on: 'LLM Review flags candidates with unexpected or missing units. Ensures unit consistency across sources.',
        off: 'LLM Review does not check unit correctness. Candidates with wrong units pass through undetected.',
      },
    },
  },
  'contract.range': {
    systems: IDX,
    navigation: { section: 'Contract (Type, Shape, Unit)', key: 'Range' },
    tooltips: {
      indexlab: {
        on: 'IndexLab enforces the configured min/max numeric range during runtime validation and extraction guidance.',
        off: 'IndexLab skips the field-specific numeric range guard. Out-of-range values are no longer blocked by this field rule.',
      },
    },
  },
  'contract.list_rules': {
    systems: IDX,
    navigation: { section: 'Contract (Type, Shape, Unit)', key: 'List Rules' },
    tooltips: {
      indexlab: {
        on: 'IndexLab enforces the configured list dedupe, ordering, and item limits during runtime normalization.',
        off: 'IndexLab ignores the field-specific list rules. List outputs fall back to default runtime handling.',
      },
    },
  },
  'contract.unknown_token': {
    systems: IDX,
    navigation: { section: 'Contract (Type, Shape, Unit)', key: 'Unknown Token' },
    tooltips: {
      indexlab: {
        on: 'IndexLab passes this token into field-specific extraction guidance and runtime metadata when the field is unresolved.',
        off: 'IndexLab omits the field-specific unknown token and falls back to default extraction guidance.',
      },
    },
  },

  // ── Priority ──────────────────────────────────────────────────────────
  'priority.required_level': {
    systems: SEED_IDX_REV,
    navigation: { section: 'Priority & Effort', key: 'Required Level' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline classifies fields into critical/expected/deep schema buckets based on required level. Determines which fields are seeded into SpecDb.',
        off: 'Seed Pipeline skips required-level classification. The field is not categorized into any schema bucket.',
      },
      indexlab: {
        on: 'IndexLab uses the required level (identity → optional) to compute NeedSet priority scores. Higher-priority fields get more search queries and extraction effort.',
        off: 'IndexLab treats this field as lowest priority. Minimal search and extraction effort is allocated — the field may go unfilled.',
      },
      review: {
        on: 'LLM Review weights this field by importance during consensus scoring. Identity/required fields get stricter validation.',
        off: 'LLM Review gives this field no priority weighting. Treated as optional during scoring.',
      },
    },
  },
  'priority.availability': {
    systems: SEED_IDX_REV,
    navigation: { section: 'Priority & Effort', key: 'Availability' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline sorts fields into expected-easy vs expected-sometimes buckets based on availability. Affects schema classification.',
        off: 'Seed Pipeline does not factor availability into schema classification. Fields are bucketed without availability context.',
      },
      indexlab: {
        on: 'IndexLab adjusts search effort based on how commonly this data appears online (always → rare). Rare fields trigger more aggressive search strategies.',
        off: 'IndexLab assumes default availability. No search effort adjustment — may over-invest on common fields or under-invest on rare ones.',
      },
      review: {
        on: 'LLM Review factors availability into route matrix lookup for model selection. Rare fields may get stronger models.',
        off: 'LLM Review ignores availability when selecting validation models. Default model tier is used.',
      },
    },
  },
  'priority.difficulty': {
    systems: SEED_IDX_REV,
    navigation: { section: 'Priority & Effort', key: 'Difficulty' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline sorts fields by difficulty for schema classification. Harder fields are flagged for deeper extraction pipelines.',
        off: 'Seed Pipeline does not factor difficulty into schema classification.',
      },
      indexlab: {
        on: 'IndexLab selects extraction strategy based on difficulty. Harder fields use more powerful LLM models and deeper source analysis.',
        off: 'IndexLab uses the default extraction strategy regardless of actual difficulty. Complex fields may get insufficient extraction effort.',
      },
      review: {
        on: 'LLM Review selects stronger models for harder fields via the route matrix difficulty band.',
        off: 'LLM Review uses the default model tier regardless of field difficulty.',
      },
    },
  },
  'priority.effort': {
    systems: SEED_IDX_REV,
    navigation: { section: 'Priority & Effort', key: 'Effort' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline maps effort to route matrix effort band for key review state seeding. Higher effort fields get larger LLM budgets.',
        off: 'Seed Pipeline uses default effort band. Key review state is seeded without effort context.',
      },
      indexlab: {
        on: 'IndexLab caps LLM calls and search depth using this effort budget (1-10). Higher effort = more API calls and deeper source crawling.',
        off: 'IndexLab uses the default effort budget. May over-spend on simple fields or under-spend on complex ones.',
      },
      review: {
        on: 'LLM Review determines per-field LLM call budget via the route matrix effort band. Higher effort allows more validation passes.',
        off: 'LLM Review uses default call budget. No per-field effort adjustment.',
      },
    },
  },
  'priority.block_publish_when_unk': {
    systems: IDX_REV,
    navigation: { section: 'Priority & Effort', key: 'Block Publish When Unknown' },
    tooltips: {
      indexlab: {
        on: 'IndexLab blocks publishing if this field value is the unknown token (e.g., "unk"). Even having the placeholder counts as missing.',
        off: 'IndexLab allows publishing with unknown tokens. Products can export with "unk" values in this field.',
      },
      review: {
        on: 'LLM Review blocks publishing when the final value equals the unknown token. Flags it as unresolved.',
        off: 'LLM Review allows unknown token values to pass through. "unk" is treated as a valid value.',
      },
    },
  },

  // ── AI Assist ─────────────────────────────────────────────────────────
  'ai_assist.mode': {
    systems: SEED_IDX_REV,
    navigation: { section: 'AI Assist', key: 'Mode' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline seeds initial key_review_state AI configuration from this mode. Determines default AI behavior for the review pipeline.',
        off: 'Seed Pipeline does not seed AI mode into key_review_state. Review starts with no AI configuration.',
      },
      indexlab: {
        on: 'IndexLab uses the configured AI mode (advisory, planner, judge) to control extraction depth and model selection for this field.',
        off: 'IndexLab runs with no AI assistance for this field. Only deterministic parsing and static extraction are used.',
      },
      review: {
        on: 'LLM Review uses the AI mode to control validation rigor. Judge mode enables deep reasoning with the strongest model.',
        off: 'LLM Review skips AI-powered validation. This field is only reviewed by human operators.',
      },
    },
  },
  'ai_assist.model_strategy': {
    systems: IDX_REV,
    navigation: { section: 'AI Assist', key: 'Model Strategy' },
    tooltips: {
      indexlab: {
        on: 'IndexLab uses this strategy override (auto, force_fast, force_deep) to select the LLM model for extraction calls.',
        off: 'IndexLab auto-selects the model based on AI mode. The strategy override is ignored.',
      },
      review: {
        on: 'LLM Review overrides model tier selection from the route ladder based on this strategy. force_deep ensures the strongest model is used.',
        off: 'LLM Review auto-selects the validation model from the route ladder. No per-field strategy override.',
      },
    },
  },
  'ai_assist.max_tokens': {
    systems: IDX_REV,
    navigation: { section: 'AI Assist', key: 'Max Tokens' },
    tooltips: {
      indexlab: {
        on: 'IndexLab caps LLM output tokens per call for this field. Controls cost per API call and response length.',
        off: 'IndexLab uses the default token cap for the selected model. No per-field token limit applied.',
      },
      review: {
        on: 'LLM Review caps output tokens per call during validation for this field. Controls response length and cost.',
        off: 'LLM Review uses the default token cap for the selected model. No per-field limit.',
      },
    },
  },
  'ai_assist.reasoning_note': {
    systems: IDX_REV,
    navigation: { section: 'AI Assist', key: 'Reasoning Note' },
    tooltips: {
      indexlab: {
        on: 'IndexLab sends this extraction guidance text to the LLM as part of the prompt. Helps the model understand what to extract and how.',
        off: 'IndexLab uses auto-generated guidance derived from other field settings (type, difficulty, evidence rules).',
      },
      review: {
        on: 'LLM Review includes this extraction guidance in the AI validation prompt. Helps the model understand field-specific validation nuances.',
        off: 'LLM Review uses auto-generated guidance only. No per-field reasoning note is included.',
      },
    },
  },

  // ── Parse ─────────────────────────────────────────────────────────────
  'parse.template': {
    systems: IDX_REV,
    navigation: { section: 'Parse Rules', key: 'Parse Template' },
    tooltips: {
      indexlab: {
        on: 'IndexLab uses this template to structure extraction output (number_with_unit, boolean, component_reference, etc.). Controls how raw text becomes structured data.',
        off: 'IndexLab falls back to raw text extraction. No structured parsing is applied — output is unformatted text.',
      },
      review: {
        on: 'LLM Review validates that candidate values match the expected parse template format. Format violations are flagged.',
        off: 'LLM Review does not check parse template compliance. Any format is accepted.',
      },
    },
  },

  // ── Enum ──────────────────────────────────────────────────────────────
  'enum.policy': {
    systems: SEED_IDX_REV,
    navigation: { section: 'Enum Policy', key: 'Policy' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline uses the enum policy (open, closed, open_prefer_known) when populating initial value constraints in SpecDb.',
        off: 'Seed Pipeline skips enum constraint seeding. All values are accepted without policy enforcement.',
      },
      indexlab: {
        on: 'IndexLab validates extracted values against enum policy. A "closed" policy rejects any value not in the allowed list.',
        off: 'IndexLab ignores enum policy. Any extracted value passes through regardless of the allowed list.',
      },
      review: {
        on: 'LLM Review enforces enum policy during candidate scoring. Unknown values in a "closed" enum are flagged as invalid.',
        off: 'LLM Review does not enforce enum constraints. Any value is accepted during review.',
      },
    },
  },
  'enum.source': {
    systems: SEED_IDX_REV,
    navigation: { section: 'Enum Policy', key: 'Source' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline loads the enum value list from this source (data_lists, component_db, yes_no) into SpecDb as allowed values.',
        off: 'Seed Pipeline does not seed any enum values for this field. The allowed-value list remains empty.',
      },
      indexlab: {
        on: 'IndexLab uses this value list to validate and normalize extracted values. Known values get higher confidence scores.',
        off: 'IndexLab ignores the enum source. Extracted values are not validated against any known-value list.',
      },
      review: {
        on: 'LLM Review matches candidates against this enum value list during scoring. Known values score higher.',
        off: 'LLM Review does not check candidates against any enum list. All values are scored equally.',
      },
    },
  },
  'enum.match.strategy': {
    systems: REV,
    tooltips: {
      review: {
        on: 'LLM Review uses this matching strategy (alias, exact, fuzzy) when comparing candidates to enum values. Alias matching uses known alternate names.',
        off: 'LLM Review defaults to exact string matching only. Aliases and fuzzy matching are not used.',
      },
    },
  },
  'enum.match.format_hint': {
    systems: REV,
    tooltips: {
      review: {
        on: 'LLM Review uses this format template as output guidance during enum consistency runs. Use placeholders like XXXX and YYYY for variable segments.',
        off: 'LLM Review ignores the custom format template and falls back to canonical list style inference.',
      },
    },
  },
  'enum.match.fuzzy_threshold': {
    systems: REV,
    tooltips: {
      review: {
        on: 'LLM Review uses this threshold (0-1) as the minimum fuzzy similarity for a candidate to match an enum value. Lower = more lenient.',
        off: 'LLM Review uses the default 0.92 threshold. Only very close matches are accepted.',
      },
    },
  },
  'enum.additional_values': {
    systems: REV,
    tooltips: {
      review: {
        on: 'LLM Review includes custom strings in review-time enum matching and consistency decisions.',
        off: 'LLM Review ignores custom strings for enum matching and consistency decisions.',
      },
    },
  },

  // ── Evidence ──────────────────────────────────────────────────────────
  'evidence.required': {
    systems: SEED_IDX_REV,
    navigation: { section: 'Evidence Requirements', key: 'Evidence Required' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline seeds key_review_state to require evidence backing for this field. Review starts with evidence as mandatory.',
        off: 'Seed Pipeline does not seed evidence requirement. Key review state starts without evidence mandate.',
      },
      indexlab: {
        on: 'IndexLab requires at least one evidence source to support any extracted value. Unsupported values are rejected.',
        off: 'IndexLab accepts values without evidence backing. No source attribution is required.',
      },
      review: {
        on: 'LLM Review blocks candidates that lack supporting evidence references. Evidence is mandatory for acceptance.',
        off: 'LLM Review accepts candidates regardless of evidence backing.',
      },
    },
  },
  'evidence.min_evidence_refs': {
    systems: SEED_IDX_REV,
    navigation: { section: 'Evidence Requirements', key: 'Min Evidence Refs' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline seeds the minimum evidence reference count into key_review_state. Review starts with this threshold enforced.',
        off: 'Seed Pipeline does not seed a minimum reference count. Key review state starts with no evidence count requirement.',
      },
      indexlab: {
        on: 'IndexLab requires this many independent sources to confirm a value before accepting it. Higher counts increase accuracy but may reduce fill rate.',
        off: 'IndexLab accepts values with any number of sources. No minimum reference count is enforced.',
      },
      review: {
        on: 'LLM Review flags candidates that do not meet the minimum source count. Insufficient evidence lowers confidence.',
        off: 'LLM Review does not enforce minimum source requirements. Single-source values are accepted.',
      },
    },
  },
  'evidence.conflict_policy': {
    systems: IDX_REV,
    navigation: { section: 'Evidence Requirements', key: 'Conflict Policy' },
    tooltips: {
      indexlab: {
        on: 'IndexLab uses this policy to resolve conflicting values from different sources (e.g., prefer highest tier, flag for review, prefer most recent).',
        off: 'IndexLab defaults to "resolve by tier" conflict resolution. The highest-tier source wins automatically.',
      },
      review: {
        on: 'LLM Review applies the configured conflict resolution policy when multiple candidates disagree.',
        off: 'LLM Review defaults to tier-based resolution without the configured policy override.',
      },
    },
  },
  'evidence.tier_preference': {
    systems: IDX_REV,
    navigation: { section: 'Evidence Requirements', key: 'Tier Preference' },
    tooltips: {
      indexlab: {
        on: 'IndexLab prioritizes evidence from these tiers in order: T1 (manufacturer), T2 (lab reviews), T3 (retail). Earlier tiers outrank later ones.',
        off: 'IndexLab treats all source tiers equally. A retail listing is weighted the same as a manufacturer spec sheet.',
      },
      review: {
        on: 'LLM Review weights evidence quality by tier during scoring. Higher-tier sources contribute more confidence to candidate acceptance.',
        off: 'LLM Review treats all evidence tiers equally during scoring. Source quality does not affect confidence.',
      },
    },
  },

  // ── Search ────────────────────────────────────────────────────────────
  'search_hints.domain_hints': {
    systems: IDX,
    navigation: { section: 'Search Hints', key: 'Domain Hints' },
    tooltips: {
      indexlab: {
        on: 'IndexLab prioritizes these domains in search queries (e.g., manufacturer site, rtings.com). Increases likelihood of finding authoritative sources.',
        off: 'IndexLab searches all domains with equal priority. No domain preference is applied — results depend entirely on search engine ranking.',
      },
    },
  },
  'search_hints.preferred_content_types': {
    systems: IDX,
    navigation: { section: 'Search Hints', key: 'Preferred Content Types' },
    tooltips: {
      indexlab: {
        on: 'IndexLab preferentially fetches these content types (spec_sheet, datasheet, review) during discovery. Matching pages are crawled first.',
        off: 'IndexLab fetches all content types with equal priority. No content-type preference is applied.',
      },
    },
  },
  'search_hints.query_terms': {
    systems: IDX,
    navigation: { section: 'Search Hints', key: 'Query Terms' },
    tooltips: {
      indexlab: {
        on: 'IndexLab includes these extra terms in search queries to improve relevance for this specific field (e.g., "specifications", "tech specs").',
        off: 'IndexLab constructs queries using only the product name and category. No field-specific search terms are added.',
      },
    },
  },

  // ── Constraints ───────────────────────────────────────────────────────
  constraints: {
    systems: IDX_REV,
    navigation: { section: 'Cross-Field Constraints', key: 'Constraints' },
    tooltips: {
      indexlab: {
        on: 'IndexLab enforces cross-field validation rules (e.g., min < max, weight must be positive, length consistency). Invalid value combinations are rejected.',
        off: 'IndexLab skips cross-field constraint checks. Inconsistent values across related fields may pass through undetected.',
      },
      review: {
        on: 'LLM Review enforces constraint rules during candidate scoring. Constraint violations lower confidence and may block acceptance.',
        off: 'LLM Review ignores cross-field constraints. Contradictory values across fields are not flagged.',
      },
    },
  },

  // ── Component / Deps ──────────────────────────────────────────────────
  'component.type': {
    systems: SEED_IDX_REV,
    navigation: { section: 'Components', key: 'Component Type' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline creates component identity records and links for this component type in SpecDb. Products are linked to their components.',
        off: 'Seed Pipeline skips component identity creation. No component links are established in the database.',
      },
      indexlab: {
        on: 'IndexLab performs component identity matching using the component database. Extracted names are matched to known components with aliases.',
        off: 'IndexLab treats this as a plain text field. No component matching or identity resolution is performed.',
      },
      review: {
        on: 'LLM Review validates component identity candidates against the known component database. Fuzzy matching and alias resolution are applied.',
        off: 'LLM Review skips component identity validation. Component names are accepted as raw text without matching.',
      },
    },
  },
  'component.match.fuzzy_threshold': {
    systems: REV,
    tooltips: {
      review: {
        on: 'LLM Review uses this threshold (0-1) to control how similar a name must be to count as a component match. Lower = more lenient matching.',
        off: 'LLM Review uses the default 0.75 fuzzy threshold for component matching.',
      },
    },
  },
  'component.match.name_weight': {
    systems: REV,
    tooltips: {
      review: {
        on: 'LLM Review weights component name similarity by this factor (0-1) in the identity score. Higher weight = name matters more than properties.',
        off: 'LLM Review uses the default 0.4 name weight. Properties contribute more than names to the identity score.',
      },
    },
  },
  'component.match.auto_accept_score': {
    systems: REV,
    tooltips: {
      review: {
        on: 'LLM Review auto-accepts component matches scoring above this threshold without requiring human review. Higher = more conservative auto-accept.',
        off: 'LLM Review uses the default 0.95 auto-accept threshold.',
      },
    },
  },
  'component.match.flag_review_score': {
    systems: REV,
    tooltips: {
      review: {
        on: 'LLM Review flags component matches scoring below this threshold for human review. Lower = only very poor matches are flagged.',
        off: 'LLM Review uses the default 0.65 flag-for-review threshold.',
      },
    },
  },
  'component.match.property_weight': {
    systems: REV,
    tooltips: {
      review: {
        on: 'LLM Review weights component property similarity by this factor (0-1) in the identity score. Higher = properties matter more than names.',
        off: 'LLM Review uses the default 0.6 property weight.',
      },
    },
  },
  aliases: {
    systems: SEED_IDX_REV,
    navigation: { section: 'Extraction Hints & Aliases', key: 'Aliases' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline registers these alternative names as valid aliases for the field key in SpecDb. They can be used for lookups and matching.',
        off: 'Seed Pipeline does not create alias entries. The field is only findable by its canonical key.',
      },
      indexlab: {
        on: 'IndexLab uses these aliases during search query building and extraction to recognize alternative field names in source pages.',
        off: 'IndexLab only searches using the canonical field name. Alternate names in source pages may be missed.',
      },
      review: {
        on: 'LLM Review recognizes these aliases when matching candidates to this field. Helps resolve alternative naming in source data.',
        off: 'LLM Review only matches candidates by the exact canonical field key. Aliases are ignored.',
      },
    },
  },

  // ── Tooltip / UI ──────────────────────────────────────────────────────
  'ui.tooltip_md': {
    systems: IDX_REV,
    navigation: { section: 'Extraction Hints & Aliases', key: 'Tooltip Markdown' },
    tooltips: {
      indexlab: {
        on: 'IndexLab includes this guidance text in the LLM extraction prompt. Helps the AI understand field semantics and extraction nuances.',
        off: 'IndexLab does not send any field-specific guidance text to the LLM. The model relies only on the field name and contract settings.',
      },
      review: {
        on: 'LLM Review displays this tooltip to human reviewers and includes it in AI validation context. Helps reviewers understand what the field means.',
        off: 'LLM Review hides field guidance. Reviewers see no description — must rely on field name alone.',
      },
    },
  },
};

// ── Derived exports ─────────────────────────────────────────────────────

export const FIELD_SYSTEM_MAP: Record<string, SystemSet> = Object.fromEntries(
  Object.entries(FIELD_CONSUMER_REGISTRY).map(([k, v]) => [k, v.systems]),
);

export const CONSUMER_TOOLTIPS: Record<string, Partial<Record<DownstreamSystem, ConsumerTip>>> = Object.fromEntries(
  Object.entries(FIELD_CONSUMER_REGISTRY).map(([k, v]) => [k, v.tooltips]),
);

const KEY_NAVIGATION_PATHS: Record<string, { section: string; key: string }> = Object.fromEntries(
  Object.entries(FIELD_CONSUMER_REGISTRY)
    .filter(([, v]) => v.navigation)
    .map(([k, v]) => [k, v.navigation!]),
);

// ── Retired IDX-only tooltip cleanup ────────────────────────────────────

const REMOVED_IDX_TOOLTIP_FIELDS = [
  'ai_assist.max_calls',
  'parse.unit_accepts',
  'parse.allow_unitless',
  'parse.allow_ranges',
  'parse.strict_unit_required',
] as const;

for (const fieldPath of REMOVED_IDX_TOOLTIP_FIELDS) {
  delete CONSUMER_TOOLTIPS[fieldPath];
}

// ── Public helpers ──────────────────────────────────────────────────────

export function getFieldSystems(fieldPath: string): DownstreamSystem[] {
  return FIELD_SYSTEM_MAP[fieldPath] || [];
}

export function isConsumerEnabled(
  rule: Record<string, unknown>,
  fieldPath: string,
  system: DownstreamSystem,
): boolean {
  const consumers = rule.consumers as Record<string, Record<string, boolean>> | undefined;
  if (!consumers) return true;
  const overrides = consumers[fieldPath];
  if (!overrides) return true;
  return overrides[system] !== false;
}

// ── Tooltip formatters (shared by all 3 tabs) ──────────────────────────

function keyNavigationLine(fieldPath: string): string {
  const path = KEY_NAVIGATION_PATHS[fieldPath];
  if (!path) return '';
  return `This feature is enabled in Key Navigation > ${path.section} > ${path.key}.`;
}

export function formatConsumerTooltip(
  fieldPath: string,
  system: DownstreamSystem,
  enabled: boolean,
): string {
  const cfg = SYSTEM_BADGE_CONFIGS[system];
  const tip = CONSUMER_TOOLTIPS[fieldPath]?.[system];

  if (!tip) {
    return `${cfg.title}\nStatus: ${enabled ? 'Enabled' : 'Disabled'}\n\nClick to ${enabled ? 'disable' : 'enable'}`;
  }

  const keyNav = keyNavigationLine(fieldPath);
  const enabledDescription = `${cfg.title} reads '${fieldPath}' for this field. ${tip.on}`.trim();
  const disabledDescription = `${cfg.title} ignores '${fieldPath}' for this field when disabled (gate applied). ${tip.off}`.trim();

  return [
    `${cfg.title}`,
    `Status: ${enabled ? 'Enabled' : 'Disabled'}`,
    '',
    'When enabled:',
    ...(keyNav ? [keyNav] : []),
    enabledDescription,
    '',
    'When disabled:',
    disabledDescription,
    '',
    `Click to ${enabled ? 'disable' : 'enable'}`,
  ].join('\n');
}

export function formatStaticConsumerTooltip(
  fieldPath: string,
  system: DownstreamSystem,
): string {
  const cfg = SYSTEM_BADGE_CONFIGS[system];
  const tip = CONSUMER_TOOLTIPS[fieldPath]?.[system];

  if (!tip) return cfg.title;

  const keyNav = keyNavigationLine(fieldPath);
  const summary = `${cfg.title} reads '${fieldPath}' for this field. ${tip.on}`.trim();

  return [
    cfg.title,
    '',
    ...(keyNav ? [keyNav, ''] : []),
    summary,
  ].join('\n');
}

export interface ParsedConsumerTooltip {
  title: string;
  status: string;
  whenEnabled: string;
  whenDisabled: string;
  action: string;
}

export interface ParsedStaticConsumerTooltip {
  title: string;
  summary: string;
}

function cleanTooltipLines(text: string): string[] {
  return String(text || '')
    .split(/\r?\n/g)
    .map((line) => String(line || '').trim());
}

function firstNonEmpty(lines: string[]): string {
  const found = lines.find((line) => line.length > 0);
  return found || '';
}

function joinSectionLines(lines: string[], start: number, end: number): string {
  if (start < 0 || end <= start) return '';
  return lines
    .slice(start, end)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
}

export function parseFormattedConsumerTooltip(formatted: string): ParsedConsumerTooltip {
  const lines = cleanTooltipLines(formatted);
  const title = firstNonEmpty(lines);

  const statusLine = lines.find((line) => line.startsWith('Status:'));
  const status = statusLine ? statusLine.replace(/^Status:\s*/, '').trim() : '';

  const enabledHeaderIdx = lines.findIndex((line) => line === 'When enabled:');
  const disabledHeaderIdx = lines.findIndex((line) => line === 'When disabled:');
  const actionIdx = lines.findIndex((line) => line.startsWith('Click to '));

  const whenEnabled = joinSectionLines(lines, enabledHeaderIdx + 1, disabledHeaderIdx >= 0 ? disabledHeaderIdx : lines.length);
  const whenDisabled = joinSectionLines(lines, disabledHeaderIdx + 1, actionIdx >= 0 ? actionIdx : lines.length);
  const action = actionIdx >= 0 ? lines[actionIdx] : '';

  return {
    title,
    status,
    whenEnabled,
    whenDisabled,
    action,
  };
}

export function parseFormattedStaticConsumerTooltip(formatted: string): ParsedStaticConsumerTooltip {
  const lines = cleanTooltipLines(formatted);
  const title = firstNonEmpty(lines);
  const titleIdx = lines.findIndex((line) => line === title);
  const summary = lines
    .slice(Math.max(0, titleIdx + 1))
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');

  return {
    title,
    summary,
  };
}

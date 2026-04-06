// ── System Consumer Mapping ──────────────────────────────────────────
// Static mapping of field rule properties to downstream system consumers.
// Badge configs, field-to-system map, and helpers for consumer override logic.
//
// ── MAINTENANCE GUIDE ────────────────────────────────────────────────
//
// When adding a new field rule property:
//   1. Add the field path + systems to FIELD_SYSTEM_MAP in src/field-rules/consumerGate.js (SSOT).
//   2. Add tooltips (and optional navigation) to FIELD_CONSUMER_REGISTRY below.
//   3. Run: node --test tools/gui-react/src/features/studio/workbench/__tests__/systemMappingCoverage.test.js
//
// Backend cross-references (trace these for consumer evidence):
//   - src/engine/ruleAccessors.js    — universal getters for field rule properties
//   - src/db/seed.js                 — seedSourceAndKeyReview, deriveSchemaFromFieldRules
//   - src/categories/loader.js       — loadCategoryConfig, schema derivation
//   - src/indexlab/needsetEngine.js   — NeedSet score computation
//   - src/llm/extractCandidatesLLM.js — LLM extraction context
//   - src/retrieve/tierAwareRetriever.js — tier preference retrieval
//   - implementation/ai-implenentation-plans/ai-source-review.md — review route matrix

// WHY: O(1) SSOT — field-to-system mapping owned by backend consumerGate.js.
// IDX badge tooltips derived from idxBadgeRegistry.js (single definition point).
import { FIELD_SYSTEM_MAP as BACKEND_FIELD_SYSTEM_MAP } from '../../../../../../src/field-rules/consumerGate.js';
import { IDX_BADGE_REGISTRY } from '../../../../../../src/field-rules/idxBadgeRegistry.js';

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

type ConsumerTip = { on: string; off: string };

interface FieldConsumerEntry {
  navigation?: { section: string; key: string };
  tooltips: Partial<Record<DownstreamSystem, ConsumerTip>>;
}

const FIELD_CONSUMER_REGISTRY: Record<string, FieldConsumerEntry> = {
  // ── Contract ──────────────────────────────────────────────────────────
  'contract.type': {

    navigation: { section: 'Contract (Type, Shape, Unit)', key: 'Data Type' },
    tooltips: {
      review: {
        on: 'LLM Review validates that candidate values match the expected data type. Type mismatches are flagged for correction.',
        off: 'LLM Review accepts candidates regardless of type format. Misformatted values (e.g., text in a number field) are not caught.',
      },
    },
  },
  'contract.shape': {

    navigation: { section: 'Contract (Type, Shape, Unit)', key: 'Shape' },
    tooltips: {
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
    navigation: { section: 'Contract (Type, Shape, Unit)', key: 'Unit' },
    tooltips: {
      review: {
        on: 'LLM Review flags candidates with unexpected or missing units. Ensures unit consistency across sources.',
        off: 'LLM Review does not check unit correctness. Candidates with wrong units pass through undetected.',
      },
    },
  },

  // ── Priority ──────────────────────────────────────────────────────────
  'priority.required_level': {

    navigation: { section: 'Priority & Effort', key: 'Required Level' },
    tooltips: {
      review: {
        on: 'LLM Review weights this field by importance during consensus scoring. Identity/required fields get stricter validation.',
        off: 'LLM Review gives this field no priority weighting. Treated as optional during scoring.',
      },
    },
  },
  'priority.availability': {
    navigation: { section: 'Priority & Effort', key: 'Availability' },
    tooltips: {},
  },
  'priority.difficulty': {
    navigation: { section: 'Priority & Effort', key: 'Difficulty' },
    tooltips: {},
  },


  // ── Enum ──────────────────────────────────────────────────────────────
  'enum.policy': {

    navigation: { section: 'Enum Policy', key: 'Policy' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline uses the enum policy (open, closed, open_prefer_known) when populating initial value constraints in SpecDb.',
        off: 'Seed Pipeline skips enum constraint seeding. All values are accepted without policy enforcement.',
      },
      review: {
        on: 'LLM Review enforces enum policy during candidate scoring. Unknown values in a "closed" enum are flagged as invalid.',
        off: 'LLM Review does not enforce enum constraints. Any value is accepted during review.',
      },
    },
  },
  'enum.source': {

    navigation: { section: 'Enum Policy', key: 'Source' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline loads the enum value list from this source (data_lists, component_db, yes_no) into SpecDb as allowed values.',
        off: 'Seed Pipeline does not seed any enum values for this field. The allowed-value list remains empty.',
      },
      review: {
        on: 'LLM Review matches candidates against this enum value list during scoring. Known values score higher.',
        off: 'LLM Review does not check candidates against any enum list. All values are scored equally.',
      },
    },
  },
  'enum.match.strategy': {
    tooltips: {
      review: {
        on: 'LLM Review uses this matching strategy (alias, exact, fuzzy) when comparing candidates to enum values. Alias matching uses known alternate names.',
        off: 'LLM Review defaults to exact string matching only. Aliases and fuzzy matching are not used.',
      },
    },
  },
  'enum.match.format_hint': {
    tooltips: {
      review: {
        on: 'LLM Review uses this format template as output guidance during enum consistency runs. Use placeholders like XXXX and YYYY for variable segments.',
        off: 'LLM Review ignores the custom format template and falls back to canonical list style inference.',
      },
    },
  },
  'enum.additional_values': {
    tooltips: {
      review: {
        on: 'LLM Review includes custom strings in review-time enum matching and consistency decisions.',
        off: 'LLM Review ignores custom strings for enum matching and consistency decisions.',
      },
    },
  },

  // ── Evidence ──────────────────────────────────────────────────────────
  'evidence.min_evidence_refs': {

    navigation: { section: 'Evidence Requirements', key: 'Min Evidence Refs' },
    tooltips: {
      review: {
        on: 'LLM Review flags candidates that do not meet the minimum source count. Insufficient evidence lowers confidence.',
        off: 'LLM Review does not enforce minimum source requirements. Single-source values are accepted.',
      },
    },
  },
  'evidence.conflict_policy': {
    navigation: { section: 'Evidence Requirements', key: 'Conflict Policy' },
    tooltips: {
      review: {
        on: 'LLM Review applies the configured conflict resolution policy when multiple candidates disagree.',
        off: 'LLM Review defaults to tier-based resolution without the configured policy override.',
      },
    },
  },

  // ── Search ────────────────────────────────────────────────────────────
  'search_hints.domain_hints': {
    navigation: { section: 'Search Hints', key: 'Domain Hints' },
    tooltips: {},
  },
  'search_hints.query_terms': {
    navigation: { section: 'Search Hints', key: 'Query Terms' },
    tooltips: {},
  },
  // ── Constraints ───────────────────────────────────────────────────────
  constraints: {
    navigation: { section: 'Cross-Field Constraints', key: 'Constraints' },
    tooltips: {
      review: {
        on: 'LLM Review enforces constraint rules during candidate scoring. Constraint violations lower confidence and may block acceptance.',
        off: 'LLM Review ignores cross-field constraints. Contradictory values across fields are not flagged.',
      },
    },
  },

  // ── Component / Deps ──────────────────────────────────────────────────
  'component.type': {

    navigation: { section: 'Components', key: 'Component Type' },
    tooltips: {
      seed: {
        on: 'Seed Pipeline creates component identity records and links for this component type in SpecDb. Products are linked to their components.',
        off: 'Seed Pipeline skips component identity creation. No component links are established in the database.',
      },
      review: {
        on: 'LLM Review validates component identity candidates against the known component database. Fuzzy matching and alias resolution are applied.',
        off: 'LLM Review skips component identity validation. Component names are accepted as raw text without matching.',
      },
    },
  },
  aliases: {
    navigation: { section: 'Extraction Hints & Aliases', key: 'Aliases' },
    tooltips: {},
  },

  // ── Tooltip / UI ──────────────────────────────────────────────────────
  'ui.tooltip_md': {
    navigation: { section: 'Extraction Hints & Aliases', key: 'Tooltip Markdown' },
    tooltips: {},
  },
};

// WHY: IDX tooltips auto-derived from idxBadgeRegistry.js (SSOT).
// Adding a new IDX badge = one entry in idxBadgeRegistry.js. No manual edits here.
for (const entry of IDX_BADGE_REGISTRY as ReadonlyArray<{ path: string; section?: string; key?: string; on: string; off: string }>) {
  if (!FIELD_CONSUMER_REGISTRY[entry.path]) {
    FIELD_CONSUMER_REGISTRY[entry.path] = { tooltips: {} };
  }
  if (!FIELD_CONSUMER_REGISTRY[entry.path].tooltips) {
    FIELD_CONSUMER_REGISTRY[entry.path].tooltips = {};
  }
  FIELD_CONSUMER_REGISTRY[entry.path].tooltips.indexlab = { on: entry.on, off: entry.off };
  if (entry.section && entry.key && !FIELD_CONSUMER_REGISTRY[entry.path].navigation) {
    FIELD_CONSUMER_REGISTRY[entry.path].navigation = { section: entry.section, key: entry.key };
  }
}

// ── Derived exports ─────────────────────────────────────────────────────

// WHY: SSOT — field-to-system mapping comes from backend consumerGate.js.
export const FIELD_SYSTEM_MAP: Record<string, SystemSet> = BACKEND_FIELD_SYSTEM_MAP as Record<string, SystemSet>;

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

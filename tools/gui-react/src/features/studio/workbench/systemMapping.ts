// ── System Consumer Mapping ──────────────────────────────────────────
// All badge data derived from the unified consumerBadgeRegistry.js (SSOT).
// Adding a new badge = one entry in consumerBadgeRegistry.js. Zero edits here.

import { FIELD_SYSTEM_MAP as BACKEND_FIELD_SYSTEM_MAP } from '../../../../../../src/field-rules/consumerGate.js';
import {
  CONSUMER_BADGE_REGISTRY,
  PARENT_GROUPS,
  FIELD_PARENT_MAP,
  FIELD_CONSUMER_MAP,
  NAVIGATION_MAP,
} from '../../../../../../src/field-rules/consumerBadgeRegistry.js';

// WHY: DownstreamSystem kept for EnumConfigurator backward compat (uses 'review' strings).
export type DownstreamSystem = 'indexlab' | 'seed' | 'review';

export type ParentGroup = 'idx' | 'eng' | 'rev' | 'seed' | 'comp';

// ── Badge configs (5 parent groups, all read-only) ───────────────────

export const PARENT_BADGE_CONFIGS: Record<ParentGroup, {
  label: string;
  title: string;
  cls: string;
}> = {
  idx: {
    label: 'IDX',
    title: 'Indexing Lab',
    cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  },
  eng: {
    label: 'ENG',
    title: 'Field Rules Engine',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  rev: {
    label: 'REV',
    title: 'LLM Review',
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  },
  seed: {
    label: 'SEED',
    title: 'Seed Pipeline',
    cls: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
  },
  comp: {
    label: 'COMP',
    title: 'Component System',
    cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  },
};

// WHY: Legacy badge configs kept for EnumConfigurator / StaticBadges backward compat.
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

// ── Derived maps (from unified registry) ─────────────────────────────

// WHY: SSOT — field-to-system mapping owned by backend consumerGate.js.
export const FIELD_SYSTEM_MAP: Record<string, DownstreamSystem[]> = BACKEND_FIELD_SYSTEM_MAP as Record<string, DownstreamSystem[]>;

// WHY: parent groups per path — drives badge chip rendering.
export const FIELD_PARENT_GROUP_MAP: Record<string, ParentGroup[]> = FIELD_PARENT_MAP as Record<string, ParentGroup[]>;

// WHY: consumer detail per path — drives tooltip content.
export const CONSUMER_DETAIL_MAP: Record<string, Record<string, { desc: string }>> = FIELD_CONSUMER_MAP as Record<string, Record<string, { desc: string }>>;

// WHY: navigation breadcrumbs per path.
export const KEY_NAVIGATION_PATHS: Record<string, { section: string; key: string }> = NAVIGATION_MAP as Record<string, { section: string; key: string }>;

// WHY: Legacy CONSUMER_TOOLTIPS derived for EnumConfigurator backward compat.
// Maps path → system → { on, off } using the old format.
type ConsumerTip = { on: string; off: string };
export const CONSUMER_TOOLTIPS: Record<string, Partial<Record<DownstreamSystem, ConsumerTip>>> = (() => {
  const tips: Record<string, Partial<Record<DownstreamSystem, ConsumerTip>>> = {};
  const parentToLegacy: Record<string, DownstreamSystem | null> = {
    idx: 'indexlab', eng: null, rev: 'review', seed: 'seed', comp: null,
  };
  for (const entry of CONSUMER_BADGE_REGISTRY as ReadonlyArray<{ path: string; consumers: Record<string, { desc: string }> }>) {
    const pathTips: Partial<Record<DownstreamSystem, ConsumerTip>> = {};
    for (const [consumerKey, { desc }] of Object.entries(entry.consumers)) {
      const parent = consumerKey.split('.')[0];
      const legacySystem = parentToLegacy[parent];
      if (legacySystem && !pathTips[legacySystem]) {
        pathTips[legacySystem] = { on: desc, off: `${consumerKey} does not read this path. No effect on this consumer.` };
      }
    }
    if (Object.keys(pathTips).length > 0) {
      tips[entry.path] = pathTips;
    }
  }
  return tips;
})();

// ── Public helpers ──────────────────────────────────────────────────────

export function getFieldSystems(fieldPath: string): DownstreamSystem[] {
  return FIELD_SYSTEM_MAP[fieldPath] || [];
}

export function getFieldParentGroups(fieldPath: string): ParentGroup[] {
  return FIELD_PARENT_GROUP_MAP[fieldPath] || [];
}

// WHY: Kept for EnumConfigurator backward compat — it reads rule.consumers overrides.
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

// ── Badge tooltip formatters ─────────────────────────────────────────

function keyNavigationLine(fieldPath: string): string {
  const path = KEY_NAVIGATION_PATHS[fieldPath];
  if (!path) return '';
  return `Key Navigation > ${path.section} > ${path.key}`;
}

export function formatBadgeTooltip(
  fieldPath: string,
  parentGroup: ParentGroup,
): string {
  const cfg = PARENT_BADGE_CONFIGS[parentGroup];
  if (!cfg) return fieldPath;

  const consumers = CONSUMER_DETAIL_MAP[fieldPath];
  if (!consumers) return cfg.title;

  const subConsumers = Object.entries(consumers)
    .filter(([key]) => key.startsWith(`${parentGroup}.`))
    .map(([key, { desc }]) => `${key}: ${desc}`);

  if (subConsumers.length === 0) return cfg.title;

  const keyNav = keyNavigationLine(fieldPath);

  return [
    cfg.title,
    ...(keyNav ? [keyNav] : []),
    '',
    ...subConsumers,
  ].join('\n');
}

// WHY: Legacy formatters kept for EnumConfigurator backward compat and
// any remaining StaticBadges consumers that use the old DownstreamSystem format.

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
    ...(keyNav ? [`This feature is enabled in ${keyNav}.`] : []),
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
    ...(keyNav ? [`This feature is enabled in ${keyNav}.`, ''] : []),
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

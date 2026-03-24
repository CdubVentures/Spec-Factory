// WHY: O(1) tier registry — single source for tier metadata.
// Adding a new tier = 1 entry in TIER_REGISTRY. All maps derived.

import type { PrefetchSearchProfileQueryRow } from '../types.ts';

export type TierKey = 'seed' | 'group' | 'key';

interface TierEntry {
  readonly key: TierKey;
  readonly label: string;
  readonly chipClass: string;
  readonly tierFieldValues: readonly string[];
  readonly hintSourceValues: readonly string[];
}

export const TIER_REGISTRY: readonly TierEntry[] = Object.freeze([
  { key: 'seed',      label: 'Seed',      chipClass: 'sf-chip-accent',  tierFieldValues: ['seed'],         hintSourceValues: ['tier1_seed'] },
  { key: 'group',     label: 'Group',     chipClass: 'sf-chip-warning', tierFieldValues: ['group_search'], hintSourceValues: ['tier2_group'] },
  { key: 'key',       label: 'Key',       chipClass: 'sf-chip-info',    tierFieldValues: ['key_search'],   hintSourceValues: ['tier3_key'] },
]);

// WHY: Derived maps — O(1) addition, zero manual sync.
export const TIER_MAP: Record<string, TierKey> = Object.fromEntries(
  TIER_REGISTRY.flatMap(e => e.tierFieldValues.map(v => [v, e.key]))
) as Record<string, TierKey>;

export const HINT_SOURCE_TIER_MAP: Record<string, TierKey> = Object.fromEntries(
  TIER_REGISTRY.flatMap(e => e.hintSourceValues.map(v => [v, e.key]))
) as Record<string, TierKey>;

const TIER_LABELS: Record<TierKey, string> = Object.fromEntries(
  TIER_REGISTRY.map(e => [e.key, e.label])
) as Record<TierKey, string>;

const TIER_CHIP_CLASSES: Record<TierKey, string> = Object.fromEntries(
  TIER_REGISTRY.map(e => [e.key, e.chipClass])
) as Record<TierKey, string>;

export function classifyQueryTier(row: PrefetchSearchProfileQueryRow): TierKey {
  const tier = String(row.tier ?? '').trim();
  if (tier && TIER_MAP[tier]) return TIER_MAP[tier];
  const hint = String(row.hint_source ?? '').trim();
  if (hint && HINT_SOURCE_TIER_MAP[hint]) return HINT_SOURCE_TIER_MAP[hint];
  return 'key';
}

export function tierLabel(tier: string): string {
  return TIER_LABELS[tier as TierKey] ?? 'Key';
}

export function tierChipClass(tier: string): string {
  return TIER_CHIP_CLASSES[tier as TierKey] ?? 'sf-chip-neutral';
}

export function groupByTier(rows: PrefetchSearchProfileQueryRow[]): Record<TierKey, PrefetchSearchProfileQueryRow[]> {
  const result: Record<TierKey, PrefetchSearchProfileQueryRow[]> = { seed: [], group: [], key: [] };
  for (const row of rows) {
    result[classifyQueryTier(row)].push(row);
  }
  return result;
}

interface TierSlot { count: number; pct: number }
interface TierBudgetSummary { seed: TierSlot; group: TierSlot; key: TierSlot; total: number; cap: number }

export function buildTierBudgetSummary(rows: PrefetchSearchProfileQueryRow[], cap: number): TierBudgetSummary {
  const grouped = groupByTier(rows);
  const total = rows.length;
  const pct = (n: number) => total > 0 ? (n / total) * 100 : 0;
  return {
    seed: { count: grouped.seed.length, pct: pct(grouped.seed.length) },
    group: { count: grouped.group.length, pct: pct(grouped.group.length) },
    key: { count: grouped.key.length, pct: pct(grouped.key.length) },
    total,
    cap,
  };
}

const ENRICHMENT_LABELS: Record<number, string> = {
  0: 'bare search',
  1: '+aliases',
  2: '+domain hint',
};

export function enrichmentStrategyLabel(row: PrefetchSearchProfileQueryRow): string {
  const tier = classifyQueryTier(row);
  if (tier !== 'key') return '';
  const repeat = typeof row.repeat_count === 'number' ? row.repeat_count : 0;
  return ENRICHMENT_LABELS[repeat] ?? '+content type';
}

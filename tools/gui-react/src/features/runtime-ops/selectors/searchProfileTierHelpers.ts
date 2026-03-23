// WHY: Pure display-logic helpers for tier-aware Search Profile panel.
// Tier classification is SSOT — classifyQueryTier is the single source.

import type { PrefetchSearchProfileQueryRow } from '../types';

type TierKey = 'seed' | 'group' | 'key' | 'legacy';

const TIER_MAP: Record<string, TierKey> = {
  seed: 'seed',
  group_search: 'group',
  key_search: 'key',
};

const HINT_SOURCE_TIER_MAP: Record<string, TierKey> = {
  tier1_seed: 'seed',
  tier2_group: 'group',
  tier3_key: 'key',
};

const TIER_LABELS: Record<TierKey, string> = {
  seed: 'Seed',
  group: 'Group',
  key: 'Key',
  legacy: 'Legacy',
};

const TIER_CHIP_CLASSES: Record<TierKey, string> = {
  seed: 'sf-chip-accent',
  group: 'sf-chip-warning',
  key: 'sf-chip-info',
  legacy: 'sf-chip-neutral',
};

export function classifyQueryTier(row: PrefetchSearchProfileQueryRow): TierKey {
  const tier = String(row.tier ?? '').trim();
  if (tier && TIER_MAP[tier]) return TIER_MAP[tier];
  const hint = String(row.hint_source ?? '').trim();
  if (hint && HINT_SOURCE_TIER_MAP[hint]) return HINT_SOURCE_TIER_MAP[hint];
  return 'legacy';
}

export function tierLabel(tier: string): string {
  return TIER_LABELS[tier as TierKey] ?? 'Legacy';
}

export function tierChipClass(tier: string): string {
  return TIER_CHIP_CLASSES[tier as TierKey] ?? 'sf-chip-neutral';
}

export function groupByTier(rows: PrefetchSearchProfileQueryRow[]): Record<TierKey, PrefetchSearchProfileQueryRow[]> {
  const result: Record<TierKey, PrefetchSearchProfileQueryRow[]> = { seed: [], group: [], key: [], legacy: [] };
  for (const row of rows) {
    result[classifyQueryTier(row)].push(row);
  }
  return result;
}

interface TierSlot { count: number; pct: number }
interface TierBudgetSummary { seed: TierSlot; group: TierSlot; key: TierSlot; legacy: TierSlot; total: number; cap: number }

export function buildTierBudgetSummary(rows: PrefetchSearchProfileQueryRow[], cap: number): TierBudgetSummary {
  const grouped = groupByTier(rows);
  const total = rows.length;
  const pct = (n: number) => total > 0 ? (n / total) * 100 : 0;
  return {
    seed: { count: grouped.seed.length, pct: pct(grouped.seed.length) },
    group: { count: grouped.group.length, pct: pct(grouped.group.length) },
    key: { count: grouped.key.length, pct: pct(grouped.key.length) },
    legacy: { count: grouped.legacy.length, pct: pct(grouped.legacy.length) },
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

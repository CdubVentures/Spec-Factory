import { resolveBillingCallType } from './billingCallTypeRegistry.ts';
import type { BillingGroupedItem, PivotedDailyRow, DonutSlice, HorizontalBarItem } from './billingTypes.ts';

/**
 * Pivot flat `[{day, reason, cost_usd}]` into `[{day, reason1: cost, reason2: cost, ...}]`
 * for recharts stacked BarChart.
 */
export function pivotDailyByReason(
  byDayReason: ReadonlyArray<{ day: string; reason: string; calls: number; cost_usd: number }>,
): PivotedDailyRow[] {
  if (byDayReason.length === 0) return [];

  const map = new Map<string, Record<string, number | string>>();

  for (const row of byDayReason) {
    let entry = map.get(row.day);
    if (!entry) {
      entry = { day: row.day };
      map.set(row.day, entry);
    }
    entry[row.reason] = row.cost_usd;
  }

  return Array.from(map.values())
    .sort((a, b) => (a.day as string).localeCompare(b.day as string)) as PivotedDailyRow[];
}

/** Derive average cost per LLM call. */
export function computeAvgPerCall(totalCost: number, totalCalls: number): number {
  return totalCalls === 0 ? 0 : totalCost / totalCalls;
}

/** Convert reasons array into donut slices with labels, colors, and percentages. */
export function computeDonutSlices(reasons: ReadonlyArray<BillingGroupedItem>): DonutSlice[] {
  const nonZero = reasons.filter((r) => r.cost_usd > 0);
  if (nonZero.length === 0) return [];

  const total = nonZero.reduce((sum, r) => sum + r.cost_usd, 0);

  return nonZero.map((r) => {
    const entry = resolveBillingCallType(r.key);
    return {
      reason: r.key,
      label: entry.label,
      color: entry.color,
      cost_usd: r.cost_usd,
      pct: (r.cost_usd / total) * 100,
    };
  });
}

/** Normalize grouped items for horizontal bar width (largest = 100%). */
export function computeHorizontalBars(items: ReadonlyArray<BillingGroupedItem>): HorizontalBarItem[] {
  if (items.length === 0) return [];

  const maxCost = Math.max(...items.map((i) => i.cost_usd));

  return items.map((item) => ({
    key: item.key,
    cost_usd: item.cost_usd,
    calls: item.calls,
    pctOfMax: maxCost > 0 ? (item.cost_usd / maxCost) * 100 : 0,
  }));
}

/** Extract hex fallback from `var(--token, #hex)` for recharts SVG fills. */
export function chartColor(varStr: string): string {
  const match = varStr.match(/#[0-9a-fA-F]{6}/);
  return match ? match[0] : varStr;
}

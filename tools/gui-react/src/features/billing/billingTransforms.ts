import { resolveBillingCallType, BILLING_CALL_TYPE_REGISTRY } from './billingCallTypeRegistry.generated.ts';
import type {
  BillingGroupedItem,
  PivotedDailyRow,
  DonutSlice,
  HorizontalBarItem,
  BillingSummaryResponse,
  BillingByModelResponse,
  BillingByReasonResponse,
  BillingByCategoryResponse,
  BillingTrendDelta,
  BillingPeriodDeltas,
  FilterChipCounts,
  TokenSegments,
} from './billingTypes.ts';

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

/** Convert reasons array into donut slices with labels, colors, and percentages.
 *  Sorted by registry order (grouped by feature, light → dark). */
export function computeDonutSlices(reasons: ReadonlyArray<BillingGroupedItem>): DonutSlice[] {
  const nonZero = reasons.filter((r) => r.cost_usd > 0);
  if (nonZero.length === 0) return [];

  const total = nonZero.reduce((sum, r) => sum + r.cost_usd, 0);

  // WHY: Sort slices by registry order so the pie wedges group by feature
  const reasonMap = new Map(nonZero.map((r) => [r.key, r]));
  const registryOrder = BILLING_CALL_TYPE_REGISTRY
    .filter((e) => reasonMap.has(e.reason))
    .map((e) => e.reason);
  // Append any unknown reasons at the end
  for (const r of nonZero) {
    if (!registryOrder.includes(r.key)) registryOrder.push(r.key);
  }

  return registryOrder.map((key) => {
    const r = reasonMap.get(key)!;
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

// WHY: "flat" threshold matches conventional dashboards — tiny wobble <0.5% isn't
// a meaningful signal and should read as stable.
const DELTA_FLAT_THRESHOLD_PCT = 0.5;

function deltaFrom(current: number, prior: number): BillingTrendDelta {
  if (!Number.isFinite(current) || !Number.isFinite(prior)) {
    return { pct: 0, direction: 'flat' };
  }
  if (prior === 0) {
    if (current === 0) return { pct: 0, direction: 'flat' };
    return { pct: 100, direction: 'up' };
  }
  const pct = ((current - prior) / prior) * 100;
  if (Math.abs(pct) < DELTA_FLAT_THRESHOLD_PCT) return { pct: 0, direction: 'flat' };
  return { pct, direction: pct > 0 ? 'up' : 'down' };
}

/** Build period-over-period deltas for hero-band trend badges. */
export function computePeriodDeltas(
  current: BillingSummaryResponse | null | undefined,
  prior: BillingSummaryResponse | null | undefined,
): BillingPeriodDeltas {
  const c = current?.totals ?? { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
  const p = prior?.totals ?? { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
  return {
    cost_usd: deltaFrom(c.cost_usd, p.cost_usd),
    calls: deltaFrom(c.calls, p.calls),
    prompt_tokens: deltaFrom(c.prompt_tokens, p.prompt_tokens),
    completion_tokens: deltaFrom(c.completion_tokens, p.completion_tokens),
  };
}

/** Derive per-chip call counts for the filter bar from already-fetched
 *  unfiltered aggregations — no new API call required. */
export function computeFilterChipCounts(
  byModel: BillingByModelResponse | null | undefined,
  byReason: BillingByReasonResponse | null | undefined,
  byCategory: BillingByCategoryResponse | null | undefined,
): FilterChipCounts {
  const toMap = (items: ReadonlyArray<BillingGroupedItem> | undefined): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const item of items ?? []) out[item.key] = item.calls;
    return out;
  };
  return {
    model: toMap(byModel?.models),
    reason: toMap(byReason?.reasons),
    category: toMap(byCategory?.categories),
  };
}

/** Split a grouped item's token volume into prompt / usage / completion / cached
 *  percentages.
 *
 *  Ledger convention:
 *    - `cached_prompt_tokens` is a subset of `prompt_tokens` (cache hits from provider).
 *    - `sent_tokens` is a subset of the billable-prompt (what Spec Factory transmitted).
 *    - Remaining billable-prompt (billable - sent) = tool-loop / reasoning overhead.
 *
 *  When `sent_tokens` is undefined or 0, `usagePct` is 0 and `promptPct` gets the
 *  full billable-prompt share (matches pre-capture ledger rows).
 */
export function computeTokenSegments(item: {
  prompt_tokens: number;
  completion_tokens: number;
  cached_prompt_tokens?: number;
  sent_tokens?: number;
}): TokenSegments {
  const prompt = Math.max(0, item.prompt_tokens || 0);
  const completion = Math.max(0, item.completion_tokens || 0);
  const cached = Math.max(0, item.cached_prompt_tokens || 0);
  const sent = Math.max(0, item.sent_tokens || 0);
  const billablePrompt = Math.max(0, prompt - cached);
  const total = billablePrompt + completion + cached;
  if (total === 0) {
    return { promptPct: 0, usagePct: 0, completionPct: 0, cachedPct: 0 };
  }
  // Clamp sent to billable-prompt ceiling so usage can never go negative
  // (protects against stale estimates or historical rows where sent > billable).
  const sentShare = Math.min(sent, billablePrompt);
  const usageShare = Math.max(0, billablePrompt - sentShare);
  // When no sent_tokens captured (sent === 0), collapse usage into prompt
  // so backward-compatible rendering matches pre-capture rows exactly.
  const effectivePromptShare = sent > 0 ? sentShare : billablePrompt;
  const effectiveUsageShare = sent > 0 ? usageShare : 0;
  return {
    promptPct: (effectivePromptShare / total) * 100,
    usagePct: (effectiveUsageShare / total) * 100,
    completionPct: (completion / total) * 100,
    cachedPct: (cached / total) * 100,
  };
}

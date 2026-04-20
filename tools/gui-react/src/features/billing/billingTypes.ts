// ── API response shapes (verified from backend route handlers) ──

export interface BillingSummaryResponse {
  month: string;
  totals: {
    calls: number;
    cost_usd: number;
    prompt_tokens: number;
    completion_tokens: number;
    cached_prompt_tokens: number;
    sent_tokens: number;
  };
  models_used: number;
  categories_used: number;
}

export interface BillingDailyResponse {
  days: Array<{
    day: string;
    calls: number;
    cost_usd: number;
    prompt_tokens: number;
    completion_tokens: number;
    cached_prompt_tokens: number;
    sent_tokens: number;
  }>;
  by_day_reason: Array<{
    day: string;
    reason: string;
    calls: number;
    cost_usd: number;
  }>;
}

export interface BillingGroupedItem {
  key: string;
  cost_usd: number;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  sent_tokens: number;
}

export interface BillingByModelResponse {
  month: string;
  models: BillingGroupedItem[];
}

export interface BillingByReasonResponse {
  month: string;
  reasons: BillingGroupedItem[];
}

export interface BillingByCategoryResponse {
  month: string;
  categories: BillingGroupedItem[];
}

export interface BillingEntry {
  id: number;
  ts: string;
  month: string;
  day: string;
  provider: string;
  model: string;
  category: string;
  product_id: string;
  run_id: string;
  round: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_prompt_tokens: number;
  sent_tokens: number;
  total_tokens: number;
  cost_usd: number;
  reason: string;
  host: string;
  url_count: number;
  evidence_chars: number;
  estimated_usage: boolean;
  meta: string;
}

export interface BillingEntriesResponse {
  entries: BillingEntry[];
  total: number;
  limit: number;
  offset: number;
}

// ── Derived types for charts ──

export interface PivotedDailyRow {
  day: string;
  [reasonKey: string]: number | string;
}

export interface DonutSlice {
  reason: string;
  label: string;
  color: string;
  cost_usd: number;
  pct: number;
}

export interface HorizontalBarItem {
  key: string;
  cost_usd: number;
  calls: number;
  pctOfMax: number;
}

export interface BillingFilterState {
  category: string;
  reason: string;
  model: string;
  access: string;  // '' | 'lab' | 'api'
}

// ── Derived types for hero band + filter counts + token segments ──

export type TrendDirection = 'up' | 'down' | 'flat';

export interface BillingTrendDelta {
  pct: number;
  direction: TrendDirection;
}

export interface BillingPeriodDeltas {
  cost_usd: BillingTrendDelta;
  calls: BillingTrendDelta;
  prompt_tokens: BillingTrendDelta;
  completion_tokens: BillingTrendDelta;
}

export interface FilterChipCounts {
  model: Record<string, number>;
  reason: Record<string, number>;
  category: Record<string, number>;
}

export interface TokenSegments {
  promptPct: number;
  usagePct: number;
  completionPct: number;
  cachedPct: number;
}

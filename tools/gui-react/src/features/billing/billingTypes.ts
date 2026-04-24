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

export type BillingProviderKind = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'xai' | 'generic';
export type BillingModelPricingSource = 'llm_lab' | 'provider_registry' | 'usage';

export interface BillingModelCostUsage {
  calls: number;
  cost_usd: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_prompt_tokens: number;
  sent_tokens: number;
}

export interface BillingModelCostRow {
  model: string;
  provider: string;
  provider_label: string;
  provider_kind: BillingProviderKind;
  role: string;
  access_modes: string[];
  pricing_source: BillingModelPricingSource;
  registry_provider_id: string | null;
  registry_provider_label: string | null;
  input_per_1m: number;
  output_per_1m: number;
  cached_input_per_1m: number;
  max_context_tokens: number | null;
  max_output_tokens: number | null;
  current: BillingModelCostUsage;
}

export interface BillingModelCostProvider {
  id: string;
  label: string;
  kind: BillingProviderKind;
  model_count: number;
  used_model_count: number;
  current_cost_usd: number;
  highest_output_per_1m: number;
  models: BillingModelCostRow[];
}

export interface BillingModelCostsResponse {
  month: string;
  pricing_meta: {
    as_of: string | null;
    sources: Record<string, string>;
  };
  totals: {
    providers: number;
    models: number;
    used_models: number;
    current_cost_usd: number;
    highest_output_per_1m: number;
  };
  providers: BillingModelCostProvider[];
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

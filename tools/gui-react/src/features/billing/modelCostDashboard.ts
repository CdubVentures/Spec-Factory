import type {
  BillingModelCostProvider,
  BillingModelCostRow,
  BillingModelCostsResponse,
  BillingProviderKind,
} from './billingTypes.ts';

export interface ProviderDisplay {
  id: string;
  kind: BillingProviderKind;
  label: string;
}

export interface ModelCostDashboardRow extends BillingModelCostRow {
  priceIntensityPct: number;
}

export interface ModelCostProviderCard extends BillingModelCostProvider {
  spendSharePct: number;
}

export interface ModelCostDashboard {
  providerCards: ModelCostProviderCard[];
  modelRows: ModelCostDashboardRow[];
  usedRows: ModelCostDashboardRow[];
  sourceCount: number;
}

export interface ModelCostFilterState {
  provider: string;
  usedOnly: boolean;
}

export type ModelCostSortKey =
  | 'model'
  | 'provider_label'
  | 'input_per_1m'
  | 'output_per_1m'
  | 'cached_input_per_1m'
  | 'current_cost_usd'
  | 'calls';

export type ModelCostSortDirection = 'asc' | 'desc';

export interface ModelCostSortState {
  key: ModelCostSortKey;
  direction: ModelCostSortDirection;
}

export type ModelCostComparisonMetric =
  | 'combined_rates'
  | 'input_per_1m'
  | 'output_per_1m'
  | 'cached_input_per_1m'
  | 'current_cost_usd';

export interface ModelCostComparisonOptions {
  metric: ModelCostComparisonMetric;
  limit?: number;
}

export interface ModelCostComparisonBar {
  model: string;
  provider: string;
  providerLabel: string;
  providerKind: BillingProviderKind;
  value: number;
  valuePct: number;
  bucketClass: string;
  inputBucketClass: string;
  outputBucketClass: string;
  cachedBucketClass: string;
  row: ModelCostDashboardRow;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, Math.max(0, value));
}

function normalizeProviderToken(provider: string): string {
  return String(provider || '').trim().toLowerCase();
}

export function resolveProviderDisplay(provider: string, label: string): ProviderDisplay {
  const token = normalizeProviderToken(provider);
  const displayLabel = String(label || '').trim();
  if (token.includes('openai') || token === 'oai') {
    return { id: token || 'openai', kind: 'openai', label: displayLabel || 'OpenAI' };
  }
  if (token.includes('anthropic') || token.includes('claude')) {
    return { id: token || 'anthropic', kind: 'anthropic', label: displayLabel || 'Anthropic' };
  }
  if (token.includes('gemini') || token.includes('google')) {
    return { id: token || 'google', kind: 'google', label: displayLabel || 'Google' };
  }
  if (token.includes('deepseek')) {
    return { id: token || 'deepseek', kind: 'deepseek', label: displayLabel || 'DeepSeek' };
  }
  if (token.includes('xai') || token.includes('grok')) {
    return { id: token || 'xai', kind: 'xai', label: displayLabel || 'xAI' };
  }
  return { id: token || 'generic', kind: 'generic', label: displayLabel || 'Other' };
}

export function buildModelCostDashboard(response: BillingModelCostsResponse | undefined): ModelCostDashboard {
  if (!response) {
    return { providerCards: [], modelRows: [], usedRows: [], sourceCount: 0 };
  }

  const highestOutput = Math.max(0, response.totals.highest_output_per_1m || 0);
  const totalSpend = Math.max(0, response.totals.current_cost_usd || 0);
  const providerCards = response.providers.map((provider) => ({
    ...provider,
    spendSharePct: totalSpend > 0 ? clampPct((provider.current_cost_usd / totalSpend) * 100) : 0,
  }));
  const modelRows = response.providers
    .flatMap((provider) => provider.models.map((row) => ({
      ...row,
      priceIntensityPct: highestOutput > 0 ? clampPct((row.output_per_1m / highestOutput) * 100) : 0,
    })))
    .filter((row) => row.model.trim().length > 0)
    .sort((a, b) => b.current.cost_usd - a.current.cost_usd || b.output_per_1m - a.output_per_1m || a.model.localeCompare(b.model));

  return {
    providerCards,
    modelRows,
    usedRows: modelRows.filter((row) => row.current.calls > 0),
    sourceCount: Object.keys(response.pricing_meta.sources || {}).length,
  };
}

export function filterModelCostRows(
  rows: readonly ModelCostDashboardRow[],
  filter: ModelCostFilterState,
): ModelCostDashboardRow[] {
  return rows.filter((row) => {
    if (filter.provider !== 'all' && row.provider !== filter.provider && row.provider_kind !== filter.provider) {
      return false;
    }
    if (filter.usedOnly && row.current.calls <= 0) {
      return false;
    }
    return true;
  });
}

function sortValue(row: ModelCostDashboardRow, key: ModelCostSortKey): string | number {
  if (key === 'model') return row.model;
  if (key === 'provider_label') return row.provider_label;
  if (key === 'current_cost_usd') return row.current.cost_usd;
  if (key === 'calls') return row.current.calls;
  return row[key];
}

export function sortModelCostRows(
  rows: readonly ModelCostDashboardRow[],
  sort: ModelCostSortState,
): ModelCostDashboardRow[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    if (typeof av === 'string' || typeof bv === 'string') {
      const compared = String(av).localeCompare(String(bv));
      return compared === 0 ? a.model.localeCompare(b.model) : compared * direction;
    }
    const compared = av - bv;
    return compared === 0 ? a.model.localeCompare(b.model) : compared * direction;
  });
}

function metricValue(row: ModelCostDashboardRow, metric: ModelCostComparisonMetric): number {
  if (metric === 'combined_rates') return row.input_per_1m + row.output_per_1m;
  if (metric === 'current_cost_usd') return row.current.cost_usd;
  return row[metric];
}

function heightBucketClass(valuePct: number): string {
  const bucket = Math.max(0, Math.min(100, Math.round(valuePct / 5) * 5));
  return `sf-h-${bucket}`;
}

export function buildModelCostComparisonBars(
  rows: readonly ModelCostDashboardRow[],
  options: ModelCostComparisonOptions,
): ModelCostComparisonBar[] {
  const limit = Math.max(1, Math.min(48, Math.floor(options.limit ?? 28)));
  const ranked = [...rows]
    .sort((a, b) => {
      const compared = metricValue(b, options.metric) - metricValue(a, options.metric);
      return compared === 0 ? a.model.localeCompare(b.model) : compared;
    })
    .slice(0, limit);
  const max = Math.max(0, ...ranked.map((row) => metricValue(row, options.metric)));
  return ranked.map((row) => {
    const value = metricValue(row, options.metric);
    const valuePct = max > 0 ? clampPct((value / max) * 100) : 0;
    const combinedTotal = Math.max(0, row.input_per_1m + row.output_per_1m);
    return {
      model: row.model,
      provider: row.provider,
      providerLabel: row.provider_label,
      providerKind: row.provider_kind,
      value,
      valuePct,
      bucketClass: heightBucketClass(valuePct),
      inputBucketClass: heightBucketClass(combinedTotal > 0 ? (row.input_per_1m / combinedTotal) * 100 : 0),
      outputBucketClass: heightBucketClass(combinedTotal > 0 ? (row.output_per_1m / combinedTotal) * 100 : 0),
      cachedBucketClass: heightBucketClass(combinedTotal > 0 ? (row.cached_input_per_1m / combinedTotal) * 100 : 0),
      row,
    };
  });
}

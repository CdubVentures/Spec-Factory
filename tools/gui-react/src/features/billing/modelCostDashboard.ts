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
  provider_group_id: string;
  source_provider_ids: string[];
  source_provider_labels: string[];
}

export interface ModelCostProviderCard extends BillingModelCostProvider {
  spendSharePct: number;
  models: ModelCostDashboardRow[];
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
  sortBy?: ModelCostComparisonMetric;
  direction?: ModelCostSortDirection;
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

export interface ModelCostProviderRowGroup {
  id: string;
  label: string;
  kind: BillingProviderKind;
  rows: ModelCostDashboardRow[];
}

export interface ModelCostProviderBarGroup {
  id: string;
  label: string;
  kind: BillingProviderKind;
  bars: ModelCostComparisonBar[];
}

const LAB_LABEL_PREFIX_RE = /^llm\s+lab\s+/i;

function stripLabPrefix(label: string): string {
  return String(label || '').replace(LAB_LABEL_PREFIX_RE, '').trim() || String(label || '').trim();
}

const API_LABEL_SUFFIX_RE = /\s+api$/i;

function clampPct(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, Math.max(0, value));
}

export function formatModelCostRate(value: number): string {
  const fixed = value.toFixed(value >= 10 ? 0 : 3);
  return `$${fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed}`;
}

function normalizeProviderToken(provider: string): string {
  return String(provider || '').trim().toLowerCase();
}

function normalizeModelKey(model: string): string {
  return String(model || '').trim().toLowerCase();
}

function normalizeProviderLabel(label: string): string {
  return stripLabPrefix(String(label || '').replace(API_LABEL_SUFFIX_RE, '').trim());
}

function canonicalProviderFamilyLabel(kind: BillingProviderKind, label: string): string {
  if (kind === 'openai') return 'OpenAI';
  if (kind === 'anthropic') return 'Anthropic';
  if (kind === 'google') return 'Google';
  if (kind === 'deepseek') return 'DeepSeek';
  if (kind === 'xai') return 'xAI';
  const normalizedLabel = normalizeProviderLabel(label);
  return normalizedLabel || label;
}

function providerGroupId(kind: BillingProviderKind, label: string): string {
  return `${kind}:${normalizeProviderToken(label) || 'provider'}`;
}

function mergeUniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function rowPricingRank(row: BillingModelCostRow): number {
  if (row.access_modes.includes('api') && row.pricing_source === 'provider_registry') return 4;
  if (row.access_modes.includes('api')) return 3;
  if (row.pricing_source === 'llm_lab') return 2;
  if (row.pricing_source === 'provider_registry') return 1;
  return 0;
}

function pickCanonicalPriceRow(rows: readonly BillingModelCostRow[]): BillingModelCostRow {
  return [...rows].sort((a, b) => {
    const ranked = rowPricingRank(b) - rowPricingRank(a);
    if (ranked !== 0) return ranked;
    return b.output_per_1m - a.output_per_1m || b.input_per_1m - a.input_per_1m || a.provider.localeCompare(b.provider);
  })[0];
}

function sumCurrentUsage(rows: readonly BillingModelCostRow[]): BillingModelCostRow['current'] {
  return rows.reduce<BillingModelCostRow['current']>(
    (total, row) => ({
      calls: total.calls + row.current.calls,
      cost_usd: total.cost_usd + row.current.cost_usd,
      prompt_tokens: total.prompt_tokens + row.current.prompt_tokens,
      completion_tokens: total.completion_tokens + row.current.completion_tokens,
      cached_prompt_tokens: total.cached_prompt_tokens + row.current.cached_prompt_tokens,
      sent_tokens: total.sent_tokens + row.current.sent_tokens,
    }),
    { calls: 0, cost_usd: 0, prompt_tokens: 0, completion_tokens: 0, cached_prompt_tokens: 0, sent_tokens: 0 },
  );
}

function mergeDuplicateModelRows(rows: readonly BillingModelCostRow[]): ModelCostDashboardRow[] {
  const groups = new Map<string, BillingModelCostRow[]>();
  for (const row of rows) {
    if (row.model.trim().length === 0) continue;
    const key = `${row.provider_kind}:${normalizeModelKey(row.model)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.values()).map((groupRows) => {
    const canonical = pickCanonicalPriceRow(groupRows);
    const accessModes = mergeUniqueStrings(groupRows.flatMap((row) => row.access_modes));
    const sourceProviderIds = mergeUniqueStrings(groupRows.map((row) => row.provider));
    const sourceProviderLabels = mergeUniqueStrings(groupRows.map((row) => row.provider_label));
    const displayLabel = canonicalProviderFamilyLabel(canonical.provider_kind, canonical.provider_label);
    const providerGroupLabel = displayLabel || canonical.provider_label;
    return {
      ...canonical,
      provider_label: providerGroupLabel,
      provider_group_id: providerGroupId(canonical.provider_kind, providerGroupLabel),
      access_modes: accessModes,
      source_provider_ids: sourceProviderIds,
      source_provider_labels: sourceProviderLabels,
      max_context_tokens: Math.max(0, ...groupRows.map((row) => row.max_context_tokens ?? 0)) || canonical.max_context_tokens,
      max_output_tokens: Math.max(0, ...groupRows.map((row) => row.max_output_tokens ?? 0)) || canonical.max_output_tokens,
      current: sumCurrentUsage(groupRows),
      priceIntensityPct: 0,
    };
  });
}

function buildProviderCardsFromRows(
  rows: readonly ModelCostDashboardRow[],
  totalSpend: number,
): ModelCostProviderCard[] {
  const groups = new Map<string, ModelCostProviderCard>();
  for (const row of rows) {
    const group = groups.get(row.provider_group_id);
    if (group) {
      group.models.push(row);
      group.model_count += 1;
      group.used_model_count += row.current.calls > 0 ? 1 : 0;
      group.current_cost_usd += row.current.cost_usd;
      group.highest_output_per_1m = Math.max(group.highest_output_per_1m, row.output_per_1m);
    } else {
      groups.set(row.provider_group_id, {
        id: row.provider_group_id,
        label: row.provider_label,
        kind: row.provider_kind,
        model_count: 1,
        used_model_count: row.current.calls > 0 ? 1 : 0,
        current_cost_usd: row.current.cost_usd,
        highest_output_per_1m: row.output_per_1m,
        models: [row],
        spendSharePct: 0,
      });
    }
  }
  return Array.from(groups.values())
    .map((provider) => ({
      ...provider,
      spendSharePct: totalSpend > 0 ? clampPct((provider.current_cost_usd / totalSpend) * 100) : 0,
    }))
    .sort((a, b) => b.current_cost_usd - a.current_cost_usd || b.highest_output_per_1m - a.highest_output_per_1m || a.label.localeCompare(b.label));
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

  const totalSpend = Math.max(0, response.totals.current_cost_usd || 0);
  const mergedRows = mergeDuplicateModelRows(response.providers.flatMap((provider) => provider.models));
  const highestOutput = Math.max(0, ...mergedRows.map((row) => row.output_per_1m));
  const modelRows = mergedRows
    .map((row) => ({
      ...row,
      priceIntensityPct: highestOutput > 0 ? clampPct((row.output_per_1m / highestOutput) * 100) : 0,
    }))
    .sort((a, b) => b.current.cost_usd - a.current.cost_usd || b.output_per_1m - a.output_per_1m || a.model.localeCompare(b.model));
  const providerCards = buildProviderCardsFromRows(modelRows, totalSpend);

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
    if (
      filter.provider !== 'all'
      && row.provider_group_id !== filter.provider
      && row.provider !== filter.provider
      && row.provider_kind !== filter.provider
      && !row.source_provider_ids.includes(filter.provider)
    ) {
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

export function groupModelCostRowsByProvider(rows: readonly ModelCostDashboardRow[]): ModelCostProviderRowGroup[] {
  const groups = new Map<string, ModelCostProviderRowGroup>();
  for (const row of rows) {
    const label = normalizeProviderLabel(row.provider_label) || row.provider_label || row.provider;
    const id = row.provider_group_id || providerGroupId(row.provider_kind, label);
    const group = groups.get(id);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(id, { id, label, kind: row.provider_kind, rows: [row] });
    }
  }
  return Array.from(groups.values());
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
  const sortBy = options.sortBy ?? options.metric;
  const sign = options.direction === 'asc' ? 1 : -1;
  const ranked = [...rows]
    .sort((a, b) => {
      const compared = (metricValue(a, sortBy) - metricValue(b, sortBy)) * sign;
      return compared === 0 ? a.model.localeCompare(b.model) : compared;
    })
    .slice(0, limit);
  const max = Math.max(0, ...ranked.map((row) => metricValue(row, options.metric)));
  const maxInput = Math.max(0, ...ranked.map((row) => row.input_per_1m));
  const maxOutput = Math.max(0, ...ranked.map((row) => row.output_per_1m));
  const maxCached = Math.max(0, ...ranked.map((row) => row.cached_input_per_1m));
  const combinedAxisMax = options.metric === 'combined_rates'
    ? Math.max(maxInput, maxOutput, maxCached)
    : 0;
  return ranked.map((row) => {
    const value = metricValue(row, options.metric);
    const valuePct = max > 0 ? clampPct((value / max) * 100) : 0;
    const inputMax = combinedAxisMax > 0 ? combinedAxisMax : maxInput;
    const outputMax = combinedAxisMax > 0 ? combinedAxisMax : maxOutput;
    const cachedMax = combinedAxisMax > 0 ? combinedAxisMax : maxCached;
    return {
      model: row.model,
      provider: row.provider,
      providerLabel: row.provider_label,
      providerKind: row.provider_kind,
      value,
      valuePct,
      bucketClass: heightBucketClass(valuePct),
      inputBucketClass: heightBucketClass(inputMax > 0 ? (row.input_per_1m / inputMax) * 100 : 0),
      outputBucketClass: heightBucketClass(outputMax > 0 ? (row.output_per_1m / outputMax) * 100 : 0),
      cachedBucketClass: heightBucketClass(cachedMax > 0 ? (row.cached_input_per_1m / cachedMax) * 100 : 0),
      row,
    };
  });
}

export function groupModelCostComparisonBarsByProvider(
  bars: readonly ModelCostComparisonBar[],
): ModelCostProviderBarGroup[] {
  const groups = new Map<string, ModelCostProviderBarGroup>();
  for (const bar of bars) {
    const label = normalizeProviderLabel(bar.providerLabel) || bar.providerLabel || bar.provider;
    const id = providerGroupId(bar.providerKind, label);
    const group = groups.get(id);
    if (group) {
      group.bars.push(bar);
    } else {
      groups.set(id, { id, label, kind: bar.providerKind, bars: [bar] });
    }
  }
  return Array.from(groups.values());
}

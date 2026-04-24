import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LlmProviderIcon } from '../../../shared/ui/icons/LlmProviderIcon.tsx';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { CloseIcon } from '../../../shared/ui/filterBar/icons.tsx';
import { compactNumber, usd } from '../../../utils/formatting.ts';
import {
  buildModelCostComparisonBars,
  buildModelCostDashboard,
  filterModelCostRows,
  sortModelCostRows,
  type ModelCostComparisonBar,
  type ModelCostComparisonMetric,
  type ModelCostDashboardRow,
  type ModelCostSortKey,
  type ModelCostSortState,
} from '../modelCostDashboard.ts';
import type { BillingModelCostsResponse } from '../billingTypes.ts';

interface BillingModelCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: BillingModelCostsResponse | undefined;
  isLoading: boolean;
  isStale?: boolean;
}

const FILTER_ALL = 'all';
const DEFAULT_SORT: ModelCostSortState = { key: 'output_per_1m', direction: 'desc' };

const COMPARISON_TABS: Array<{ metric: ModelCostComparisonMetric; label: string }> = [
  { metric: 'combined_rates', label: 'Combined' },
  { metric: 'output_per_1m', label: 'Output' },
  { metric: 'input_per_1m', label: 'Input' },
  { metric: 'cached_input_per_1m', label: 'Cached' },
  { metric: 'current_cost_usd', label: 'Spend' },
];

function formatRate(value: number): string {
  return `$${value.toFixed(value >= 10 ? 0 : 3).replace(/\.?0+$/, '')}`;
}

function formatTokens(value: number | null): string {
  if (value == null || value <= 0) return '--';
  return compactNumber(value);
}

function sourceLabel(row: ModelCostDashboardRow): string {
  if (row.pricing_source === 'llm_lab') return row.registry_provider_label || 'LLM Lab';
  if (row.pricing_source === 'provider_registry') return row.registry_provider_label || 'Provider registry';
  if (row.pricing_source === 'usage') return 'Usage only';
  return 'Provider registry';
}

function SourcePill({ label, href }: { label: string; href: string }) {
  return (
    <a className="sf-model-cost-source-pill" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function formatComparisonValue(metric: ModelCostComparisonMetric, value: number): string {
  if (metric === 'current_cost_usd') return usd(value, 4);
  return formatRate(value);
}

function metricLabel(metric: ModelCostComparisonMetric): string {
  if (metric === 'combined_rates') return 'Input + output';
  return COMPARISON_TABS.find((tab) => tab.metric === metric)?.label || 'Output';
}

function nextSortState(current: ModelCostSortState, key: ModelCostSortKey): ModelCostSortState {
  if (current.key !== key) return { key, direction: key === 'model' ? 'asc' : 'desc' };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

function SortHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  sortKey: ModelCostSortKey;
  activeSort: ModelCostSortState;
  onSort: (key: ModelCostSortKey) => void;
}) {
  const active = activeSort.key === sortKey;
  const direction = activeSort.direction === 'asc' ? 'up' : 'down';
  return (
    <button
      type="button"
      className={`sf-model-cost-sort-button${active ? ' is-active' : ''}`}
      onClick={() => onSort(sortKey)}
      aria-label={`Sort model costs by ${label}`}
    >
      <span>{label}</span>
      <span aria-hidden="true">{active ? direction : 'sort'}</span>
    </button>
  );
}

function ModelCostComparisonChart({
  bars,
  metric,
}: {
  bars: ModelCostComparisonBar[];
  metric: ModelCostComparisonMetric;
}) {
  const hasValues = bars.some((bar) => bar.value > 0);
  return (
    <div className="sf-model-cost-chart-panel">
      <div className="sf-model-cost-chart-head">
        <div>
          <span className="sf-model-cost-eyebrow">Visual comparison</span>
          <strong>{metricLabel(metric)} cost ranking</strong>
        </div>
        <span>{bars.length} models</span>
      </div>
      {hasValues ? (
        <div className="sf-model-cost-chart" aria-label={`${metricLabel(metric)} cost comparison`}>
          <div className="sf-model-cost-chart-grid" aria-hidden="true" />
          {bars.map((bar) => (
            <div className="sf-model-cost-chart-item" key={`${bar.provider}-${bar.model}`}>
              <div className="sf-model-cost-chart-stage">
                {metric === 'combined_rates' ? (
                  <>
                    <span className="sf-model-cost-chart-values is-combined">
                      <span className="is-input">{formatRate(bar.row.input_per_1m)}</span>
                      <span className="is-output">{formatRate(bar.row.output_per_1m)}</span>
                    </span>
                    <span className={`sf-model-cost-chart-combined ${bar.bucketClass}`}>
                      <span className={`sf-model-cost-chart-bar sf-model-cost-chart-mini is-input ${bar.inputBucketClass}`} />
                      <span className={`sf-model-cost-chart-bar sf-model-cost-chart-mini is-output ${bar.outputBucketClass}`} />
                    </span>
                  </>
                ) : (
                  <>
                    <span className="sf-model-cost-chart-values">{formatComparisonValue(metric, bar.value)}</span>
                    <span className={`sf-model-cost-chart-bar ${bar.bucketClass}`} />
                  </>
                )}
              </div>
              <div className="sf-model-cost-chart-label">
                <span className="sf-model-cost-chart-logo">
                  <LlmProviderIcon provider={bar.providerKind} size={14} />
                </span>
                <span>{bar.model}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sf-model-cost-empty">No non-zero values for this comparison.</div>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  active,
  onClick,
}: {
  provider: ReturnType<typeof buildModelCostDashboard>['providerCards'][number];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`sf-model-cost-provider-card sf-model-cost-provider-${provider.kind}${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <span className="sf-model-cost-provider-logo">
        <LlmProviderIcon provider={provider.kind} size={20} />
      </span>
      <span className="sf-model-cost-provider-main">
        <span className="sf-model-cost-provider-name">
          <strong>{provider.label}</strong>
          <span>{usd(provider.current_cost_usd, 2)}</span>
        </span>
        <span className="sf-model-cost-provider-meta">
          {provider.model_count} models / {provider.used_model_count} used
        </span>
        <span className="sf-model-cost-provider-stat">
          <span>{provider.spendSharePct.toFixed(0)}% of view spend</span>
        </span>
      </span>
    </button>
  );
}

function ModelRow({ row }: { row: ModelCostDashboardRow }) {
  const source = sourceLabel(row);
  const limits = [
    row.max_context_tokens ? `Context ${formatTokens(row.max_context_tokens)}` : '',
    row.max_output_tokens ? `Max output ${formatTokens(row.max_output_tokens)}` : '',
  ].filter(Boolean).join(' / ');
  const usage = row.current.calls > 0
    ? `${compactNumber(row.current.calls)} calls / ${usd(row.current.cost_usd, 4)} in this view`
    : '';
  return (
    <tr className={row.current.calls > 0 ? 'sf-model-cost-row is-used' : 'sf-model-cost-row'}>
      <td>
        <div className="sf-model-cost-model-cell">
          <span className="sf-model-cost-provider-logo is-small">
            <LlmProviderIcon provider={row.provider_kind} size={14} />
          </span>
          <div className="sf-model-cost-model-name">
            <strong>{row.model}</strong>
            <span>
              {row.provider_label} / {row.role}
              {row.access_modes.includes('lab') ? ' / Lab' : ''}
            </span>
            <span className="sf-model-cost-source-badges">
              <b>{source}</b>
              {row.access_modes.includes('lab') && row.pricing_source !== 'llm_lab' ? <b>LLM Lab access</b> : null}
            </span>
            {limits ? <span className="sf-model-cost-model-meta">{limits}</span> : null}
            {usage ? <span className="sf-model-cost-model-usage">{usage}</span> : null}
          </div>
        </div>
      </td>
      <td className="sf-model-cost-rate">{formatRate(row.input_per_1m)}</td>
      <td className="sf-model-cost-rate is-output">{formatRate(row.output_per_1m)}</td>
      <td className="sf-model-cost-rate is-cache">{formatRate(row.cached_input_per_1m)}</td>
    </tr>
  );
}

export function BillingModelCostDialog({
  open,
  onOpenChange,
  data,
  isLoading,
  isStale,
}: BillingModelCostDialogProps) {
  const [providerFilter, setProviderFilter] = useState(FILTER_ALL);
  const [usedOnly, setUsedOnly] = useState(false);
  const [comparisonMetric, setComparisonMetric] = useState<ModelCostComparisonMetric>('combined_rates');
  const [sort, setSort] = useState<ModelCostSortState>(DEFAULT_SORT);
  const dashboard = useMemo(() => buildModelCostDashboard(data), [data]);
  const rows = useMemo(
    () => filterModelCostRows(dashboard.modelRows, { provider: providerFilter, usedOnly }),
    [dashboard.modelRows, providerFilter, usedOnly],
  );
  const sortedRows = useMemo(() => sortModelCostRows(rows, sort), [rows, sort]);
  const comparisonBars = useMemo(
    () => buildModelCostComparisonBars(rows, { metric: comparisonMetric, limit: 28 }),
    [comparisonMetric, rows],
  );
  const staleClass = isStale ? ' sf-stale-refetch' : '';
  const handleSort = (key: ModelCostSortKey) => setSort((current) => nextSortState(current, key));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sf-model-cost-overlay" />
        <Dialog.Content className={`sf-model-cost-dialog${staleClass}`}>
          <Dialog.Close className="sf-model-cost-close" aria-label="Close model cost catalog">
            <CloseIcon className="sf-model-cost-close-icon" />
          </Dialog.Close>
          <div className="sf-model-cost-scroll">
            <div className="sf-model-cost-hero">
              <div className="sf-model-cost-title-block">
                <p className="sf-model-cost-eyebrow">Current provider rates</p>
                <Dialog.Title className="sf-model-cost-title">Model Cost Catalog</Dialog.Title>
                <Dialog.Description className="sf-model-cost-description">
                  Current unit prices by provider, merged with this Billing view's usage.
                </Dialog.Description>
                <div className="sf-model-cost-sources">
                  <span>Pricing as of {data?.pricing_meta.as_of || '--'}</span>
                  {Object.entries(data?.pricing_meta.sources || {}).map(([key, href]) => (
                    <SourcePill key={key} label={key} href={href} />
                  ))}
                </div>
              </div>
              <div className="sf-model-cost-kpis">
                <div className="sf-model-cost-kpi">
                  <span>Models</span>
                  <strong>{compactNumber(data?.totals.models ?? 0)}</strong>
                </div>
                <div className="sf-model-cost-kpi">
                  <span>Used</span>
                  <strong>{compactNumber(data?.totals.used_models ?? 0)}</strong>
                </div>
                <div className="sf-model-cost-kpi">
                  <span>View Spend</span>
                  <strong>{usd(data?.totals.current_cost_usd ?? 0, 2)}</strong>
                </div>
                <div className="sf-model-cost-kpi">
                  <span>Peak Output</span>
                  <strong>{formatRate(data?.totals.highest_output_per_1m ?? 0)}</strong>
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="sf-model-cost-loading">
                <SkeletonBlock className="sf-skel-card" />
                <SkeletonBlock className="sf-skel-card" />
                <SkeletonBlock className="sf-skel-card" />
              </div>
            ) : (
              <>
                <div className="sf-model-cost-provider-grid">
                  <button
                    type="button"
                    className={`sf-model-cost-provider-card sf-model-cost-provider-all${providerFilter === FILTER_ALL ? ' is-active' : ''}`}
                    onClick={() => setProviderFilter(FILTER_ALL)}
                  >
                    <span className="sf-model-cost-provider-logo">ALL</span>
                    <span className="sf-model-cost-provider-main">
                      <span className="sf-model-cost-provider-name">
                        <strong>All Providers</strong>
                        <span>{usd(data?.totals.current_cost_usd ?? 0, 2)}</span>
                      </span>
                      <span className="sf-model-cost-provider-meta">{dashboard.modelRows.length} catalog rows</span>
                      <span className="sf-model-cost-provider-stat">Current view</span>
                    </span>
                  </button>
                  {dashboard.providerCards.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      active={providerFilter === provider.id}
                      onClick={() => setProviderFilter(provider.id)}
                    />
                  ))}
                </div>

                <div className="sf-model-cost-toolbar">
                  <div className="sf-model-cost-tabs">
                    <button
                      type="button"
                      className={!usedOnly ? 'is-active' : ''}
                      onClick={() => setUsedOnly(false)}
                    >
                      All models
                    </button>
                    <button
                      type="button"
                      className={usedOnly ? 'is-active' : ''}
                      onClick={() => setUsedOnly(true)}
                    >
                      Used in view
                    </button>
                  </div>
                  <div className="sf-model-cost-tabs sf-model-cost-metric-tabs" aria-label="Cost comparison metric">
                    {COMPARISON_TABS.map((tab) => (
                      <button
                        key={tab.metric}
                        type="button"
                        className={comparisonMetric === tab.metric ? 'is-active' : ''}
                        onClick={() => setComparisonMetric(tab.metric)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="sf-model-cost-legend">
                    <span><i className="sf-model-cost-dot input" />Input</span>
                    <span><i className="sf-model-cost-dot output" />Output</span>
                    <span><i className="sf-model-cost-dot cache" />Cached</span>
                  </div>
                </div>

                <ModelCostComparisonChart bars={comparisonBars} metric={comparisonMetric} />

                <div className="sf-model-cost-table-wrap">
                  <table className="sf-model-cost-table">
                    <colgroup>
                      <col className="sf-model-cost-col-model" />
                      <col className="sf-model-cost-col-rate" />
                      <col className="sf-model-cost-col-rate" />
                      <col className="sf-model-cost-col-rate" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>
                          <SortHeader label="Model" sortKey="model" activeSort={sort} onSort={handleSort} />
                        </th>
                        <th>
                          <SortHeader label="Input / 1M" sortKey="input_per_1m" activeSort={sort} onSort={handleSort} />
                        </th>
                        <th>
                          <SortHeader label="Output / 1M" sortKey="output_per_1m" activeSort={sort} onSort={handleSort} />
                        </th>
                        <th>
                          <SortHeader label="Cached / 1M" sortKey="cached_input_per_1m" activeSort={sort} onSort={handleSort} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row) => <ModelRow key={`${row.provider}-${row.model}`} row={row} />)}
                    </tbody>
                  </table>
                  {rows.length === 0 ? (
                    <div className="sf-model-cost-empty">No models match the current cost filters.</div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LlmProviderIcon } from '../../../shared/ui/icons/LlmProviderIcon.tsx';
import { CloseIcon } from '../../../shared/ui/filterBar/icons.tsx';
import { compactNumber, usd } from '../../../utils/formatting.ts';
import { useFormatDateYMD } from '../../../utils/dateTime.ts';
import {
  buildModelCostComparisonBars,
  buildModelCostDashboard,
  filterModelCostRows,
  formatModelCostRate,
  groupModelCostComparisonBarsByProvider,
  groupModelCostRowsByProvider,
  sortModelCostRows,
  type ModelCostComparisonBar,
  type ModelCostComparisonMetric,
  type ModelCostDashboardRow,
  type ModelCostSortDirection,
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

type CombinedSortAxis = 'combined_rates' | 'input_per_1m' | 'output_per_1m';

const COMBINED_SORT_AXES: Array<{ value: CombinedSortAxis; label: string }> = [
  { value: 'combined_rates', label: 'Combined' },
  { value: 'input_per_1m', label: 'Input' },
  { value: 'output_per_1m', label: 'Output' },
];

function formatTokens(value: number | null): string {
  if (value == null || value <= 0) return '--';
  return compactNumber(value);
}

function SourcePill({ label, href }: { label: string; href: string }) {
  return (
    <a className="sf-model-cost-source-pill" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

// WHY: Mirrors the loaded model-cost dialog body layout — provider grid +
// toolbar + chart panel + sortable table. Each section uses the real CSS
// chrome (sf-model-cost-provider-card, sf-model-cost-toolbar, etc.) with
// shimmer backing so dimensions match what hydrates. Replaces the previous
// 3-card placeholder that referenced an undefined `sf-skel-card` class
// (rendered as bare 12px shimmer slivers).
function ModelCostDialogLoadingSkeleton() {
  return (
    <div className="sf-model-cost-loading" aria-busy="true">
      <div className="sf-model-cost-provider-grid">
        {Array.from({ length: 6 }, (_value, index) => (
          <span
            key={`provider-skel-${index}`}
            className="sf-model-cost-provider-card sf-shimmer"
            aria-hidden="true"
          >&nbsp;</span>
        ))}
      </div>
      <div className="sf-model-cost-toolbar">
        <div className="sf-model-cost-toolbar-left">
          <span
            className="sf-model-cost-tabs sf-shimmer"
            style={{ height: '30px', width: '180px' }}
            aria-hidden="true"
          />
        </div>
        <span
          className="sf-model-cost-tabs sf-model-cost-metric-tabs sf-shimmer"
          style={{ height: '30px', width: '320px' }}
          aria-hidden="true"
        />
      </div>
      <span
        className="sf-shimmer block rounded-lg"
        style={{ height: '220px', width: '100%' }}
        aria-hidden="true"
      />
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
              <th>Model</th>
              <th>Input / 1M</th>
              <th>Output / 1M</th>
              <th>Cached / 1M</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }, (_value, index) => (
              <tr key={`row-skel-${index}`} className="sf-model-cost-row">
                <td>
                  <div className="sf-model-cost-model-cell">
                    <span className="sf-model-cost-provider-logo is-small sf-shimmer" aria-hidden="true">&nbsp;</span>
                    <div className="sf-model-cost-model-name flex-1 min-w-0 space-y-1">
                      <span className="sf-shimmer block h-[12px] w-full rounded-sm" aria-hidden="true" />
                      <span className="sf-shimmer block h-[10px] w-3/4 rounded-sm" aria-hidden="true" />
                    </div>
                  </div>
                </td>
                <td className="sf-model-cost-rate">
                  <span className="sf-shimmer inline-block h-[11px] w-12 rounded-sm" aria-hidden="true" />
                </td>
                <td className="sf-model-cost-rate is-output">
                  <span className="sf-shimmer inline-block h-[11px] w-12 rounded-sm" aria-hidden="true" />
                </td>
                <td className="sf-model-cost-rate is-cache">
                  <span className="sf-shimmer inline-block h-[11px] w-12 rounded-sm" aria-hidden="true" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatComparisonValue(metric: ModelCostComparisonMetric, value: number): string {
  if (metric === 'current_cost_usd') return usd(value, 4);
  return formatModelCostRate(value);
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
  const glyph = active ? (activeSort.direction === 'asc' ? '\u2191' : '\u2193') : '\u2195';
  return (
    <button
      type="button"
      className={`sf-model-cost-sort-button${active ? ' is-active' : ''}`}
      onClick={() => onSort(sortKey)}
      aria-label={`Sort model costs by ${label}`}
      aria-sort={active ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="sf-model-cost-sort-indicator">{glyph}</span>
    </button>
  );
}

function ModelCostComparisonChart({
  bars,
  metric,
  sortAxis,
  sortDirection,
  onSortAxisChange,
  onSortDirectionToggle,
  groupByProvider,
}: {
  bars: ModelCostComparisonBar[];
  metric: ModelCostComparisonMetric;
  sortAxis: CombinedSortAxis;
  sortDirection: ModelCostSortDirection;
  onSortAxisChange: (axis: CombinedSortAxis) => void;
  onSortDirectionToggle: () => void;
  groupByProvider: boolean;
}) {
  const hasValues = bars.some((bar) => bar.value > 0);
  const showSortControl = metric === 'combined_rates';
  const directionGlyph = sortDirection === 'asc' ? '\u2191' : '\u2193';
  const directionLabel = sortDirection === 'asc' ? 'Low to high' : 'High to low';
  const groupedBars = groupByProvider ? groupModelCostComparisonBarsByProvider(bars) : [];
  const renderBar = (bar: ModelCostComparisonBar) => (
    <div className="sf-model-cost-chart-item" key={`${bar.provider}-${bar.model}`}>
      <div className="sf-model-cost-chart-stage">
        {metric === 'combined_rates' ? (
          <span className={`sf-model-cost-chart-combined ${bar.bucketClass}`}>
            <span className={`sf-model-cost-chart-bar sf-model-cost-chart-mini is-input ${bar.inputBucketClass}`}>
              <span className="sf-model-cost-chart-bar-value">{formatModelCostRate(bar.row.input_per_1m)}</span>
            </span>
            <span className={`sf-model-cost-chart-bar sf-model-cost-chart-mini is-output ${bar.outputBucketClass}`}>
              <span className="sf-model-cost-chart-bar-value">{formatModelCostRate(bar.row.output_per_1m)}</span>
            </span>
          </span>
        ) : (
          <span className={`sf-model-cost-chart-bar ${bar.bucketClass}`}>
            <span className="sf-model-cost-chart-bar-value">{formatComparisonValue(metric, bar.value)}</span>
          </span>
        )}
      </div>
      <div className="sf-model-cost-chart-label">
        <span className="sf-model-cost-chart-logo">
          <LlmProviderIcon provider={bar.providerKind} size={14} />
        </span>
        <span className="sf-model-cost-chart-model-name">{bar.model}</span>
      </div>
    </div>
  );
  return (
    <div className="sf-model-cost-chart-panel">
      <div className="sf-model-cost-chart-head">
        <div>
          <span className="sf-model-cost-eyebrow">Visual comparison</span>
          <strong>{metricLabel(metric)} cost ranking</strong>
        </div>
        <div className="sf-model-cost-chart-head-right">
          {showSortControl ? (
            <div className="sf-model-cost-chart-sort" role="group" aria-label="Sort combined bars by axis">
              <span className="sf-model-cost-chart-sort-label">Sort by</span>
              <div className="sf-model-cost-tabs sf-model-cost-axis-tabs">
                {COMBINED_SORT_AXES.map((axis) => (
                  <button
                    key={axis.value}
                    type="button"
                    className={sortAxis === axis.value ? 'is-active' : ''}
                    onClick={() => onSortAxisChange(axis.value)}
                  >
                    {axis.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="sf-model-cost-chart-direction"
                onClick={onSortDirectionToggle}
                aria-label={`Toggle sort direction (currently ${directionLabel})`}
                title={directionLabel}
              >
                <span aria-hidden="true">{directionGlyph}</span>
              </button>
            </div>
          ) : null}
          <span className="sf-model-cost-chart-count">{bars.length} models</span>
        </div>
      </div>
      {hasValues ? (
        <div className="sf-model-cost-chart" aria-label={`${metricLabel(metric)} cost comparison`}>
          <div className="sf-model-cost-chart-grid" aria-hidden="true" />
          {groupByProvider
            ? groupedBars.map((group) => (
              <div className="sf-model-cost-chart-group" key={group.id}>
                <div className="sf-model-cost-chart-group-head">
                  <span className="sf-model-cost-provider-logo is-small">
                    <LlmProviderIcon provider={group.kind} size={14} />
                  </span>
                  <strong>{group.label}</strong>
                  <span className="sf-model-cost-chart-group-count">{group.bars.length}</span>
                </div>
                <div className="sf-model-cost-chart-group-body">
                  {group.bars.map((bar) => renderBar(bar))}
                </div>
              </div>
            ))
            : bars.map((bar) => renderBar(bar))}
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
          <span>{provider.model_count} models / {provider.used_model_count} used</span>
        </span>
        <span className="sf-model-cost-provider-stat">
          <span>{provider.spendSharePct.toFixed(0)}% of view spend</span>
        </span>
      </span>
    </button>
  );
}

function ModelRow({ row }: { row: ModelCostDashboardRow }) {
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
            <span>{row.provider_label} / {row.role}</span>
            {limits ? <span className="sf-model-cost-model-meta">{limits}</span> : null}
            {usage ? <span className="sf-model-cost-model-usage">{usage}</span> : null}
          </div>
        </div>
      </td>
      <td className="sf-model-cost-rate">{formatModelCostRate(row.input_per_1m)}</td>
      <td className="sf-model-cost-rate is-output">{formatModelCostRate(row.output_per_1m)}</td>
      <td className="sf-model-cost-rate is-cache">{formatModelCostRate(row.cached_input_per_1m)}</td>
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
  const [groupByProvider, setGroupByProvider] = useState(false);
  const [comparisonMetric, setComparisonMetric] = useState<ModelCostComparisonMetric>('combined_rates');
  const [combinedSortAxis, setCombinedSortAxis] = useState<CombinedSortAxis>('combined_rates');
  const [combinedSortDirection, setCombinedSortDirection] = useState<ModelCostSortDirection>('desc');
  const [sort, setSort] = useState<ModelCostSortState>(DEFAULT_SORT);
  const dashboard = useMemo(() => buildModelCostDashboard(data), [data]);
  const rows = useMemo(
    () => filterModelCostRows(dashboard.modelRows, { provider: providerFilter, usedOnly }),
    [dashboard.modelRows, providerFilter, usedOnly],
  );
  const sortedRows = useMemo(() => sortModelCostRows(rows, sort), [rows, sort]);
  const comparisonBars = useMemo(
    () => buildModelCostComparisonBars(rows, {
      metric: comparisonMetric,
      limit: 28,
      sortBy: comparisonMetric === 'combined_rates' ? combinedSortAxis : comparisonMetric,
      direction: comparisonMetric === 'combined_rates' ? combinedSortDirection : 'desc',
    }),
    [comparisonMetric, combinedSortAxis, combinedSortDirection, rows],
  );
  const groupedRows = useMemo(() => {
    if (!groupByProvider) return null;
    return groupModelCostRowsByProvider(sortedRows);
  }, [groupByProvider, sortedRows]);
  const formatPricingDate = useFormatDateYMD();
  const staleClass = isStale ? ' sf-stale-refetch' : '';
  const handleSort = (key: ModelCostSortKey) => setSort((current) => nextSortState(current, key));
  const handleChartDirectionToggle = () =>
    setCombinedSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));

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
                  <span>Pricing as of {formatPricingDate(data?.pricing_meta.as_of) || '--'}</span>
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
                  <strong>{formatModelCostRate(data?.totals.highest_output_per_1m ?? 0)}</strong>
                </div>
              </div>
            </div>

            {isLoading ? (
              <ModelCostDialogLoadingSkeleton />
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
                  <div className="sf-model-cost-toolbar-left">
                    <div className="sf-model-cost-tabs" role="group" aria-label="Usage scope">
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
                    <label className="sf-model-cost-group-toggle">
                      <input
                        type="checkbox"
                        checked={groupByProvider}
                        onChange={(event) => setGroupByProvider(event.target.checked)}
                      />
                      <span>Group by provider</span>
                    </label>
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

                <ModelCostComparisonChart
                  bars={comparisonBars}
                  metric={comparisonMetric}
                  sortAxis={combinedSortAxis}
                  sortDirection={combinedSortDirection}
                  onSortAxisChange={setCombinedSortAxis}
                  onSortDirectionToggle={handleChartDirectionToggle}
                  groupByProvider={groupByProvider}
                />

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
                    {groupedRows ? (
                      groupedRows.map((group) => (
                        <tbody key={group.id} className="sf-model-cost-group">
                          <tr className="sf-model-cost-group-head">
                            <td colSpan={4}>
                              <span className="sf-model-cost-provider-logo is-small">
                                <LlmProviderIcon provider={group.kind} size={14} />
                              </span>
                              <strong>{group.label}</strong>
                              <span>{group.rows.length} models</span>
                            </td>
                          </tr>
                          {group.rows.map((row) => (
                            <ModelRow key={`${row.provider}-${row.model}`} row={row} />
                          ))}
                        </tbody>
                      ))
                    ) : (
                      <tbody>
                        {sortedRows.map((row) => <ModelRow key={`${row.provider}-${row.model}`} row={row} />)}
                      </tbody>
                    )}
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

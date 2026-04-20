import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import { chartColor } from '../billingTransforms.ts';
import { resolveBillingCallType, BILLING_CALL_TYPE_REGISTRY } from '../billingCallTypeRegistry.generated.ts';
import type { BillingByReasonResponse, BillingGroupedItem } from '../billingTypes.ts';

export type DonutMetric = 'cost' | 'tokens';

interface BillingMetricDonutProps {
  data: BillingByReasonResponse | undefined;
  isLoading: boolean;
  isStale?: boolean;
  metric: DonutMetric;
  // WHY: Caller supplies the authoritative total so the center reading matches
  // the hero band (rollup totals, not sum of slices — handles filtered views).
  totalValue: number;
}

interface MetricSlice {
  reason: string;
  label: string;
  color: string;
  value: number;
  pct: number;
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: MetricSlice }>;
  metric: DonutMetric;
}

function sliceValue(item: BillingGroupedItem, metric: DonutMetric): number {
  return metric === 'tokens'
    ? (item.prompt_tokens || 0) + (item.completion_tokens || 0)
    : item.cost_usd;
}

function formatValue(value: number, metric: DonutMetric): string {
  return metric === 'tokens' ? compactNumber(value) : usd(value, 4);
}

function formatTotal(value: number, metric: DonutMetric): string {
  return metric === 'tokens' ? compactNumber(value) : usd(value, 2);
}

// WHY: Build slices keyed off the billing registry so wedge order matches
// the donut in the other metric — same feature-domain ordering.
function computeMetricSlices(
  reasons: ReadonlyArray<BillingGroupedItem>,
  metric: DonutMetric,
): MetricSlice[] {
  const withValue = reasons
    .map((r) => ({ r, value: sliceValue(r, metric) }))
    .filter((x) => x.value > 0);
  if (withValue.length === 0) return [];

  const total = withValue.reduce((sum, x) => sum + x.value, 0);
  const map = new Map(withValue.map((x) => [x.r.key, x] as const));
  const ordered = BILLING_CALL_TYPE_REGISTRY
    .filter((e) => map.has(e.reason))
    .map((e) => e.reason);
  for (const x of withValue) {
    if (!ordered.includes(x.r.key)) ordered.push(x.r.key);
  }

  return ordered.map((key) => {
    const { r, value } = map.get(key)!;
    const entry = resolveBillingCallType(r.key);
    return {
      reason: r.key,
      label: entry.label,
      color: entry.color,
      value,
      pct: (value / total) * 100,
    };
  });
}

function DonutTooltip({ active, payload, metric }: DonutTooltipProps) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="sf-chart-tooltip">
      <div className="sf-chart-tooltip-row">
        <span className="sf-chart-tooltip-label">
          <span className="sf-filter-dot" style={{ background: chartColor(slice.color) }} />
          {slice.label}
        </span>
      </div>
      <div className="sf-chart-tooltip-row" style={{ paddingTop: 4 }}>
        <span className="sf-chart-tooltip-label">{metric === 'tokens' ? 'Tokens' : 'Cost'}</span>
        <span className="sf-chart-tooltip-value">{formatValue(slice.value, metric)}</span>
      </div>
      <div className="sf-chart-tooltip-row">
        <span className="sf-chart-tooltip-label">Share</span>
        <span className="sf-chart-tooltip-value">{slice.pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function BillingMetricDonut({ data, isLoading, isStale, metric, totalValue }: BillingMetricDonutProps) {
  const slices = useMemo(() => computeMetricSlices(data?.reasons ?? [], metric), [data, metric]);

  const hasData = !isLoading && slices.length > 0;
  const staleClass = isStale ? ' sf-stale-refetch' : '';
  const title = metric === 'tokens' ? 'Tokens by Call Type' : 'Cost by Call Type';
  const subtitle = metric === 'tokens'
    ? `Share of ${compactNumber(totalValue)} total`
    : `Share of ${usd(totalValue, 2)} total`;
  const centerLabel = metric === 'tokens' ? 'Tokens' : 'Cost';

  return (
    <div className={`sf-surface-card rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart${metric === 'tokens' ? ' sf-tok-themed' : ''}`}>
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">{title}</h3>
        <div className="text-[11px] sf-text-subtle mt-0.5">{subtitle}</div>
      </div>
      <div className={`p-5 flex-1 flex flex-col items-center justify-center gap-3${staleClass}`}>
        {isLoading && (
          <>
            <SkeletonBlock className="sf-skel-donut" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonBlock key={i} className="sf-skel-bar-label" />
              ))}
            </div>
          </>
        )}
        {!isLoading && slices.length === 0 && (
          <p className="sf-text-subtle text-sm text-center py-8">No data</p>
        )}
        {hasData && (
          <div className="sf-fade-in flex flex-col items-center gap-3 w-full">
            <div className="relative" style={{ zIndex: 0 }}>
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={1}
                  >
                    {slices.map((s) => (
                      <Cell key={s.reason} fill={chartColor(s.color)} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip metric={metric} />} wrapperStyle={{ zIndex: 50 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                <span className="text-lg font-bold font-mono">{formatTotal(totalValue, metric)}</span>
                <span className="text-[10px] sf-text-subtle uppercase tracking-widest font-semibold">{centerLabel}</span>
              </div>
            </div>
            <div className="sf-donut-legend">
              {slices.map((s) => (
                <div key={s.reason} className="sf-donut-legend-row">
                  <span className="sf-donut-legend-sq" style={{ background: chartColor(s.color) }} />
                  <span className="sf-donut-legend-label">{s.label}</span>
                  <span className="sf-donut-legend-pct">{s.pct.toFixed(1)}%</span>
                  <span className="sf-donut-legend-value">{formatValue(s.value, metric)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

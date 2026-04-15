import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { usd } from '../../../utils/formatting.ts';
import { BILLING_CALL_TYPE_REGISTRY, resolveBillingCallType } from '../billingCallTypeRegistry.ts';
import { pivotDailyByReason, chartColor } from '../billingTransforms.ts';
import type { BillingDailyResponse } from '../billingTypes.ts';

interface DailyCostChartProps {
  data: BillingDailyResponse | undefined;
  isLoading: boolean;
  isStale?: boolean;
}

function formatDay(day: string): string {
  try {
    const d = new Date(day + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return day;
  }
}

interface BarTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey: string; value: number; color: string }>;
  label?: string;
}

function DailyBarTooltip({ active, payload, label }: BarTooltipProps) {
  if (!active || !payload?.length) return null;

  const nonZero = payload.filter((p) => p.value > 0);
  if (nonZero.length === 0) return null;

  const total = nonZero.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="sf-chart-tooltip">
      <div className="sf-chart-tooltip-header">{formatDay(String(label))}</div>
      {nonZero.map((p) => {
        const entry = resolveBillingCallType(p.dataKey);
        return (
          <div key={p.dataKey} className="sf-chart-tooltip-row">
            <span className="sf-chart-tooltip-label">
              <span className="sf-filter-dot" style={{ background: chartColor(entry.color) }} />
              {entry.label}
            </span>
            <span className="sf-chart-tooltip-value">
              {usd(p.value, 4)}
              <span className="sf-chart-tooltip-pct">{total > 0 ? `${Math.round((p.value / total) * 100)}%` : ''}</span>
            </span>
          </div>
        );
      })}
      <div className="sf-chart-tooltip-total">
        <span>Total</span>
        <span className="sf-chart-tooltip-value">{usd(total, 4)}</span>
      </div>
    </div>
  );
}

export function DailyCostChart({ data, isLoading, isStale }: DailyCostChartProps) {
  const { pivotedRows, activeReasons } = useMemo(() => {
    if (!data?.by_day_reason?.length) return { pivotedRows: [], activeReasons: [] as string[] };

    const pivoted = pivotDailyByReason(data.by_day_reason);
    const present = new Set<string>();
    for (const row of data.by_day_reason) present.add(row.reason);
    // WHY: Stack bars in registry order (grouped by feature, light → dark within each group)
    const ordered = BILLING_CALL_TYPE_REGISTRY
      .filter((e) => present.has(e.reason))
      .map((e) => e.reason);
    for (const r of present) {
      if (!ordered.includes(r)) ordered.push(r);
    }
    return { pivotedRows: pivoted, activeReasons: ordered };
  }, [data]);

  const hasData = !isLoading && pivotedRows.length > 0;
  const staleClass = isStale ? ' sf-stale-refetch' : '';

  return (
    <div className="sf-surface-card rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart">
      <div className="px-5 py-3 flex items-center justify-between border-b sf-border-default">
        <h3 className="text-sm font-bold">Daily Cost</h3>
        {hasData && (
          <div className="flex gap-2 flex-wrap">
            {activeReasons.map((reason) => {
              const entry = BILLING_CALL_TYPE_REGISTRY.find((e) => e.reason === reason);
              if (!entry) return null;
              return (
                <span key={reason} className="flex items-center gap-1 text-[10px] sf-text-muted">
                  <span className="sf-filter-dot" style={{ background: chartColor(entry.color) }} />
                  {entry.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className={`p-5 flex-1 min-h-0${staleClass}`}>
        {isLoading && <SkeletonBlock className="sf-skel-chart" />}
        {!isLoading && pivotedRows.length === 0 && (
          <p className="sf-text-subtle text-sm text-center py-8">No daily data</p>
        )}
        {hasData && (
          <div className="sf-fade-in h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pivotedRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={<DailyBarTooltip />} />
                {activeReasons.map((reason) => {
                  const entry = BILLING_CALL_TYPE_REGISTRY.find((e) => e.reason === reason);
                  const color = entry ? chartColor(entry.color) : '#94a3b8';
                  return (
                    <Bar key={reason} dataKey={reason} stackId="cost" fill={color} minPointSize={1} />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

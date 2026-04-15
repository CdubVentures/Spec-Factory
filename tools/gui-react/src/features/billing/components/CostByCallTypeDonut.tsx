import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { usd } from '../../../utils/formatting.ts';
import { computeDonutSlices, chartColor } from '../billingTransforms.ts';
import type { BillingByReasonResponse } from '../billingTypes.ts';
import type { DonutSlice } from '../billingTypes.ts';

interface CostByCallTypeDonutProps {
  data: BillingByReasonResponse | undefined;
  isLoading: boolean;
  isStale?: boolean;
  totalCost: number;
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: DonutSlice }>;
}

function DonutChartTooltip({ active, payload }: DonutTooltipProps) {
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
        <span className="sf-chart-tooltip-label">Cost</span>
        <span className="sf-chart-tooltip-value">{usd(slice.cost_usd, 4)}</span>
      </div>
      <div className="sf-chart-tooltip-row">
        <span className="sf-chart-tooltip-label">Share</span>
        <span className="sf-chart-tooltip-value">{slice.pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export function CostByCallTypeDonut({ data, isLoading, isStale, totalCost }: CostByCallTypeDonutProps) {
  const slices = useMemo(() => computeDonutSlices(data?.reasons ?? []), [data]);

  const hasData = !isLoading && slices.length > 0;
  const staleClass = isStale ? ' sf-stale-refetch' : '';

  return (
    <div className="sf-surface-card rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart">
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">Cost by Call Type</h3>
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
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="cost_usd"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={1}
                  >
                    {slices.map((s) => (
                      <Cell key={s.reason} fill={chartColor(s.color)} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutChartTooltip />} wrapperStyle={{ zIndex: 50 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                <span className="text-lg font-bold">{usd(totalCost, 2)}</span>
                <span className="text-[10px] sf-text-subtle uppercase tracking-widest font-semibold">Total</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs w-full">
              {slices.map((s) => (
                <span key={s.reason} className="flex items-center gap-1 sf-text-muted">
                  <span className="sf-filter-dot" style={{ background: chartColor(s.color) }} />
                  {s.label} {Math.round(s.pct)}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { usd } from '../../../utils/formatting.ts';
import { computeDonutSlices, chartColor } from '../billingTransforms.ts';
import type { BillingByReasonResponse } from '../billingTypes.ts';

interface CostByCallTypeDonutProps {
  data: BillingByReasonResponse | undefined;
  isLoading: boolean;
  totalCost: number;
}

export function CostByCallTypeDonut({ data, isLoading, totalCost }: CostByCallTypeDonutProps) {
  const slices = useMemo(() => computeDonutSlices(data?.reasons ?? []), [data]);

  if (isLoading) return <Spinner className="h-8 w-8 mx-auto mt-8" />;
  if (slices.length === 0) return <p className="sf-text-subtle text-sm text-center py-8">No data</p>;

  return (
    <div className="sf-surface-card rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">Cost by Call Type</h3>
      </div>
      <div className="p-5 flex flex-col items-center gap-3">
        <div className="relative">
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
              <Tooltip formatter={(value: number) => usd(value, 4)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
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
    </div>
  );
}

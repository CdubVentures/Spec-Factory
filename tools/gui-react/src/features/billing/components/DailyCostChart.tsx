import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { BILLING_CALL_TYPE_REGISTRY } from '../billingCallTypeRegistry.ts';
import { pivotDailyByReason, chartColor } from '../billingTransforms.ts';
import type { BillingDailyResponse } from '../billingTypes.ts';

interface DailyCostChartProps {
  data: BillingDailyResponse | undefined;
  isLoading: boolean;
}

export function DailyCostChart({ data, isLoading }: DailyCostChartProps) {
  const { pivotedRows, activeReasons } = useMemo(() => {
    if (!data?.by_day_reason?.length) return { pivotedRows: [], activeReasons: [] as string[] };

    const pivoted = pivotDailyByReason(data.by_day_reason);
    const reasons = new Set<string>();
    for (const row of data.by_day_reason) reasons.add(row.reason);
    return { pivotedRows: pivoted, activeReasons: Array.from(reasons) };
  }, [data]);

  if (isLoading) return <Spinner className="h-8 w-8 mx-auto mt-8" />;
  if (pivotedRows.length === 0) return <p className="sf-text-subtle text-sm text-center py-8">No daily data</p>;

  return (
    <div className="sf-surface-card rounded-lg overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b sf-border-default">
        <h3 className="text-sm font-bold">Daily Cost</h3>
        <div className="flex gap-3 flex-wrap">
          {activeReasons.slice(0, 7).map((reason) => {
            const entry = BILLING_CALL_TYPE_REGISTRY.find((e) => e.reason === reason);
            if (!entry) return null;
            return (
              <span key={reason} className="flex items-center gap-1 text-xs sf-text-muted">
                <span className="sf-filter-dot" style={{ background: chartColor(entry.color) }} />
                {entry.label}
              </span>
            );
          })}
        </div>
      </div>
      <div className="p-5">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={pivotedRows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            {activeReasons.map((reason) => {
              const entry = BILLING_CALL_TYPE_REGISTRY.find((e) => e.reason === reason);
              const color = entry ? chartColor(entry.color) : '#94a3b8';
              return (
                <Bar key={reason} dataKey={reason} stackId="cost" fill={color} radius={[0, 0, 0, 0]} />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

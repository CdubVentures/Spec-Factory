import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
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
    const present = new Set<string>();
    for (const row of data.by_day_reason) present.add(row.reason);
    // WHY: Stack bars in registry order (grouped by feature, light → dark within each group)
    const ordered = BILLING_CALL_TYPE_REGISTRY
      .filter((e) => present.has(e.reason))
      .map((e) => e.reason);
    // Append any reasons not in the registry at the end
    for (const r of present) {
      if (!ordered.includes(r)) ordered.push(r);
    }
    return { pivotedRows: pivoted, activeReasons: ordered };
  }, [data]);

  if (isLoading) return <Spinner className="h-8 w-8 mx-auto mt-8" />;
  if (pivotedRows.length === 0) return <p className="sf-text-subtle text-sm text-center py-8">No daily data</p>;

  return (
    <div className="sf-surface-card rounded-lg overflow-hidden h-full flex flex-col">
      <div className="px-5 py-3 flex items-center justify-between border-b sf-border-default">
        <h3 className="text-sm font-bold">Daily Cost</h3>
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
      </div>
      <div className="p-5 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pivotedRows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
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
    </div>
  );
}

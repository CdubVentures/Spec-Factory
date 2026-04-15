import { MetricCard } from '../../../shared/ui/data-display/MetricCard.tsx';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import { computeAvgPerCall } from '../billingTransforms.ts';
import type { BillingSummaryResponse } from '../billingTypes.ts';

interface BillingKpiStripProps {
  summary: BillingSummaryResponse | undefined;
  isLoading: boolean;
  isStale?: boolean;
}

export function BillingKpiStrip({ summary, isLoading, isStale }: BillingKpiStripProps) {
  const t = summary?.totals ?? { calls: 0, cost_usd: 0, prompt_tokens: 0, completion_tokens: 0 };
  const avg = computeAvgPerCall(t.cost_usd, t.calls);
  const staleClass = isStale ? ' sf-stale-refetch' : '';

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px sf-border-default rounded-xl overflow-hidden sf-billing-min-kpi${staleClass}`}>
      {isLoading ? (
        <>
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonBlock key={i} className="sf-skel-kpi" />
          ))}
        </>
      ) : (
        <>
          <MetricCard label="Total Cost" value={usd(t.cost_usd, 2)} />
          <MetricCard label="LLM Calls" value={compactNumber(t.calls)} />
          <MetricCard label="Input Tokens" value={compactNumber(t.prompt_tokens)} />
          <MetricCard label="Output Tokens" value={compactNumber(t.completion_tokens)} />
          <MetricCard label="Avg / Call" value={usd(avg, 4)} />
        </>
      )}
    </div>
  );
}

import { lazy, Suspense } from 'react';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import type { BillingDailyResponse } from '../billingTypes.ts';

interface DailyTokenChartProps {
  data: BillingDailyResponse | undefined;
  isLoading: boolean;
  isStale?: boolean;
}

// WHY: Recharts is ~200KB. Lazy-loaded so billing first paint is unblocked.
const DailyTokenChartInner = lazy(() => import('./DailyTokenChartInner.tsx'));

function DailyTokenChartFallback() {
  return (
    <div className="sf-surface-card sf-tok-themed rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart">
      <div className="px-5 py-3 flex items-center justify-between border-b sf-border-default gap-3">
        <div>
          <h3 className="text-sm font-bold">Daily Tokens</h3>
          <div className="text-[11px] sf-text-subtle mt-0.5">Stacked by token class · 30-day window</div>
        </div>
      </div>
      <div className="p-5 flex-1 min-h-0">
        <SkeletonBlock className="sf-skel-chart" />
      </div>
    </div>
  );
}

export function DailyTokenChart(props: DailyTokenChartProps) {
  return (
    <Suspense fallback={<DailyTokenChartFallback />}>
      <DailyTokenChartInner {...props} />
    </Suspense>
  );
}

import { lazy, Suspense } from 'react';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import type { BillingDailyResponse } from '../billingTypes.ts';

interface DailyCostChartProps {
  data: BillingDailyResponse | undefined;
  isLoading: boolean;
  isStale?: boolean;
}

// WHY: Recharts is ~200KB. Lazy-load it so the billing page's first paint
// doesn't block on chart bundle. Surrounding card chrome shows immediately
// via the fallback so the layout doesn't shift on hydration.
const DailyCostChartInner = lazy(() => import('./DailyCostChartInner.tsx'));

function DailyCostChartFallback() {
  return (
    <div className="sf-surface-card rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart">
      <div className="px-5 py-3 flex items-center justify-between border-b sf-border-default">
        <h3 className="text-sm font-bold">Daily Cost</h3>
      </div>
      <div className="p-5 flex-1 min-h-0">
        <SkeletonBlock className="sf-skel-chart" />
      </div>
    </div>
  );
}

export function DailyCostChart(props: DailyCostChartProps) {
  return (
    <Suspense fallback={<DailyCostChartFallback />}>
      <DailyCostChartInner {...props} />
    </Suspense>
  );
}

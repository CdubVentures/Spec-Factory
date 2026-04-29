import { lazy, Suspense } from 'react';
import { DailyChartLoadingSkeleton } from './DailyChartLoadingSkeleton.tsx';
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

export function DailyCostChart(props: DailyCostChartProps) {
  return (
    <Suspense fallback={<DailyCostChartLoadingFallback />}>
      <DailyCostChartInner {...props} />
    </Suspense>
  );
}

// WHY: Cost chart legend count = number of distinct call-type reasons
// present in the response (variable, typically 4–8). 6 is a representative
// budget for the loading shimmer.
function DailyCostChartLoadingFallback() {
  return <DailyChartLoadingSkeleton title="Daily Cost" legendCount={6} />;
}

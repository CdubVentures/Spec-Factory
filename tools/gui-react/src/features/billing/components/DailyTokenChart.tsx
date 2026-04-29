import { lazy, Suspense } from 'react';
import { DailyChartLoadingSkeleton } from './DailyChartLoadingSkeleton.tsx';
import type { BillingDailyResponse } from '../billingTypes.ts';

interface DailyTokenChartProps {
  data: BillingDailyResponse | undefined;
  isLoading: boolean;
  isStale?: boolean;
}

// WHY: Recharts is ~200KB. Lazy-loaded so billing first paint is unblocked.
const DailyTokenChartInner = lazy(() => import('./DailyTokenChartInner.tsx'));

export function DailyTokenChart(props: DailyTokenChartProps) {
  return (
    <Suspense fallback={<DailyTokenChartLoadingFallback />}>
      <DailyTokenChartInner {...props} />
    </Suspense>
  );
}

// WHY: Token chart legend is fixed at 4 (Prompt / Usage / Output / Cached).
function DailyTokenChartLoadingFallback() {
  return (
    <DailyChartLoadingSkeleton
      title="Daily Tokens"
      subtitle="Stacked by token class · 30-day window"
      legendCount={4}
      tokenStyle
    />
  );
}

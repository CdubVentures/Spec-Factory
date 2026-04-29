import { lazy, Suspense } from 'react';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import { BillingMetricDonutLoadingSkeleton } from './BillingMetricDonutLoadingSkeleton.tsx';
import type { BillingByReasonResponse } from '../billingTypes.ts';

export type DonutMetric = 'cost' | 'tokens';

interface BillingMetricDonutProps {
  data: BillingByReasonResponse | undefined;
  isLoading: boolean;
  isStale?: boolean;
  metric: DonutMetric;
  // WHY: Caller supplies the authoritative total so the center reading matches
  // the hero band (rollup totals, not sum of slices — handles filtered views).
  totalValue: number;
}

// WHY: Recharts is ~200KB. Lazy-loaded so billing first paint is unblocked.
const BillingMetricDonutInner = lazy(() => import('./BillingMetricDonutInner.tsx'));

function BillingMetricDonutFallback({ metric, totalValue }: { metric: DonutMetric; totalValue: number }) {
  const title = metric === 'tokens' ? 'Tokens by Call Type' : 'Cost by Call Type';
  const subtitle = metric === 'tokens'
    ? `Share of ${compactNumber(totalValue)} total`
    : `Share of ${usd(totalValue, 2)} total`;
  return <BillingMetricDonutLoadingSkeleton title={title} subtitle={subtitle} tokenStyle={metric === 'tokens'} />;
}

export function BillingMetricDonut(props: BillingMetricDonutProps) {
  return (
    <Suspense fallback={<BillingMetricDonutFallback metric={props.metric} totalValue={props.totalValue} />}>
      <BillingMetricDonutInner {...props} />
    </Suspense>
  );
}

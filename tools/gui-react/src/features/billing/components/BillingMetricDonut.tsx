import { lazy, Suspense } from 'react';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { usd, compactNumber } from '../../../utils/formatting.ts';
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
  return (
    <div className={`sf-surface-card rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart${metric === 'tokens' ? ' sf-tok-themed' : ''}`}>
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">{title}</h3>
        <div className="text-[11px] sf-text-subtle mt-0.5">{subtitle}</div>
      </div>
      <div className="p-5 flex-1 flex flex-col items-center justify-center gap-3">
        <SkeletonBlock className="sf-skel-donut" />
      </div>
    </div>
  );
}

export function BillingMetricDonut(props: BillingMetricDonutProps) {
  return (
    <Suspense fallback={<BillingMetricDonutFallback metric={props.metric} totalValue={props.totalValue} />}>
      <BillingMetricDonutInner {...props} />
    </Suspense>
  );
}

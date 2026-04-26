import { lazy, Suspense } from 'react';

interface ThroughputPoint {
  ts: string;
  docs: number;
  fields: number;
}

interface ThroughputAreaChartProps {
  throughputHistory: ThroughputPoint[];
}

// WHY: Recharts is ~200KB. Lazy-load so the runtime-ops Overview KPI cards
// + pipeline flow render without blocking on the chart bundle.
const ThroughputAreaChartInner = lazy(() => import('./ThroughputAreaChartInner.tsx'));

function ThroughputAreaChartFallback() {
  return (
    <div className="h-[180px] flex items-center justify-center sf-text-subtle text-xs">
      Loading throughput chart...
    </div>
  );
}

export function ThroughputAreaChart(props: ThroughputAreaChartProps) {
  return (
    <Suspense fallback={<ThroughputAreaChartFallback />}>
      <ThroughputAreaChartInner {...props} />
    </Suspense>
  );
}

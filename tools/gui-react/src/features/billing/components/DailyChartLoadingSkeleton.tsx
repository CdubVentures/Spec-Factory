// WHY: Shared loading shape for DailyCostChart + DailyTokenChart — used by
// both their Suspense fallbacks (during recharts lazy-load) and their
// *Inner isLoading branches (during data fetch). Mirrors the loaded chart
// shape: card chrome + header (title + optional subtitle + legend pills) +
// chart-area shimmer at the real sf-skel-chart height.
//
// Real charts only render the legend pills when hasData. Showing them as
// shimmer pills during load eliminates the "legend pop-in" flicker that
// happens when data first arrives.
interface DailyChartLoadingSkeletonProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly legendCount: number;
  readonly tokenStyle?: boolean;
}

export function DailyChartLoadingSkeleton({ title, subtitle, legendCount, tokenStyle }: DailyChartLoadingSkeletonProps) {
  return (
    <div
      className={`sf-surface-card rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart${tokenStyle ? ' sf-tok-themed' : ''}`}
      aria-busy="true"
    >
      <div className="px-5 py-3 flex items-center justify-between border-b sf-border-default gap-3">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          {subtitle ? <div className="text-[11px] sf-text-subtle mt-0.5">{subtitle}</div> : null}
        </div>
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: legendCount }, (_value, index) => (
            <span
              key={`legend-pill-${index}`}
              className="flex items-center gap-1 text-[10px] sf-text-muted"
              aria-hidden="true"
            >
              <span className="sf-shimmer w-1.5 h-1.5 rounded-full inline-block" />
              <span className="sf-shimmer h-[10px] w-14 rounded-sm inline-block" />
            </span>
          ))}
        </div>
      </div>
      <div className="p-5 flex-1 min-h-0">
        <span className="sf-shimmer sf-skel-chart block rounded" aria-hidden="true" />
      </div>
    </div>
  );
}

// WHY: Shared loading shape for BillingMetricDonut — used by both the
// Suspense fallback (during recharts lazy-load) and BillingMetricDonutInner's
// isLoading branch (during data fetch). Mirrors the real loaded shape:
// - Card chrome with title + subtitle (caller passes them so they match)
// - 180×180 shimmer circle (matches ResponsiveContainer width=180 height=180
//   in BillingMetricDonutInner; replaces the old 170×170 sf-skel-donut)
// - sf-donut-legend column with 5 placeholder rows using the real
//   sf-donut-legend-row 4-column grid (swatch / label / pct / value)
// Both load states render this exact shape so chunk-load → data-load →
// real-content has no flicker.
interface BillingMetricDonutLoadingSkeletonProps {
  readonly title: string;
  readonly subtitle: string;
  readonly tokenStyle?: boolean;
}

export function BillingMetricDonutLoadingSkeleton({ title, subtitle, tokenStyle }: BillingMetricDonutLoadingSkeletonProps) {
  return (
    <div
      className={`sf-surface-card rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart${tokenStyle ? ' sf-tok-themed' : ''}`}
      aria-busy="true"
    >
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">{title}</h3>
        <div className="text-[11px] sf-text-subtle mt-0.5">{subtitle}</div>
      </div>
      <div className="p-5 flex-1 flex flex-col items-center justify-center gap-3">
        <span
          className="sf-shimmer rounded-full block"
          style={{ width: 180, height: 180 }}
          aria-hidden="true"
        />
        <div className="sf-donut-legend">
          {Array.from({ length: 5 }, (_value, index) => (
            <div key={`donut-legend-${index}`} className="sf-donut-legend-row" aria-hidden="true">
              <span className="sf-shimmer block w-[14px] h-[14px] rounded-sm" />
              <span className="sf-shimmer block h-[11px] w-full rounded-sm" />
              <span className="sf-shimmer block h-[11px] w-8 rounded-sm" />
              <span className="sf-shimmer block h-[11px] w-12 rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

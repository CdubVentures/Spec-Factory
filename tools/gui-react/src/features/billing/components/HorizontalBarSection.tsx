import { useMemo } from 'react';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import { computeHorizontalBars } from '../billingTransforms.ts';
import type { BillingGroupedItem } from '../billingTypes.ts';

interface HorizontalBarSectionProps {
  title: string;
  items: BillingGroupedItem[] | undefined;
  isLoading: boolean;
  isStale?: boolean;
  formatLabel?: (key: string) => string;
  barColor?: string;
}

const DEFAULT_BAR = 'var(--sf-token-accent)';

export function HorizontalBarSection({ title, items, isLoading, isStale, formatLabel, barColor }: HorizontalBarSectionProps) {
  const bars = useMemo(() => computeHorizontalBars(items ?? []), [items]);

  const staleClass = isStale ? ' sf-stale-refetch' : '';

  return (
    <div className="sf-surface-card rounded-lg overflow-hidden sf-billing-min-bars">
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className={`p-5 flex flex-col gap-2.5${staleClass}`}>
        {isLoading && Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <SkeletonBlock className="sf-skel-bar-label" />
            <div className="mt-1">
              <SkeletonBlock className="sf-skel-bar" />
            </div>
          </div>
        ))}
        {!isLoading && bars.length === 0 && (
          <p className="sf-text-subtle text-sm text-center py-4">No data</p>
        )}
        {!isLoading && bars.length > 0 && (
          <div className="sf-fade-in flex flex-col gap-2.5">
            {bars.map((bar) => (
              <div key={bar.key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-mono font-semibold">
                    {formatLabel ? formatLabel(bar.key) : bar.key}
                  </span>
                  <span className="sf-text-muted">
                    {usd(bar.cost_usd, 2)} &middot; {compactNumber(bar.calls)} calls
                  </span>
                </div>
                <div className="h-2 rounded sf-meter-track overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{ width: `${bar.pctOfMax}%`, background: barColor ?? DEFAULT_BAR }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import { computeHorizontalBars } from '../billingTransforms.ts';
import type { BillingGroupedItem } from '../billingTypes.ts';

interface HorizontalBarSectionProps {
  title: string;
  items: BillingGroupedItem[] | undefined;
  isLoading: boolean;
  formatLabel?: (key: string) => string;
  barColor?: string;
}

const DEFAULT_BAR = 'var(--sf-token-accent)';

export function HorizontalBarSection({ title, items, isLoading, formatLabel, barColor }: HorizontalBarSectionProps) {
  const bars = useMemo(() => computeHorizontalBars(items ?? []), [items]);

  if (isLoading) return <Spinner className="h-8 w-8 mx-auto mt-8" />;

  return (
    <div className="sf-surface-card rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="p-5 flex flex-col gap-2.5">
        {bars.length === 0 && <p className="sf-text-subtle text-sm text-center py-4">No data</p>}
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
    </div>
  );
}

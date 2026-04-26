import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import { computeHorizontalBars, computeTokenSegments } from '../billingTransforms.ts';
import type { BillingGroupedItem } from '../billingTypes.ts';

export type ProviderTagKind = 'openai' | 'anthropic' | 'xai' | 'deepseek' | 'google' | 'generic';

export interface ProviderTag {
  label: string;
  kind: ProviderTagKind;
}

export type BarMetric = 'cost' | 'tokens';

interface HorizontalBarSectionProps {
  title: string;
  subtitle?: string;
  items: BillingGroupedItem[] | undefined;
  isLoading: boolean;
  isStale?: boolean;
  formatLabel?: (key: string) => string;
  barColor?: string;
  gradient?: string;
  getProviderTag?: (key: string) => ProviderTag | null;
  // WHY: 'cost' ranks by USD; 'tokens' ranks by prompt+completion sum.
  metric?: BarMetric;
  // WHY: when true, render a three-segment prompt/completion/cached composition
  // bar instead of a single-fill bar. Drives the Tokens-by-Model / Tokens-by-Category bars.
  segmented?: boolean;
  metaCallout?: ReactNode;
}

function tokenTotal(item: BillingGroupedItem): number {
  return (item.prompt_tokens || 0) + (item.completion_tokens || 0);
}

export function HorizontalBarSection({
  title,
  subtitle,
  items,
  isLoading,
  isStale,
  formatLabel,
  barColor,
  gradient,
  getProviderTag,
  metric = 'cost',
  segmented = false,
  metaCallout,
}: HorizontalBarSectionProps) {
  const normalized = useMemo(() => {
    if (!items || items.length === 0) return { bars: [], rawByKey: new Map<string, BillingGroupedItem>() };
    // WHY: computeHorizontalBars ranks by cost_usd. For the tokens metric we need
    // to rank by token total, so we synthesize a cost_usd-shaped view first.
    const source: BillingGroupedItem[] = metric === 'tokens'
      ? items.map((it) => ({ ...it, cost_usd: tokenTotal(it) }))
      : items;
    const bars = computeHorizontalBars(source);
    const rawByKey = new Map(items.map((it) => [it.key, it] as const));
    return { bars, rawByKey };
  }, [items, metric]);

  const staleClass = isStale ? ' sf-stale-refetch' : '';

  return (
    <div className="sf-surface-card rounded-lg overflow-hidden sf-billing-min-bars">
      <div className="px-5 py-3 border-b sf-border-default flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          {subtitle ? <div className="text-[11px] sf-text-subtle mt-0.5">{subtitle}</div> : null}
        </div>
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
        {!isLoading && normalized.bars.length === 0 && (
          <p className="sf-text-subtle text-sm text-center py-4">No data</p>
        )}
        {!isLoading && normalized.bars.length > 0 && (
          <div className="sf-fade-in flex flex-col gap-2.5">
            {normalized.bars.map((bar) => {
              const raw = normalized.rawByKey.get(bar.key);
              const tag = getProviderTag ? getProviderTag(bar.key) : null;
              const displayValue = metric === 'tokens' && raw
                ? compactNumber(tokenTotal(raw))
                : usd(bar.cost_usd, 2);
              const composition = segmented && raw ? computeTokenSegments(raw) : null;
              return (
                <div key={bar.key}>
                  <div className="flex justify-between text-xs mb-1 gap-2">
                    <span className="flex items-center gap-1.5 min-w-0 flex-1">
                      {tag ? <span className={`sf-provider-tag sf-provider-tag-${tag.kind}`}>{tag.label}</span> : null}
                      <span className="font-mono font-semibold truncate">
                        {formatLabel ? formatLabel(bar.key) : bar.key}
                      </span>
                      <span className="sf-text-subtle text-[11px] font-normal">
                        · {compactNumber(bar.calls)} calls
                      </span>
                    </span>
                    <span className="sf-text-primary font-mono font-semibold whitespace-nowrap">
                      {displayValue}
                    </span>
                  </div>
                  <div className={`h-2 rounded sf-meter-track overflow-hidden${segmented ? ' flex' : ''}`}>
                    {composition ? (
                      <>
                        <div className="h-full" style={{ width: `${composition.promptPct}%`, background: 'var(--sf-tok-prompt)' }} />
                        <div className="h-full" style={{ width: `${composition.usagePct}%`, background: 'var(--sf-tok-usage)' }} />
                        <div className="h-full" style={{ width: `${composition.completionPct}%`, background: 'var(--sf-tok-completion)' }} />
                        <div className="h-full" style={{ width: `${composition.cachedPct}%`, background: 'var(--sf-tok-cached)' }} />
                      </>
                    ) : (
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${bar.pctOfMax}%`,
                          background: gradient ?? barColor ?? 'var(--sf-token-accent)',
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {metaCallout ? <div className="mt-2">{metaCallout}</div> : null}
      </div>
    </div>
  );
}

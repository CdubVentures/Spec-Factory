import { useMemo } from 'react';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import type { BillingSummaryResponse } from '../billingTypes.ts';

interface PromptCachePanelProps {
  summary: BillingSummaryResponse | undefined;
  isLoading: boolean;
}

// WHY: Cached reads bill at ~10% (Anthropic/DeepSeek) or 50% (OpenAI) of input
// rate. We use a conservative 50% blended discount so reported savings never
// overstate, regardless of which provider produced the hits.
const BLENDED_CACHE_DISCOUNT = 0.5;

export function PromptCachePanel({ summary, isLoading }: PromptCachePanelProps) {
  const metrics = useMemo(() => {
    const totals = summary?.totals;
    if (!totals) return null;
    const prompt = totals.prompt_tokens || 0;
    const cached = totals.cached_prompt_tokens || 0;
    if (prompt === 0) return { hitRate: null, cached: 0, uncached: 0, savingsUsd: 0 };
    const hitRate = Math.max(0, Math.min(100, (cached / prompt) * 100));
    const uncached = Math.max(0, prompt - cached);
    const avgInputRate = totals.cost_usd > 0 && prompt > 0
      ? (totals.cost_usd / (prompt + (totals.completion_tokens || 0)))
      : 0;
    const savingsUsd = cached * avgInputRate * BLENDED_CACHE_DISCOUNT;
    return { hitRate, cached, uncached, savingsUsd };
  }, [summary]);

  const hitRateLabel = (() => {
    if (!metrics || metrics.hitRate == null) return '—';
    return `${metrics.hitRate.toFixed(1)}%`;
  })();

  const savingsLabel = (() => {
    if (!metrics || metrics.hitRate == null) return 'no prompt activity yet';
    if (metrics.cached === 0) return 'no cached reads this period';
    return `≈ ${usd(metrics.savingsUsd, 2)} saved (50% discount)`;
  })();

  if (isLoading && !metrics) {
    return <PromptCachePanelLoadingSkeleton />;
  }

  return (
    <div className="sf-surface-card sf-tok-themed rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart">
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">Prompt Cache</h3>
        <div className="text-[11px] sf-text-subtle mt-0.5">Hit rate &amp; savings</div>
      </div>

      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="sf-cache-hero">
          <div className="sf-cache-hit-rate">{hitRateLabel}</div>
          <div className="sf-cache-label">Hit Rate</div>
          <div className="sf-cache-savings">{savingsLabel}</div>
        </div>

        {metrics && metrics.hitRate != null ? (
          <div className="sf-cache-body">
            <div className="sf-cache-stat-row">
              <span className="sf-cache-stat-label">Cached reads</span>
              <span className="sf-cache-stat-value">{compactNumber(metrics.cached)}</span>
            </div>
            <div className="sf-cache-stat-row">
              <span className="sf-cache-stat-label">Uncached input</span>
              <span className="sf-cache-stat-value">{compactNumber(metrics.uncached)}</span>
            </div>
            <p className="sf-cache-auto-note">
              Providers cache prefixes ≥1024 tokens automatically. Hits below expectation?
              Prefix stability is broken — check for per-call dynamic content in the system prompt.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// WHY: Mirrors the loaded PromptCachePanel — same card chrome, same static
// labels ("Hit Rate", "Cached reads", "Uncached input", auto-note copy).
// Shimmer only the dynamic value bits at the real CSS font-sizes
// (34px hit-rate value, 11.5px savings, 12px stat values). Static auto-note
// renders verbatim because it's not data-driven — no point shimmering a
// static paragraph.
function PromptCachePanelLoadingSkeleton() {
  return (
    <div
      className="sf-surface-card sf-tok-themed rounded-lg overflow-hidden h-full flex flex-col sf-billing-min-chart"
      aria-busy="true"
    >
      <div className="px-5 py-3 border-b sf-border-default">
        <h3 className="text-sm font-bold">Prompt Cache</h3>
        <div className="text-[11px] sf-text-subtle mt-0.5">Hit rate &amp; savings</div>
      </div>

      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="sf-cache-hero">
          <div className="sf-cache-hit-rate">
            <span className="sf-shimmer inline-block h-[34px] w-32 rounded-sm align-middle" aria-hidden="true" />
          </div>
          <div className="sf-cache-label">Hit Rate</div>
          <div className="sf-cache-savings">
            <span className="sf-shimmer inline-block h-[12px] w-48 rounded-sm align-middle" aria-hidden="true" />
          </div>
        </div>

        <div className="sf-cache-body">
          <div className="sf-cache-stat-row">
            <span className="sf-cache-stat-label">Cached reads</span>
            <span className="sf-shimmer inline-block h-[12px] w-16 rounded-sm align-middle" aria-hidden="true" />
          </div>
          <div className="sf-cache-stat-row">
            <span className="sf-cache-stat-label">Uncached input</span>
            <span className="sf-shimmer inline-block h-[12px] w-16 rounded-sm align-middle" aria-hidden="true" />
          </div>
          <p className="sf-cache-auto-note">
            Providers cache prefixes ≥1024 tokens automatically. Hits below expectation?
            Prefix stability is broken — check for per-call dynamic content in the system prompt.
          </p>
        </div>
      </div>
    </div>
  );
}

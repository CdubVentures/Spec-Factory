import { useMemo, useCallback } from 'react';
import { useUiStore } from '../../stores/uiStore.ts';
import { usePersistedTab, usePersistedNumber } from '../../stores/tabStore.ts';
import {
  useBillingSummaryQuery,
  useBillingPriorSummaryQuery,
  useBillingDailyQuery,
  useBillingByModelQuery,
  useBillingByReasonQuery,
  useBillingByCategoryQuery,
} from '../../features/billing/billingQueries.ts';
import type { BillingFilterState } from '../../features/billing/billingTypes.ts';
import { computeFilterChipCounts } from '../../features/billing/billingTransforms.ts';
import { BillingHeroBand } from '../../features/billing/components/BillingHeroBand.tsx';
import { BillingFilterBar } from '../../features/billing/components/BillingFilterBar.tsx';
import { DailyCostChart } from '../../features/billing/components/DailyCostChart.tsx';
import { DailyTokenChart } from '../../features/billing/components/DailyTokenChart.tsx';
import { BillingMetricDonut } from '../../features/billing/components/BillingMetricDonut.tsx';
import { PromptCachePanel } from '../../features/billing/components/PromptCachePanel.tsx';
import { HorizontalBarSection } from '../../features/billing/components/HorizontalBarSection.tsx';
import type { ProviderTag } from '../../features/billing/components/HorizontalBarSection.tsx';
import { BillingEntryTable } from '../../features/billing/components/BillingEntryTable.tsx';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// WHY: Map a model key to a provider-family tag for the cost-by-model bars.
// Heuristic — matches the pricing catalog families. Fallback is the generic tag.
function modelProviderTag(key: string): ProviderTag | null {
  const lower = key.toLowerCase();
  if (lower.startsWith('gpt-') || lower.startsWith('o1') || lower.startsWith('o3') || lower.includes('openai')) {
    return { label: 'OAI', kind: 'openai' };
  }
  if (lower.startsWith('claude-') || lower.includes('anthropic')) {
    return { label: 'ANT', kind: 'anthropic' };
  }
  if (lower.startsWith('grok') || lower.includes('xai')) {
    return { label: 'XAI', kind: 'xai' };
  }
  if (lower.startsWith('gemini') || lower.includes('google')) {
    return { label: 'GOO', kind: 'google' };
  }
  if (lower.startsWith('deepseek')) {
    return { label: 'DS', kind: 'deepseek' };
  }
  return { label: '—', kind: 'generic' };
}

function SectionHeading({ label, meta, tok }: { label: string; meta?: string; tok?: boolean }) {
  return (
    <div className={`sf-section-heading${tok ? ' is-tok' : ''}`}>
      <span className="sf-section-heading-bar" />
      <h2>{label}</h2>
      {meta ? <span className="sf-section-heading-meta">{meta}</span> : null}
    </div>
  );
}

export function BillingPage() {
  const categories = useUiStore((s) => s.categories);

  const [category, setCategory] = usePersistedTab<string>('billing:filter:category', '');
  const [reason, setReason] = usePersistedTab<string>('billing:filter:reason', '');
  const [model, setModel] = usePersistedTab<string>('billing:filter:model', '');
  const [access, setAccess] = usePersistedTab<string>('billing:filter:access', '');
  const [page, setPage] = usePersistedNumber('billing:page', 0);

  const filters = useMemo<BillingFilterState>(
    () => ({ category, reason, model, access }),
    [category, reason, model, access],
  );

  const noFilters = useMemo<BillingFilterState>(() => ({ category: '', reason: '', model: '', access: '' }), []);

  const summary = useBillingSummaryQuery(filters);
  const priorSummary = useBillingPriorSummaryQuery(filters);
  const daily = useBillingDailyQuery(filters);
  const byModel = useBillingByModelQuery(filters);
  const byReason = useBillingByReasonQuery(filters);
  const byCategory = useBillingByCategoryQuery(filters);

  // WHY: Unfiltered aggregations drive BOTH chip stability AND chip counts.
  const allModels = useBillingByModelQuery(noFilters);
  const allReasons = useBillingByReasonQuery(noFilters);
  const allCategories = useBillingByCategoryQuery(noFilters);
  const modelKeys = useMemo(
    () => (allModels.data?.models ?? []).map((m) => m.key),
    [allModels.data],
  );
  const chipCounts = useMemo(
    () => computeFilterChipCounts(allModels.data, allReasons.data, allCategories.data),
    [allModels.data, allReasons.data, allCategories.data],
  );

  const totalCost = summary.data?.totals?.cost_usd ?? 0;
  const totalTokens = (summary.data?.totals?.prompt_tokens ?? 0) + (summary.data?.totals?.completion_tokens ?? 0);

  const runsLabel = summary.data
    ? `${summary.data.totals.calls} calls · ${summary.data.models_used} models · ${summary.data.categories_used} categories`
    : '';

  const handleFilterChange = useCallback((next: BillingFilterState) => {
    setCategory(next.category);
    setReason(next.reason);
    setModel(next.model);
    setAccess(next.access);
    setPage(0);
  }, [setCategory, setReason, setModel, setAccess, setPage]);

  const categoryCallout = byCategory.data?.categories?.length ? (
    <div className="sf-bar-callout">
      <span className="sf-bar-callout-title">📊 Avg cost per product</span>
      <div className="sf-bar-callout-items">
        {byCategory.data.categories.map((c) => {
          // WHY: Rollup doesn't expose per-category product counts to the frontend,
          // so treat "avg cost per call" as the second-tier metric here.
          const perCall = c.calls > 0 ? c.cost_usd / c.calls : 0;
          return (
            <span key={c.key}>
              {capitalize(c.key)} <strong>${perCall.toFixed(4)}/call</strong>
            </span>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {/* Dual hero: Cost + Tokens */}
      <BillingHeroBand
        summary={summary.data}
        priorSummary={priorSummary.data}
        daily={daily.data}
        byReason={byReason.data}
        dateRangeLabel={summary.data?.month ?? ''}
        runsLabel={runsLabel}
        isLoading={summary.isLoading}
        isStale={summary.isPlaceholderData}
      />

      {/* Filter bar */}
      <BillingFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        categories={categories}
        models={modelKeys}
        counts={chipCounts}
      />

      {/* ── Cost section ── */}
      <SectionHeading label="Cost" meta="by time, type, and model" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DailyCostChart data={daily.data} isLoading={daily.isLoading} isStale={daily.isPlaceholderData} />
        </div>
        <BillingMetricDonut
          data={byReason.data}
          isLoading={byReason.isLoading}
          isStale={byReason.isPlaceholderData}
          metric="cost"
          totalValue={totalCost}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBarSection
          title="Cost by Model"
          subtitle={`Top ${Math.min(6, byModel.data?.models?.length ?? 0)} of ${byModel.data?.models?.length ?? 0} models`}
          items={byModel.data?.models?.slice(0, 6)}
          isLoading={byModel.isLoading}
          isStale={byModel.isPlaceholderData}
          metric="cost"
          getProviderTag={modelProviderTag}
        />
        <HorizontalBarSection
          title="Cost by Category"
          subtitle="Per-domain spend"
          items={byCategory.data?.categories}
          isLoading={byCategory.isLoading}
          isStale={byCategory.isPlaceholderData}
          metric="cost"
          formatLabel={capitalize}
          metaCallout={categoryCallout}
        />
      </div>

      {/* ── Token section ── */}
      <SectionHeading label="Tokens" meta="prompt · completion · cached — by time, type, and model" tok />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2">
          <DailyTokenChart data={daily.data} isLoading={daily.isLoading} isStale={daily.isPlaceholderData} />
        </div>
        <PromptCachePanel summary={summary.data} isLoading={summary.isLoading} />
        <BillingMetricDonut
          data={byReason.data}
          isLoading={byReason.isLoading}
          isStale={byReason.isPlaceholderData}
          metric="tokens"
          totalValue={totalTokens}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBarSection
          title="Tokens by Model"
          subtitle="Prompt / Completion / Cached composition"
          items={byModel.data?.models?.slice(0, 6)}
          isLoading={byModel.isLoading}
          isStale={byModel.isPlaceholderData}
          metric="tokens"
          segmented
          getProviderTag={modelProviderTag}
        />
        <HorizontalBarSection
          title="Tokens by Category"
          subtitle="Per-domain volume"
          items={byCategory.data?.categories}
          isLoading={byCategory.isLoading}
          isStale={byCategory.isPlaceholderData}
          metric="tokens"
          segmented
          formatLabel={capitalize}
        />
      </div>

      {/* Call log */}
      <BillingEntryTable filters={filters} page={page} onPageChange={setPage} />
    </div>
  );
}

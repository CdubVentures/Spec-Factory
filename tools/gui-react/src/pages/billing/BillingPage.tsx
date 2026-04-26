import { useMemo, useCallback, useState } from 'react';
import { useUiCategoryStore } from '../../stores/uiCategoryStore.ts';
import { usePersistedTab, usePersistedNumber } from '../../stores/tabStore.ts';
import {
  useBillingDashboardQuery,
  useBillingModelCostsQuery,
} from '../../features/billing/billingQueries.ts';
import type { BillingFilterState } from '../../features/billing/billingTypes.ts';
import { computeFilterChipCounts, resolveBillingFilterState } from '../../features/billing/billingTransforms.ts';
import { BillingHeroBand } from '../../features/billing/components/BillingHeroBand.tsx';
import { BillingFilterBar } from '../../features/billing/components/BillingFilterBar.tsx';
import { DailyCostChart } from '../../features/billing/components/DailyCostChart.tsx';
import { DailyTokenChart } from '../../features/billing/components/DailyTokenChart.tsx';
import { BillingMetricDonut } from '../../features/billing/components/BillingMetricDonut.tsx';
import { PromptCachePanel } from '../../features/billing/components/PromptCachePanel.tsx';
import { HorizontalBarSection } from '../../features/billing/components/HorizontalBarSection.tsx';
import type { ProviderTag } from '../../features/billing/components/HorizontalBarSection.tsx';
import { BillingEntryTable } from '../../features/billing/components/BillingEntryTable.tsx';
import { BillingModelCostDialog } from '../../features/billing/components/BillingModelCostDialog.tsx';

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
  const categories = useUiCategoryStore((s) => s.categories);

  const [category, setCategory] = usePersistedTab<string>('billing:filter:category', '');
  const [reason, setReason] = usePersistedTab<string>('billing:filter:reason', '');
  const [model, setModel] = usePersistedTab<string>('billing:filter:model', '');
  const [access, setAccess] = usePersistedTab<string>('billing:filter:access', '');
  const [page, setPage] = usePersistedNumber('billing:page', 0);
  const [modelCostsOpen, setModelCostsOpen] = useState(false);

  const persistedFilters = useMemo<BillingFilterState>(
    () => ({ category, reason, model, access }),
    [category, reason, model, access],
  );

  const noFilters = useMemo<BillingFilterState>(() => ({ category: '', reason: '', model: '', access: '' }), []);

  // WHY: Bundle query — single round-trip drives every section. Loading/stale
  // flags collapse to one source since all sections fetch together at 30s.
  const dashboard = useBillingDashboardQuery(persistedFilters);
  const f = dashboard.data?.filtered;
  const u = dashboard.data?.unfiltered;
  const month = dashboard.data?.month ?? '';
  const isLoading = dashboard.isLoading;
  const isStale = dashboard.isPlaceholderData;

  // Inline ad-hoc shapes where children expect { month, items[] } wrappers.
  const allModels = u ? { month, models: u.by_model } : undefined;
  const allReasons = u ? { month, reasons: u.by_reason } : undefined;
  const allCategories = u ? { month, categories: u.by_category } : undefined;
  const byModel = f ? { month, models: f.by_model } : undefined;
  const byReason = f ? { month, reasons: f.by_reason } : undefined;
  const byCategory = f ? { month, categories: f.by_category } : undefined;

  const modelKeys = useMemo(
    () => (u?.by_model ?? []).map((m) => m.key),
    [u],
  );
  const reasonKeys = useMemo(
    () => (u?.by_reason ?? []).map((r) => r.key),
    [u],
  );
  const filters = useMemo<BillingFilterState>(
    () => resolveBillingFilterState(persistedFilters, { categories, models: modelKeys, reasons: reasonKeys }),
    [persistedFilters, categories, modelKeys, reasonKeys],
  );
  const chipCounts = useMemo(
    () => computeFilterChipCounts(allModels, allReasons, allCategories),
    [allModels, allReasons, allCategories],
  );

  const modelCosts = useBillingModelCostsQuery(filters, modelCostsOpen);

  const totalCost = f?.summary?.totals?.cost_usd ?? 0;
  const totalTokens = (f?.summary?.totals?.prompt_tokens ?? 0) + (f?.summary?.totals?.completion_tokens ?? 0);

  const runsLabel = f?.summary
    ? `${f.summary.totals.calls} calls · ${f.summary.models_used} models · ${f.summary.categories_used} categories`
    : '';

  const handleFilterChange = useCallback((next: BillingFilterState) => {
    setCategory(next.category);
    setReason(next.reason);
    setModel(next.model);
    setAccess(next.access);
    setPage(0);
  }, [setCategory, setReason, setModel, setAccess, setPage]);

  const clearView = useCallback(() => {
    handleFilterChange(noFilters);
  }, [handleFilterChange, noFilters]);

  const categoryCallout = byCategory?.categories?.length ? (
    <div className="sf-bar-callout">
      <span className="sf-bar-callout-title">📊 Avg cost per product</span>
      <div className="sf-bar-callout-items">
        {byCategory.categories.map((c) => {
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
        summary={f?.summary}
        priorSummary={f?.prior_summary}
        daily={f?.daily}
        byReason={byReason}
        dateRangeLabel={f?.summary?.month ?? ''}
        runsLabel={runsLabel}
        isLoading={isLoading}
        isStale={isStale}
      />

      <div className="sf-billing-action-strip">
        <div className="sf-billing-action-copy">
          <span className="sf-billing-action-eyebrow">View controls</span>
          <strong>Billing lens</strong>
          <span>Reset filters or inspect the live model cost catalog.</span>
        </div>
        <div className="sf-billing-action-buttons">
          <button
            type="button"
            className="sf-billing-clear-button"
            onClick={clearView}
            aria-label="Clear billing view"
          >
            Clear View
          </button>
          <button
            type="button"
            className="sf-billing-cost-button"
            onClick={() => setModelCostsOpen(true)}
            aria-label="Open model cost catalog"
          >
            Model Costs
          </button>
        </div>
      </div>

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
          <DailyCostChart data={f?.daily} isLoading={isLoading} isStale={isStale} />
        </div>
        <BillingMetricDonut
          data={byReason}
          isLoading={isLoading}
          isStale={isStale}
          metric="cost"
          totalValue={totalCost}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBarSection
          title="Cost by Model"
          subtitle={`Top ${Math.min(6, byModel?.models?.length ?? 0)} of ${byModel?.models?.length ?? 0} models`}
          items={byModel?.models?.slice(0, 6)}
          isLoading={isLoading}
          isStale={isStale}
          metric="cost"
          getProviderTag={modelProviderTag}
        />
        <HorizontalBarSection
          title="Cost by Category"
          subtitle="Per-domain spend"
          items={byCategory?.categories}
          isLoading={isLoading}
          isStale={isStale}
          metric="cost"
          formatLabel={capitalize}
          metaCallout={categoryCallout}
        />
      </div>

      {/* ── Token section ── */}
      <SectionHeading label="Tokens" meta="prompt · completion · cached — by time, type, and model" tok />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2">
          <DailyTokenChart data={f?.daily} isLoading={isLoading} isStale={isStale} />
        </div>
        <PromptCachePanel summary={f?.summary} isLoading={isLoading} />
        <BillingMetricDonut
          data={byReason}
          isLoading={isLoading}
          isStale={isStale}
          metric="tokens"
          totalValue={totalTokens}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBarSection
          title="Tokens by Model"
          subtitle="Prompt / Completion / Cached composition"
          items={byModel?.models?.slice(0, 6)}
          isLoading={isLoading}
          isStale={isStale}
          metric="tokens"
          segmented
          getProviderTag={modelProviderTag}
        />
        <HorizontalBarSection
          title="Tokens by Category"
          subtitle="Per-domain volume"
          items={byCategory?.categories}
          isLoading={isLoading}
          isStale={isStale}
          metric="tokens"
          segmented
          formatLabel={capitalize}
        />
      </div>

      {/* Call log */}
      <BillingEntryTable filters={filters} page={page} onPageChange={setPage} />

      <BillingModelCostDialog
        open={modelCostsOpen}
        onOpenChange={setModelCostsOpen}
        data={modelCosts.data}
        isLoading={modelCosts.isLoading}
        isStale={modelCosts.isPlaceholderData}
      />
    </div>
  );
}

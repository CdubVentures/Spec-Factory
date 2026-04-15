import { useMemo, useCallback } from 'react';
import { useUiStore } from '../../stores/uiStore.ts';
import { usePersistedTab, usePersistedNumber } from '../../stores/tabStore.ts';
import {
  useBillingSummaryQuery,
  useBillingDailyQuery,
  useBillingByModelQuery,
  useBillingByReasonQuery,
  useBillingByCategoryQuery,
} from '../../features/billing/billingQueries.ts';
import type { BillingFilterState } from '../../features/billing/billingTypes.ts';
import { BillingKpiStrip } from '../../features/billing/components/BillingKpiStrip.tsx';
import { BillingFilterBar } from '../../features/billing/components/BillingFilterBar.tsx';
import { DailyCostChart } from '../../features/billing/components/DailyCostChart.tsx';
import { CostByCallTypeDonut } from '../../features/billing/components/CostByCallTypeDonut.tsx';
import { HorizontalBarSection } from '../../features/billing/components/HorizontalBarSection.tsx';
import { BillingEntryTable } from '../../features/billing/components/BillingEntryTable.tsx';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  const daily = useBillingDailyQuery(filters);
  const byModel = useBillingByModelQuery(filters);
  const byReason = useBillingByReasonQuery(filters);
  const byCategory = useBillingByCategoryQuery(filters);

  // WHY: Filter bar chips must stay stable — use an unfiltered query for the chip list
  // so selecting a model doesn't remove all other model chips.
  const allModels = useBillingByModelQuery(noFilters);
  const modelKeys = useMemo(
    () => (allModels.data?.models ?? []).map((m) => m.key),
    [allModels.data],
  );

  const totalCost = summary.data?.totals?.cost_usd ?? 0;

  const handleFilterChange = useCallback((next: BillingFilterState) => {
    setCategory(next.category);
    setReason(next.reason);
    setModel(next.model);
    setAccess(next.access);
    setPage(0);
  }, [setCategory, setReason, setModel, setAccess, setPage]);

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <BillingKpiStrip summary={summary.data} isLoading={summary.isLoading} isStale={summary.isPlaceholderData} />

      {/* Filter Bar */}
      <BillingFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        categories={categories}
        models={modelKeys}
      />

      {/* Charts Row 1: Daily Cost (2/3) + Donut (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DailyCostChart data={daily.data} isLoading={daily.isLoading} isStale={daily.isPlaceholderData} />
        </div>
        <CostByCallTypeDonut data={byReason.data} isLoading={byReason.isLoading} isStale={byReason.isPlaceholderData} totalCost={totalCost} />
      </div>

      {/* Charts Row 2: Model (1/2) + Category (1/2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HorizontalBarSection
          title="Cost by Model"
          items={byModel.data?.models}
          isLoading={byModel.isLoading}
          isStale={byModel.isPlaceholderData}
        />
        <HorizontalBarSection
          title="Cost by Category"
          items={byCategory.data?.categories}
          isLoading={byCategory.isLoading}
          isStale={byCategory.isPlaceholderData}
          formatLabel={capitalize}
        />
      </div>

      {/* LLM Call Log Table */}
      <BillingEntryTable filters={filters} page={page} onPageChange={setPage} />
    </div>
  );
}

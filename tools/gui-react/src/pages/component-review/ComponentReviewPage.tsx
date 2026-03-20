import { useMemo, useEffect } from 'react';
import { usePersistedToggle } from '../../stores/collapseStore';
import { usePersistedTab } from '../../stores/tabStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useUiStore } from '../../stores/uiStore';
import { useComponentReviewStore } from '../../stores/componentReviewStore';
import { useEnumReviewData } from './useEnumReviewData';
import { MetricRow } from '../../shared/ui/data-display/MetricRow';
import { Spinner } from '../../shared/ui/feedback/Spinner';
import { ComponentSubTab } from './ComponentSubTab';
import { EnumSubTab } from './EnumSubTab';
import { pct } from '../../utils/formatting';
import type { ComponentReviewLayout, ComponentReviewPayload } from '../../types/componentReview';

const baseCls = 'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer rounded sf-nav-item';
const activeCls = 'sf-nav-item-active';
const inactiveCls = 'sf-text-muted';

export function ComponentReviewPage() {
  const category = useUiStore((s) => s.category);
  const subTabPersistKey = `componentReview:tab:sub:${category}`;
  // Individual selectors: only re-render when activeSubTab changes,
  // NOT when cellEditValue or other unrelated store slices change.
  const activeSubTab = useComponentReviewStore((s) => s.activeSubTab);
  const setActiveSubTab = useComponentReviewStore((s) => s.setActiveSubTab);
  const [persistedSubTab, setPersistedSubTab] = usePersistedTab<string>(subTabPersistKey, '');
  const [debugLinkedProducts, toggleDebugLinkedProducts] = usePersistedToggle('componentReview:debugLinkedProducts', false);
  const queryClient = useQueryClient();

  const { data: layout, isLoading: layoutLoading } = useQuery({
    queryKey: ['componentReviewLayout', category],
    queryFn: () => api.get<ComponentReviewLayout>(`/review-components/${category}/layout`),
    enabled: category !== 'all',
  });

  // Resolve tab on layout load with category-scoped persisted fallback.
  useEffect(() => {
    if (!layout || layout.types.length === 0) return;
    const allowedTabs = new Set(layout.types.map((t) => t.type));
    allowedTabs.add('enums');
    const hasActive = allowedTabs.has(activeSubTab);
    const hasPersisted = allowedTabs.has(persistedSubTab);
    const nextTab = hasActive
      ? activeSubTab
      : (hasPersisted ? persistedSubTab : layout.types[0].type);
    if (!hasActive) {
      setActiveSubTab(nextTab);
    }
    if (persistedSubTab !== nextTab) {
      setPersistedSubTab(nextTab);
    }
  }, [layout, activeSubTab, persistedSubTab, setActiveSubTab, setPersistedSubTab]);

  // Fetch component data for active sub-tab (skip for enums)
  const { data: componentData, isLoading: componentLoading } = useQuery({
    queryKey: ['componentReviewData', category, activeSubTab],
    queryFn: () => api.get<ComponentReviewPayload>(`/review-components/${category}/components?type=${activeSubTab}`),
    enabled: category !== 'all' && !!activeSubTab && activeSubTab !== 'enums',
  });

  const enumReviewQuery = useEnumReviewData({
    category,
    enabled: activeSubTab === 'enums',
  });
  const enumDataFromStore = enumReviewQuery.data;
  const enumLoadingFromStore = enumReviewQuery.isLoading;

  // Build sub-tab list from layout + enums
  const subTabs = useMemo(() => {
    if (!layout) return [];
    const tabs = layout.types.map((t) => ({
      key: t.type,
      label: t.type.charAt(0).toUpperCase() + t.type.slice(1),
      count: t.item_count,
    }));
    tabs.push({ key: 'enums', label: 'Enum Lists', count: 0 });
    return tabs;
  }, [layout]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    if (activeSubTab === 'enums' && enumDataFromStore) {
      const totalValues = enumDataFromStore.fields.reduce((s, f) => s + f.metrics.total, 0);
      const totalFlags = enumDataFromStore.fields.reduce((s, f) => s + f.metrics.flags, 0);
      return [
        { label: 'Fields', value: enumDataFromStore.fields.length },
        { label: 'Total Values', value: totalValues },
        { label: 'Flags', value: totalFlags },
      ];
    }
    if (componentData) {
      return [
        { label: 'Components', value: componentData.metrics.total },
        { label: 'Avg Confidence', value: pct(componentData.metrics.avg_confidence) },
        { label: 'Flags', value: componentData.metrics.flags },
      ];
    }
    return null;
  }, [activeSubTab, componentData, enumDataFromStore]);

  if (category === 'all') {
    return <p className="sf-text-muted mt-8 text-center">Select a specific category to review components.</p>;
  }
  if (layoutLoading) return <Spinner className="h-8 w-8 mx-auto mt-12" />;
  if (!layout || layout.types.length === 0) {
    return <p className="sf-text-muted mt-8 text-center">No component data found. Run a compile first.</p>;
  }

  const isLoading = activeSubTab === 'enums' ? enumLoadingFromStore : componentLoading;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={() => toggleDebugLinkedProducts()}
          className={`px-2.5 py-1 rounded sf-text-label font-medium border transition-colors ${
            debugLinkedProducts
              ? 'sf-chip-info sf-border-default'
              : 'sf-icon-button'
          }`}
          title="Toggle linked-product and identity debug overlays."
        >
          Debug LP+ID {debugLinkedProducts ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Metrics */}
      {metrics && <MetricRow metrics={metrics} />}

      {/* Sub-tab bar */}
      <div className="flex gap-1 overflow-x-auto">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveSubTab(tab.key);
              setPersistedSubTab(tab.key);
            }}
            className={`${baseCls} ${activeSubTab === tab.key ? activeCls : inactiveCls}`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 sf-text-nano sf-chip-neutral rounded-full px-1.5 py-0.5">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading && <Spinner className="h-6 w-6 mx-auto mt-8" />}

      {!isLoading && activeSubTab === 'enums' && enumDataFromStore && (
        <EnumSubTab
          data={enumDataFromStore}
          category={category}
          queryClient={queryClient}
          debugLinkedProducts={debugLinkedProducts}
        />
      )}

      {!isLoading && activeSubTab !== 'enums' && componentData && (
        <ComponentSubTab
          data={componentData}
          category={category}
          queryClient={queryClient}
          debugLinkedProducts={debugLinkedProducts}
        />
      )}
    </div>
  );
}

import type { PrefetchLiveSettings, PrefetchTabKey, WorkerExtractionField } from '../types';

export function buildPrefetchTabState({
  activeTab,
  tabKey,
  busyTabs,
  disabledTabs,
}: {
  activeTab: PrefetchTabKey | null;
  tabKey: PrefetchTabKey;
  busyTabs?: Set<PrefetchTabKey>;
  disabledTabs?: Set<PrefetchTabKey>;
}) {
  const isSelected = activeTab === tabKey;
  const isBusy = busyTabs?.has(tabKey) ?? false;
  const isDisabled = disabledTabs?.has(tabKey) ?? false;
  return {
    isSelected,
    isBusy,
    isDisabled,
    ariaDisabled: isDisabled,
  };
}

export function resolveNextPrefetchTabSelection({
  activeTab,
  tabKey,
  disabledTabs,
}: {
  activeTab: PrefetchTabKey | null;
  tabKey: PrefetchTabKey;
  disabledTabs?: Set<PrefetchTabKey>;
}) {
  if (disabledTabs?.has(tabKey)) return activeTab;
  return activeTab === tabKey ? null : tabKey;
}

export function buildDisabledPrefetchTabs(_liveSettings: PrefetchLiveSettings | undefined) {
  const disabled = new Set<PrefetchTabKey>();
  return disabled;
}

export function normalizeActivePrefetchTab(
  prefetchTab: PrefetchTabKey | null,
  disabledPrefetchTabs: Set<PrefetchTabKey>,
) {
  if (prefetchTab === null) return null;
  return disabledPrefetchTabs.has(prefetchTab) ? null : prefetchTab;
}

export function resolveIndexedFieldHydrationNotice(
  fields: WorkerExtractionField[],
  indexedFieldNames: string[] = [],
) {
  if (indexedFieldNames.length === 0) return null;
  if (fields.length === 0) {
    return {
      kind: 'all_pending',
      title: `${indexedFieldNames.length} indexed fields pending packet hydration`,
      description: 'The page indexed successfully, but per-field evidence packets have not been materialized yet.',
      fieldNames: indexedFieldNames,
    };
  }
  return {
    kind: 'partial',
    title: `${indexedFieldNames.length} additional indexed fields pending packet hydration`,
    description: 'The page indexed more fields than have per-field evidence packets available right now.',
    fieldNames: indexedFieldNames,
  };
}

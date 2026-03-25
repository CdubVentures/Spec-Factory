// WHY: Generic tab state helpers for any stage group.
// Lifted from selectors/prefetchUiContracts.ts and generalized.
// Each stage group's tab row uses these to compute selected/busy/disabled state.

export function buildStageTabState<K extends string>({
  activeTab,
  tabKey,
  busyTabs,
  disabledTabs,
}: {
  activeTab: K | null;
  tabKey: K;
  busyTabs?: Set<K>;
  disabledTabs?: Set<K>;
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

export function resolveNextStageTabSelection<K extends string>({
  activeTab,
  tabKey,
  disabledTabs,
}: {
  activeTab: K | null;
  tabKey: K;
  disabledTabs?: Set<K>;
}) {
  if (disabledTabs?.has(tabKey)) return activeTab;
  return activeTab === tabKey ? null : tabKey;
}

export function normalizeActiveStageTab<K extends string>(
  activeTab: K | null,
  disabledTabs: Set<K>,
): K | null {
  if (activeTab === null) return null;
  return disabledTabs.has(activeTab) ? null : activeTab;
}

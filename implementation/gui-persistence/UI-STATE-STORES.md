# GUI UI State Stores

## Overview

UI state persistence is split into three stores plus session-scoped page helpers:

1. `collapseStore` for boolean expand/collapse toggles.
2. `tabStore` for tab/scope/preset selections.
3. `indexlabStore` for Indexing Lab picker selections (brand/model/variant/run).
4. `workbenchSessionState` for Field Contract workbook table state (columns/filter/sort/selection/drawer row).
5. `reviewGridSessionState` for Review Grid state (sort mode, flagged-only filter, brand filter mode + selected brands).
6. `DataTable` optional session persistence for table search and sort when `persistKey` is provided.

Session-scoped stores persist to `sessionStorage`, so user preferences survive refreshes, tab navigation, and route transitions within the same browser session.

Global autosave settings are an exception:
- Studio auto-save all/workbook/mapping
- Runtime auto-save
- Storage auto-save
- LLM settings auto-save

These are persisted durably through `/api/v1/ui-settings` (saved in `helper_files/_runtime/user-settings.json`), with `sessionStorage` used as a local fallback mirror.

---

## Store Locations

```txt
tools/gui-react/src/stores/collapseStore.ts
tools/gui-react/src/stores/tabStore.ts
tools/gui-react/src/stores/indexlabStore.ts
tools/gui-react/src/pages/studio/workbench/workbenchSessionState.ts
tools/gui-react/src/pages/review/reviewGridSessionState.ts
tools/gui-react/src/components/common/DataTable.tsx
```

Session storage keys:

- `collapse-store`
- `tab-store`
- `indexlab-store`
- `studio:workbench:sessionState:{category}`
- `review:grid:sessionState:{category}`
- `componentReview:table:{category}:{componentType}`

Session reset rule:

- Stored UI state is cleared when the browser tab/window session ends.

---

## API

### Collapse Store

Store: `useCollapseStore`

- `values: Record<string, boolean>`
- `set(key: string, value: boolean): void`
- `toggle(key: string, defaultValue?: boolean): void`
- `setBatch(updates: Record<string, boolean>): void`

Hook: `usePersistedToggle`

```ts
function usePersistedToggle(
  key: string,
  defaultValue: boolean,
): [boolean, () => void, (v: boolean) => void]
//   value   toggle     set
```

### Tab Store

Store: `useTabStore`

- `values: Record<string, string | null>`
- `set(key: string, value: string | null): void`
- `setBatch(updates: Record<string, string | null>): void`
- `clear(key: string): void`

Hooks:

```ts
function usePersistedTab<T extends string>(
  key: string,
  defaultValue: T,
  options?: { validValues?: readonly T[] },
): [T, (value: T) => void]

function usePersistedNullableTab<T extends string>(
  key: string,
  defaultValue: T | null,
  options?: { validValues?: readonly T[] },
): [T | null, (value: T | null) => void]
```

`validValues` should be supplied for constrained tab sets to reject stale values from old sessionStorage state.

---

### IndexLab Picker Store

Store: `useIndexLabStore`

Persisted fields (session-scoped):

- `pickerBrand`
- `pickerModel`
- `pickerProductId`
- `pickerRunId`

Non-persisted field:

- `byRun` live event cache remains in-memory only.

---

## Key Naming Convention

```txt
{page}:{scope}:{identifier}
```

Examples:

- `indexing:panel:overview`
- `runtimeOps:workers:drawer:mouse`
- `studio:workbench:presetTab`
- `componentReview:tab:sub:mouse`

---

## Persisted Toggle Registry

### Indexing Page

- `indexing:panel:overview`
- `indexing:panel:runtime`
- `indexing:panel:picker`
- `indexing:panel:searchProfile`
- `indexing:panel:serpExplorer`
- `indexing:panel:phase5`
- `indexing:panel:phase6b`
- `indexing:panel:phase6`
- `indexing:panel:phase7`
- `indexing:panel:phase8`
- `indexing:panel:phase9`
- `indexing:panel:learning`
- `indexing:panel:urlHealth`
- `indexing:panel:llmOutput`
- `indexing:panel:llmMetrics`
- `indexing:panel:eventStream`
- `indexing:panel:needset`
- `indexing:overview:pendingPrompt`
- `indexing:overview:lastResponse`
- `indexing:llmMetrics:pricing`
- `indexing:runtime:runSetupDiscovery`
- `indexing:runtime:fetchThroughput`
- `indexing:runtime:dynamicRenderingOcr`
- `indexing:runtime:plannerTriage`
- `indexing:runtime:roleRouting`
- `indexing:runtime:fallbackRouting`
- `indexing:runtime:routeSnapshot`
- `indexing:runtime:resumePolicy`
- `indexing:runtime:convergenceTuning`
- `indexing:panelControls:open:{category}`
- `indexing:sessionData:open:{category}`

### Runtime Ops

- `runtimeOps:workers:drawer:{category}`
- `runtimeOps:queue:blocked:{category}`
- `runtimeOps:serp:scoreDecomposition`
- `runtimeOps:llmCall:{index}`

### Component Review

- `componentReview:debugLinkedProducts`
- `componentReview:panel:expanded`
- `componentReview:enumRow:{value}:links`

### Studio

- `studio:drawer:tooltipSource`
- `studio:drawer:componentSourceMapping`
- `studio:drawer:enumSection`
- `studio:dataList:{field}:expanded`
- `studio:dataList:{field}:ai`
- `studio:compSource:{type}:expanded`
- `studio:compSource:{type}:ai`
- `studio:compSource:{type}:roles`
- `studio:compSource:{type}:attrs`
- `studio:keyNavigator:section:contract:{category}`
- `studio:keyNavigator:section:priority:{category}`
- `studio:keyNavigator:section:parse:{category}`
- `studio:keyNavigator:section:enum:{category}`
- `studio:keyNavigator:section:components:{category}`
- `studio:keyNavigator:section:constraints:{category}`
- `studio:keyNavigator:section:evidence:{category}`
- `studio:keyNavigator:section:uiDisplay:{category}`
- `studio:keyNavigator:section:searchHints:{category}`
- `studio:keyNavigator:section:fullRuleJson:{category}`
- `studio:keyNavigator:bulkOpen:{category}`

### Catalog

- `catalog:products:drawerOpen:{category}`
- `catalog:brands:drawerOpen:{category}`
- `catalog:products:bulkOpen:{category}`
- `catalog:brands:bulkOpen:{category}`

### Shared Components

- `flags:detail`
- `flags:overview`

### Test Mode

- `testMode:matrix:fieldRules`
- `testMode:matrix:components`
- `testMode:matrix:listsEnums`

---

## Persisted Tab Registry

- `catalog:tab:main` (default `brands`)
- `catalog:products:selectedProduct:{category}` (default empty)
- `catalog:products:addDraft:brand:{category}` (default empty)
- `catalog:products:addDraft:model:{category}` (default empty)
- `catalog:products:addDraft:variant:{category}` (default empty)
- `catalog:products:addDraft:seedUrls:{category}` (default empty)
- `catalog:products:addDraft:status:{category}` (default `active`)
- `catalog:brands:selectedBrand:{category}` (default empty)
- `catalog:brands:addDraft:name:{category}` (default empty)
- `catalog:brands:addDraft:aliases:{category}` (default empty)
- `catalog:brands:addDraft:categories:{category}` (default empty)
- `catalog:brands:addDraft:website:{category}` (default empty)
- `runtimeOps:tab:main` (default `overview`)
- `runtimeOps:run:{category}` (default first visible run)
- `runtimeOps:workers:poolFilter:{category}` (default `all`)
- `runtimeOps:workers:prefetchTab:{category}` (default `null`)
- `runtimeOps:workers:drawerTab:{category}` (default `documents`)
- `runtimeOps:overview:selectedBlocker:{category}` (default `null`)
- `runtimeOps:workers:selectedWorker:{category}` (default `null`)
- `runtimeOps:documents:search:{category}` (default empty)
- `runtimeOps:documents:pageSize:{category}` (default `50`)
- `runtimeOps:documents:selectedDoc:{category}` (default `null`)
- `runtimeOps:extraction:search:{category}` (default empty)
- `runtimeOps:extraction:method:{category}` (default `null`)
- `runtimeOps:extraction:status:{category}` (default `null`)
- `runtimeOps:extraction:selectedField:{category}` (default `null`)
- `runtimeOps:fallbacks:host:{category}` (default empty)
- `runtimeOps:fallbacks:result:{category}` (default `null`)
- `runtimeOps:fallbacks:selectedProfile:{category}` (default `null`)
- `runtimeOps:queue:lane:{category}` (default `null`)
- `runtimeOps:queue:selectedJob:{category}` (default `null`)
- `runtimeOps:prefetch:needset:selectedNeed:{category}` (default `null`)
- `runtimeOps:prefetch:searchProfile:selectedQuery:{category}` (default `null`)
- `runtimeOps:prefetch:searchResults:expandedQuery:{category}` (default `null`)
- `runtimeOps:prefetch:searchResults:selectedResult:{category}` (default `null`)
- `runtimeOps:prefetch:brandResolver:selectedCandidate:{category}` (default `null`)
- `runtimeOps:prefetch:serpTriage:expandedQuery:{category}` (default `null`)
- `runtimeOps:prefetch:serpTriage:selectedCandidate:{category}` (default `null`)
- `indexing:needset:sortKey:{category}` (default `need_score`)
- `indexing:needset:sortDir:{category}` (default `desc`)
- `indexing:llmTrace:selected:{category}` (default empty)
- `indexing:phase6:searchQuery:{category}` (default empty)
- `indexing:searchProfile:selectedQuery:{category}:{runId}` (default `null`)
- `studio:tab:main` (default `mapping`)
- `studio:keyNavigator:selectedKey:{category}` (default empty)
- `studio:keyNavigator:selectedGroup:{category}` (default empty)
- `studio:keyNavigator:bulkGroup:{category}` (default empty)
- `studio:keyNavigator:enumSourceTab:{category}:{fieldKey}` (default from enum source)
- `studio:workbench:drawerTab` (default `contract`)
- `studio:workbench:enumSourceTab:{category}:{fieldKey}` (default from enum source)
- `studio:workbench:presetTab` (default `minimal`)
- `studio:workbench:sessionState:{category}` (Field Contract workbook session state)
- `review:grid:sessionState:{category}` (Review Grid sort/filter/brand state)
- `componentReview:enumField:{category}` (default first enum field for category)
- `componentReview:table:{category}:{componentType}` (Component Review table search + sort state)
- `llmSettings:scope:main` (default `field`)
- `llmSettings:selectedRoute:{category}:{scope}` (default first filtered route)
- `llmSettings:sortBy:{category}:{scope}` (default `effort`)
- `llmSettings:sortDir:{category}:{scope}` (default `desc`)
- `llmSettings:filterRequired:{category}:{scope}` (default `all`)
- `llmSettings:filterDifficulty:{category}:{scope}` (default `all`)
- `llmSettings:filterAvailability:{category}:{scope}` (default `all`)
- `llmSettings:filterEffortBand:{category}:{scope}` (default `all`)
- `componentReview:tab:sub:{category}` (default first layout type)
- `storage:destination:main` (default `local`)
- `storage:browse:pathInput` (default empty)
- `storage:browse:path` (default empty)
- `catalog:products:bulkBrand:{category}` (default empty)
- `catalog:brands:bulkCategory:{category}` (default empty)
- `catalog:brands:bulkText:{category}` (default empty)
- `sidebar:product:brand:{category}` (default empty)
- `sidebar:product:model:{category}` (default empty)
- `sidebar:product:variant:{category}` (default empty)
- `overview:table:{category}` (DataTable search/sort)
- `product:fields:{category}:{productId}` (DataTable search/sort)
- `catalog:products:table:{category}` (DataTable search/sort)
- `catalog:brands:table:{category}` (DataTable search/sort)

## Persisted Picker Registry

- `indexlab-store.state.pickerBrand`
- `indexlab-store.state.pickerModel`
- `indexlab-store.state.pickerProductId`
- `indexlab-store.state.pickerRunId`
- `indexlab-runtime-autosave` (default `on`)
- `llmSettings:autoSaveEnabled` (default `on`)
- `ui:selectedCategory` (default first available category fallback)
- `studio:autoSaveAllEnabled` (default `off`)
- `autoSaveEnabled` (default `off`)
- `autoSaveMapEnabled` (default `on`)
- `storage:autoSaveEnabled` (default `off`)

Notes:

- Main app top navigation is route-driven (`HashRouter`) and is not stored in `tab-store`.
- Component Review sub-tabs are category-scoped to avoid stale cross-category selection.
- Runtime/studio/storage autosave keys are centralized in `useUiStore` and are synchronized to `/api/v1/ui-settings` at app bootstrap/runtime.
- LLM settings auto-save remains category-scoped in `useUiStore` session state.

---

## What Not To Persist

Keep these as local component state:

- Per-item UI state tied to dynamic rows (for example row-level expand/collapse where rows change with selection).
- Modal open/close flags for purely transient dialogs.
  Persist only workflow-critical drawers/modals where returning to in-progress state is expected.
- Temporary form visibility.
- Temporary inline edit state.
- Data-selection pointers such as specific drawer row IDs, unless the feature explicitly scopes those IDs by category/session key and prunes stale IDs on data reload (Field Contract workbook).

Rule: if state identity depends on dynamic data row identity, do not persist globally.

---

## Adding New Persistent State

### New toggle

1. Import `usePersistedToggle` from `collapseStore`.
2. Replace `useState(boolean)` with `usePersistedToggle(key, defaultValue)`.
3. Add the key to this registry.

### New tab

1. Import `usePersistedTab` or `usePersistedNullableTab` from `tabStore`.
2. Define tab IDs as a typed `const` array.
3. Pass `validValues` so stale values auto-fallback.
4. Add the key to this registry.

---

## Key Files

- `tools/gui-react/src/stores/collapseStore.ts`
- `tools/gui-react/src/stores/tabStore.ts`
- `tools/gui-react/src/stores/indexlabStore.ts`
- `tools/gui-react/src/pages/catalog/CatalogPage.tsx`
- `tools/gui-react/src/pages/runtime-ops/RuntimeOpsPage.tsx`
- `tools/gui-react/src/pages/runtime-ops/panels/WorkersTab.tsx`
- `tools/gui-react/src/pages/runtime-ops/panels/WorkerDataDrawer.tsx`
- `tools/gui-react/src/pages/studio/StudioPage.tsx`
- `tools/gui-react/src/pages/studio/workbench/WorkbenchDrawer.tsx`
- `tools/gui-react/src/pages/studio/workbench/FieldRulesWorkbench.tsx`
- `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`
- `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx`

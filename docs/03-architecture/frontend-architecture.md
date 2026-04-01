# Frontend Architecture

> **Purpose:** Describe the verified GUI framework, routing, state, data-fetching boundaries, and component ownership with exact file paths.
> **Prerequisites:** [system-map.md](./system-map.md), [../02-dependencies/stack-and-toolchain.md](../02-dependencies/stack-and-toolchain.md)
> **Last validated:** 2026-03-31

## Framework and Build Model

| Concern | Live implementation |
|---------|---------------------|
| framework | React 18 in `tools/gui-react/src/main.tsx` |
| router | `HashRouter` in `tools/gui-react/src/App.tsx` with route and tab metadata sourced from `tools/gui-react/src/registries/pageRegistry.ts` |
| data layer | TanStack React Query via `QueryClientProvider` in `tools/gui-react/src/App.tsx` |
| shared local state | Zustand stores in `tools/gui-react/src/stores/*.ts` |
| build/dev | Vite in `tools/gui-react/vite.config.ts` |
| rendering model | client-side SPA served by the Node backend |

## Routing Model

- Route and tab metadata SSOT: `tools/gui-react/src/registries/pageRegistry.ts`
- Route mounting: `tools/gui-react/src/App.tsx`
- Shared shell/layout: `tools/gui-react/src/pages/layout/AppShell.tsx`
- Navigation surfaces:
  - sidebar: `tools/gui-react/src/pages/layout/Sidebar.tsx`
  - top tabs: `tools/gui-react/src/pages/layout/TabNav.tsx`
- `TabNav.tsx` renders three derived groups: `CATALOG_TABS`, `OPS_TABS`, and `SETTINGS_TABS`.
- `/test-mode` is intentionally excluded from `PAGE_REGISTRY` and mounted separately in `tools/gui-react/src/App.tsx`.

## Route Ownership Pattern

| Pattern | Live location | Notes |
|---------|---------------|-------|
| route and tab registry | `tools/gui-react/src/registries/pageRegistry.ts` | single source of truth for path, label, loader, and disabled-state metadata |
| shared shell | `tools/gui-react/src/pages/layout/AppShell.tsx` | wraps all top-level routes |
| feature implementation | `tools/gui-react/src/features/**` | preferred home for stateful page logic |
| page-local implementation | `tools/gui-react/src/pages/overview/OverviewPage.tsx`, `tools/gui-react/src/pages/product/ProductPage.tsx`, `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `tools/gui-react/src/pages/billing/BillingPage.tsx`, `tools/gui-react/src/pages/storage/StoragePage.tsx`, `tools/gui-react/src/pages/test-mode/TestModePage.tsx`, `tools/gui-react/src/pages/component-review/*` | still active in the live GUI |

## Data Fetching Boundary

- REST fetches go through `tools/gui-react/src/api/client.ts`.
- WebSocket subscriptions go through `tools/gui-react/src/api/ws.ts`.
- GraphQL-specific calls go through `tools/gui-react/src/api/graphql.ts`.
- Common query and mutation ownership:
  - indexing: `tools/gui-react/src/features/indexing/api/*`
  - runtime and source-strategy settings: `tools/gui-react/src/features/pipeline-settings/state/*`
  - composite LLM policy: `tools/gui-react/src/features/llm-config/api/llmPolicyApi.ts`, `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts`
  - category LLM route matrices: `tools/gui-react/src/stores/llmSettingsAuthority.ts`
  - storage manager: `tools/gui-react/src/features/storage-manager/state/*`

## State Management

| State type | Files | Notes |
|------------|-------|-------|
| category and broad UI state | `tools/gui-react/src/stores/uiStore.ts` | canonical selected category and related UI state |
| persisted tabs | `tools/gui-react/src/stores/tabStore.ts` | many pages persist active sub-tabs here |
| collapse state | `tools/gui-react/src/stores/collapseStore.ts` | used by collapsible panels |
| flat runtime settings store | `tools/gui-react/src/stores/runtimeSettingsValueStore.ts` | shared by runtime settings and composite LLM policy editing |
| settings readiness snapshot | `tools/gui-react/src/stores/settingsAuthorityStore.ts` | app-shell readiness and degraded-render gating |
| feature-local derived state | `tools/gui-react/src/features/**/state/*` | authority hooks, selectors, and page-local models |

## Settings-State Split

- `tools/gui-react/src/pages/layout/hooks/useSettingsHydration.ts` hydrates runtime settings at the app-shell level before child pages mount.
- `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` edits runtime settings, source strategy, and deterministic spec seeds.
- `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts` derives a composite `LlmPolicy` view from the flat runtime store and saves managed keys to `PUT /api/v1/llm-policy`.
- `tools/gui-react/src/stores/llmSettingsAuthority.ts` separately reads and writes category-scoped `llm_route_matrix` rows through `/api/v1/llm-settings/:category/routes`.
- `tools/gui-react/src/pages/storage/StoragePage.tsx` now renders only `StorageManagerPanel`; it does not host a storage-settings form in the live code.

## Top-Level Feature Components

Routes below come from `PAGE_REGISTRY` except `/test-mode`, which `tools/gui-react/src/App.tsx` mounts separately.

| Route | Primary implementation |
|-------|------------------------|
| `/` | `tools/gui-react/src/pages/overview/OverviewPage.tsx` |
| `/categories` | `tools/gui-react/src/features/catalog/components/CategoryManager.tsx` |
| `/catalog` | `tools/gui-react/src/features/catalog/components/CatalogPage.tsx` |
| `/product` | `tools/gui-react/src/pages/product/ProductPage.tsx` |
| `/llm-settings` | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` |
| `/indexing` | `tools/gui-react/src/features/indexing/components/IndexingPage.tsx` |
| `/pipeline-settings` | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` |
| `/billing` | `tools/gui-react/src/pages/billing/BillingPage.tsx` |
| `/studio` | `tools/gui-react/src/features/studio/components/StudioPage.tsx` |
| `/review` | `tools/gui-react/src/features/review/components/ReviewPage.tsx` |
| `/review-components` | `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx` |
| `/runtime-ops` | `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx` |
| `/llm-config` | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` |
| `/storage` | `tools/gui-react/src/pages/storage/StoragePage.tsx` |
| `/test-mode` | `tools/gui-react/src/pages/test-mode/TestModePage.tsx` |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/registries/pageRegistry.ts` | route/tab registry and settings-tab group |
| source | `tools/gui-react/src/App.tsx` | HashRouter shell, QueryClientProvider, and standalone `/test-mode` route |
| source | `tools/gui-react/src/main.tsx` | React entrypoint |
| source | `tools/gui-react/src/pages/layout/AppShell.tsx` | shared shell ownership |
| source | `tools/gui-react/src/pages/layout/TabNav.tsx` | catalog, ops, and settings tab derivation |
| source | `tools/gui-react/src/pages/layout/hooks/useSettingsHydration.ts` | app-shell runtime settings hydration |
| source | `tools/gui-react/src/api/client.ts` | REST boundary |
| source | `tools/gui-react/src/stores/runtimeSettingsValueStore.ts` | shared flat runtime settings store |
| source | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` | pipeline settings ownership |
| source | `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts` | composite policy authority over the flat runtime store |
| source | `tools/gui-react/src/pages/storage/StoragePage.tsx` | storage page now wraps only `StorageManagerPanel` |

## Related Documents

- [Routing and GUI](./routing-and-gui.md) - Full route table and layout map.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - `/llm-config` page and composite policy contract.
- [Feature Index](../04-features/feature-index.md) - Maps frontend surfaces to backend feature docs.
- [Conventions](../01-project-overview/conventions.md) - Wrapper-versus-feature implementation pattern.

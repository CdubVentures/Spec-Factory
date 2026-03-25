# Frontend Architecture

> **Purpose:** Describe the verified GUI framework, routing, state, data-fetching boundaries, and component ownership with exact file paths.
> **Prerequisites:** [system-map.md](./system-map.md), [../02-dependencies/stack-and-toolchain.md](../02-dependencies/stack-and-toolchain.md)
> **Last validated:** 2026-03-24

## Framework and Build Model

| Concern | Live implementation |
|---------|---------------------|
| framework | React 18 in `tools/gui-react/src/main.tsx` |
| router | `HashRouter` in `tools/gui-react/src/App.tsx` with route/tab metadata sourced from `tools/gui-react/src/registries/pageRegistry.ts` |
| data layer | TanStack React Query via `QueryClientProvider` in `tools/gui-react/src/App.tsx` |
| shared local state | Zustand stores in `tools/gui-react/src/stores/*.ts` |
| build/dev | Vite in `tools/gui-react/vite.config.ts` |
| rendering model | client-side SPA served by the Node backend |

## Routing

- Route and tab metadata single source of truth lives in `tools/gui-react/src/registries/pageRegistry.ts`.
- `tools/gui-react/src/App.tsx` derives lazy route elements from `ROUTE_ENTRIES`.
- Shared shell/layout lives in `tools/gui-react/src/pages/layout/AppShell.tsx`.
- Navigation surfaces:
  - sidebar: `tools/gui-react/src/pages/layout/Sidebar.tsx`
  - top tab bar: `tools/gui-react/src/pages/layout/TabNav.tsx`, derived from `CATALOG_TABS` and `OPS_TABS`
- `/test-mode` is intentionally excluded from `PAGE_REGISTRY` and mounted separately in `tools/gui-react/src/App.tsx`.
- The URL model is `/#/...`; do not document or build against filesystem-style server routes.

## Route Ownership Pattern

| Pattern | Live location | Notes |
|---------|---------------|-------|
| route + tab registry | `tools/gui-react/src/registries/pageRegistry.ts` | single source of truth for path, label, loader, and disabled-state metadata |
| thin route wrapper | `tools/gui-react/src/pages/**` | some page files only re-export the real implementation |
| feature implementation | `tools/gui-react/src/features/**` | preferred home for stateful page logic |
| legacy page-local implementation | `tools/gui-react/src/pages/overview/OverviewPage.tsx`, `tools/gui-react/src/pages/product/ProductPage.tsx`, `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `tools/gui-react/src/pages/billing/BillingPage.tsx`, `tools/gui-react/src/pages/storage/StoragePage.tsx`, `tools/gui-react/src/pages/test-mode/TestModePage.tsx`, `tools/gui-react/src/pages/component-review/*` | still active in the live GUI |

## Data Fetching Boundary

- All standard REST fetches go through `tools/gui-react/src/api/client.ts`.
- WebSocket subscriptions go through `tools/gui-react/src/api/ws.ts`.
- GraphQL-specific calls go through `tools/gui-react/src/api/graphql.ts`.
- Common query/mutation ownership:
  - Indexing: `tools/gui-react/src/features/indexing/api/indexingRunQueries.ts`, `tools/gui-react/src/features/indexing/api/indexingRunMutations.ts`
  - Pipeline/runtime settings: `tools/gui-react/src/features/pipeline-settings/state/*`
  - Composite LLM policy: `tools/gui-react/src/features/llm-config/api/llmPolicyApi.ts`, `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts`
  - Category LLM route matrices: `tools/gui-react/src/stores/llmSettingsAuthority.ts`
  - Review: `tools/gui-react/src/features/review/components/ReviewPage.tsx`
  - Runtime Ops: `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx`

## State Management

| State type | Files | Notes |
|------------|-------|-------|
| category + broad UI state | `tools/gui-react/src/stores/uiStore.ts` | canonical selected category and related UI state |
| persisted tabs | `tools/gui-react/src/stores/tabStore.ts` | many pages persist active sub-tabs here |
| collapse state | `tools/gui-react/src/stores/collapseStore.ts` | used by test mode and other collapsible panels |
| flat runtime settings store | `tools/gui-react/src/stores/runtimeSettingsValueStore.ts` | SSOT for runtime key/value state used by both pipeline settings and composite LLM policy editing |
| feature-local derived state | `tools/gui-react/src/features/**/state/*` | authority hooks, selectors, and page-local models |

## Settings-State Split

- `tools/gui-react/src/features/pipeline-settings/state/useRuntimeSettingsAuthority.ts` persists flat runtime keys to `PUT /api/v1/runtime-settings`.
- `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts` derives a composite `LlmPolicy` view from the same flat runtime store, then saves only the managed policy keys to `PUT /api/v1/llm-policy`.
- `tools/gui-react/src/stores/llmSettingsAuthority.ts` is separate: it reads and writes category-scoped LLM route matrices through `GET/PUT /api/v1/llm-settings/:category/routes`.
- `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` no longer owns a distinct convergence-settings editor. The compatibility-only `convergence` object remains server-side in persisted settings, but no live GUI route is bound to `/api/v1/convergence-settings`.

## Top-Level Feature Components

Routes below come from `PAGE_REGISTRY` in `tools/gui-react/src/registries/pageRegistry.ts` except `/test-mode`, which `tools/gui-react/src/App.tsx` mounts separately.

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
| source | `tools/gui-react/src/registries/pageRegistry.ts` | route/tab registry, lazy-loader metadata, and `test-mode` exclusion |
| source | `tools/gui-react/src/App.tsx` | HashRouter shell, QueryClientProvider, and registry-driven route assembly |
| source | `tools/gui-react/src/main.tsx` | React entrypoint |
| source | `tools/gui-react/src/api/client.ts` | REST fetch boundary |
| source | `tools/gui-react/src/api/ws.ts` | WebSocket client boundary |
| source | `tools/gui-react/src/pages/layout/TabNav.tsx` | tab derivation from `CATALOG_TABS` and `OPS_TABS` |
| source | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | composite LLM policy editor structure |
| source | `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts` | shared-store composite policy authority |
| source | `tools/gui-react/src/stores/llmSettingsAuthority.ts` | category-scoped LLM route-matrix authority |
| source | `tools/gui-react/src/stores/runtimeSettingsValueStore.ts` | flat runtime store used by multiple settings surfaces |
| source | `tools/gui-react/src/pages/layout/AppShell.tsx` | shared shell ownership |

## Related Documents

- [Routing and GUI](./routing-and-gui.md) - Full route table and layout map.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - Documents the `/llm-config` page and the composite policy contract.
- [Feature Index](../04-features/feature-index.md) - Maps these frontend surfaces to backend feature docs.
- [Conventions](../01-project-overview/conventions.md) - Explains the wrapper-vs-feature implementation pattern.

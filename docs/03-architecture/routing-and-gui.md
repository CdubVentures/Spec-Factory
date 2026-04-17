# Routing and GUI

> **Purpose:** Map the live GUI routes, shared layouts, navigation groups, and client/server boundaries with exact file ownership.
> **Prerequisites:** [frontend-architecture.md](./frontend-architecture.md), [backend-architecture.md](./backend-architecture.md)
> **Last validated:** 2026-04-10

## Route Source Of Truth

- `tools/gui-react/src/registries/pageRegistry.ts` is the SSOT for all tabbed GUI routes.
- `tools/gui-react/src/App.tsx` derives `<Route>` elements from `ROUTE_ENTRIES`.
- `tools/gui-react/src/pages/layout/TabNav.tsx` derives the visible tab groups from `GLOBAL_TABS`, `CATALOG_TABS`, `OPS_TABS`, and `SETTINGS_TABS`.
- `/test-mode` is not in `PAGE_REGISTRY`; it is mounted directly in `tools/gui-react/src/App.tsx`.
- There are no React Router guards and no React Router data loaders in the current GUI.

## Route Map

`Loader` below means the lazy module import source plus the first page-local data authority. It does not mean a React Router data loader.

| Path | Component/Page | Guard | Loader | Layout | Purpose |
|------|---------------|-------|--------|--------|---------|
| `/` | `OverviewPage` | none | lazy import from `tools/gui-react/src/pages/overview/OverviewPage.tsx`; page-local queries | `AppShell` | high-level overview of catalog and runtime state |
| `/categories` | `CategoryManager` | none | lazy import from `tools/gui-react/src/features/catalog/components/CategoryManager.tsx`; feature-local queries/mutations | `AppShell` | category creation and selection |
| `/brands` | `BrandManager` | none | lazy import from `tools/gui-react/src/features/studio/components/BrandManager.tsx`; brand management hooks | `AppShell` | global brand registry management |
| `/colors` | `ColorRegistryPage` | none | lazy import from `tools/gui-react/src/features/color-registry/components/ColorRegistryPage.tsx`; color registry hooks | `AppShell` | global color registry management |
| `/units` | `UnitRegistryPage` | none | lazy import from `tools/gui-react/src/pages/unit-registry/UnitRegistryPage.tsx`; React Query hooks over `/unit-registry` | `AppShell` | global unit registry management |
| `/billing` | `BillingPage` | none | lazy import from `tools/gui-react/src/pages/billing/BillingPage.tsx`; billing queries | `AppShell` | billing summaries and learning cost views |
| `/product` | `ProductPage` | none | lazy import from `tools/gui-react/src/pages/product/ProductPage.tsx`; selected-product queries | `AppShell` | currently selected product detail |
| `/catalog` | `CatalogPage` | none | lazy import from `tools/gui-react/src/features/catalog/components/CatalogPage.tsx`; catalog queries/mutations | `AppShell` | product catalog management |
| `/studio` | `StudioPage` | none | lazy import from `tools/gui-react/src/features/studio/components/StudioPage.tsx`; studio data hooks | `AppShell` | field rules studio |
| `/indexing` | `IndexingPage` | none | lazy import from `tools/gui-react/src/features/indexing/components/IndexingPage.tsx`; heavy React Query surface | `AppShell` | IndexLab runs, artifacts, and analytics |
| `/runtime-ops` | `RuntimeOpsPage` | none | lazy import from `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx`; runtime ops queries | `AppShell` | live runtime diagnostics and process telemetry |
| `/publisher` | `PublisherPage` | none | lazy import from `tools/gui-react/src/pages/publisher/PublisherPage.tsx`; `/publisher/:category/*` queries | `AppShell` | publisher candidate audit log and validation history |
| `/review` | `ReviewPage` | none | lazy import from `tools/gui-react/src/features/review/components/ReviewPage.tsx`; review queries/mutations | `AppShell` | scalar review workflow |
| `/review-components` | `ComponentReviewPage` | none | lazy import from `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx`; component review queries/mutations | `AppShell` | component and enum review workflow |
| `/storage` | `StoragePage` | none | lazy import from `tools/gui-react/src/pages/storage/StoragePage.tsx`; `useStorageOverview()` and `useStorageRuns()` | `AppShell` | storage inventory and destructive maintenance actions |
| `/llm-config` | `LlmConfigPage` | none | lazy import from `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx`; `useLlmPolicyAuthority()` plus `/indexing/llm-config` queries | `AppShell` | global LLM policy, provider, and budget configuration |
| `/pipeline-settings` | `PipelineSettingsPage` | none | lazy import from `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx`; runtime settings, source strategy, and spec seed authorities | `AppShell` | runtime and pipeline control surface |
| `/test-mode` | `TestModePage` | none | lazy import from `tools/gui-react/src/pages/test-mode/TestModePage.tsx`; renders `FieldContractAudit.tsx`; page-local test-mode queries/mutations | `AppShell` | field contract audit dashboard |

## Navigation Groups

| Group | Source | Routes |
|------|--------|--------|
| global | `GLOBAL_TABS` in `tools/gui-react/src/registries/pageRegistry.ts` | `/categories`, `/brands`, `/colors`, `/units`, `/billing` |
| catalog | `CATALOG_TABS` in `tools/gui-react/src/registries/pageRegistry.ts` | `/`, `/product`, `/catalog`, `/studio` |
| ops | `OPS_TABS` in `tools/gui-react/src/registries/pageRegistry.ts` | `/indexing`, `/runtime-ops`, `/publisher`, `/review`, `/review-components`, `/storage` |
| settings | `SETTINGS_TABS` in `tools/gui-react/src/registries/pageRegistry.ts` | `/llm-config`, `/pipeline-settings` |
| standalone | `tools/gui-react/src/App.tsx` only | `/test-mode` |

## Shared Layouts And Wrappers

| File | Role |
|------|------|
| `tools/gui-react/src/App.tsx` | wraps every route in `ErrorBoundary`, `Suspense`, and `QueryClientProvider` |
| `tools/gui-react/src/pages/layout/AppShell.tsx` | global shell, hydration gate, top header, sidebar, tab nav, and route outlet |
| `tools/gui-react/src/pages/layout/TabNav.tsx` | group-aware tab navigation and status chips |
| `tools/gui-react/src/pages/layout/Sidebar.tsx` | category/product selection and supporting controls |
| `tools/gui-react/src/features/llm-config/components/LlmConfigPageShell.tsx` | nested shell specific to the `/llm-config` surface |

## Client / Server Boundaries

| Boundary | Files | Notes |
|----------|-------|-------|
| REST | `tools/gui-react/src/api/client.ts` | all standard API calls go through `/api/v1/*` |
| GraphQL | `tools/gui-react/src/api/graphql.ts` | posts to `/api/v1/graphql` |
| realtime | `tools/gui-react/src/api/ws.ts` | connects to `/ws` |
| static shell delivery | `src/app/api/staticFileServer.js` | serves the built SPA |

## Verified GUI Constraints

- No auth guard layer exists in the route tree.
- No route-level data loader or action API from React Router is used.
- `/pipeline-settings` does not call a live `/api/v1/storage-settings` or `/api/v1/convergence-settings` endpoint.
- `/storage` calls `/api/v1/storage/*` only and renders a storage-manager surface, not a storage-settings form.
- `/llm-config` and `/pipeline-settings` both read unauthenticated configuration surfaces from the backend.

## Component Hierarchy

```text
tools/gui-react/src/main.tsx
  -> tools/gui-react/src/App.tsx
    -> tools/gui-react/src/pages/layout/AppShell.tsx
      -> tools/gui-react/src/pages/layout/TabNav.tsx
      -> tools/gui-react/src/pages/layout/Sidebar.tsx
      -> Outlet
        -> route-selected page component from tools/gui-react/src/registries/pageRegistry.ts
```

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/registries/pageRegistry.ts` | route inventory, tab groups, and lazy route module sources |
| source | `tools/gui-react/src/App.tsx` | registry-derived routing and standalone `/test-mode` mounting |
| source | `tools/gui-react/src/pages/layout/AppShell.tsx` | shared layout structure and hydration gate |
| source | `tools/gui-react/src/pages/layout/TabNav.tsx` | tab-group navigation and status-chip behavior |
| source | `tools/gui-react/src/api/client.ts` | REST boundary |
| source | `tools/gui-react/src/api/graphql.ts` | GraphQL boundary |
| source | `tools/gui-react/src/api/ws.ts` | websocket boundary |
| source | `tools/gui-react/src/pages/unit-registry/UnitRegistryPage.tsx` | `/units` page ownership |
| source | `tools/gui-react/src/pages/publisher/PublisherPage.tsx` | `/publisher` page ownership |
| source | `tools/gui-react/src/pages/storage/StoragePage.tsx` | storage page ownership |
| source | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` | runtime/source-strategy/spec-seed ownership |
| source | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | composite LLM policy ownership |

## Related Documents

- [Frontend Architecture](./frontend-architecture.md) - GUI framework, state, and fetch architecture.
- [Backend Architecture](./backend-architecture.md) - backend handlers that these routes call.
- [Auth and Sessions](./auth-and-sessions.md) - confirms that no route guards or user sessions exist.
- [Feature Index](../04-features/feature-index.md) - route-to-feature lookup table.

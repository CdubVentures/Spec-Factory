# Routing and GUI

> **Purpose:** Map the live GUI route table, shared layouts, and client/server boundaries with exact file ownership.
> **Prerequisites:** [frontend-architecture.md](./frontend-architecture.md)
> **Last validated:** 2026-03-31

## Route Source Of Truth

- `tools/gui-react/src/registries/pageRegistry.ts` is the single source of truth for tabbed GUI route paths, labels, lazy loaders, and disabled-state metadata.
- `tools/gui-react/src/App.tsx` derives `<Route>` elements from `ROUTE_ENTRIES`.
- `tools/gui-react/src/pages/layout/TabNav.tsx` derives the operator tab strip from `CATALOG_TABS`, `OPS_TABS`, and `SETTINGS_TABS`.
- `/test-mode` is the deliberate exception: it is mounted directly in `tools/gui-react/src/App.tsx` and does not participate in the tab registry.

## Route Map

| Path | Component/Page | Guard | Loader | Layout | Purpose |
|------|---------------|-------|--------|--------|---------|
| `/` | `OverviewPage` | none | page-local queries | `AppShell` | high-level catalog and billing overview |
| `/categories` | `CategoryManager` | none | client query and mutation hooks | `AppShell` | create and select categories |
| `/catalog` | `CatalogPage` | none | catalog queries and mutations | `AppShell` | brand and product catalog management |
| `/product` | `ProductPage` | none | page-level query | `AppShell` | selected product detail |
| `/llm-settings` | `LlmSettingsPage` | none | `useLlmSettingsAuthority()` | `AppShell` | category-scoped `llm_route_matrix` editor |
| `/indexing` | `IndexingPage` | none | heavy React Query surface | `AppShell` | launch runs and inspect run artifacts |
| `/llm-config` | `LlmConfigPage` | none | `useLlmPolicyAuthority()` plus `GET /api/v1/indexing/llm-config` | `AppShell` | global LLM policy, provider registry, budgets, and phase overrides |
| `/pipeline-settings` | `PipelineSettingsPage` | none | runtime settings authority, source-strategy authority, spec seeds authority, and `GET /api/v1/indexing/llm-config` | `AppShell` | runtime settings, source strategy, and deterministic spec seeds |
| `/billing` | `BillingPage` | none | page-level queries | `AppShell` | billing rollups and learning artifacts |
| `/studio` | `StudioPage` | none | studio queries and mutations | `AppShell` | field-rules studio |
| `/review` | `ReviewPage` | none | review queries and mutations | `AppShell` | scalar review workflow |
| `/review-components` | `ComponentReviewPage` | none | component review queries and mutations | `AppShell` | component and enum review workflow |
| `/runtime-ops` | `RuntimeOpsPage` | none | runtime-ops query surface | `AppShell` | live worker/runtime diagnostics |
| `/storage` | `StoragePage` | none | `useStorageOverview()` and `useStorageRuns()` | `AppShell` | storage inventory and maintenance actions |
| `/test-mode` | `TestModePage` | none | page-level queries and mutations | `AppShell` | synthetic fixture generation and validation |

## Shared Layouts and Navigation

| File | Role |
|------|------|
| `tools/gui-react/src/registries/pageRegistry.ts` | tabbed route and tab metadata SSOT |
| `tools/gui-react/src/pages/layout/AppShell.tsx` | top-level shell, product/category context, and route outlet |
| `tools/gui-react/src/pages/layout/Sidebar.tsx` | side navigation and category/product controls |
| `tools/gui-react/src/pages/layout/TabNav.tsx` | top tab strip derived from registry tab groups |
| `tools/gui-react/src/features/llm-config/components/LlmConfigPageShell.tsx` | page-local left-nav shell for `/llm-config` phases |

## Client/Server Boundary

- Client-rendered SPA: all GUI routes render in the browser after the backend serves built assets.
- Server-rendered HTML routes: none verified.
- Client transport:
  - REST: `tools/gui-react/src/api/client.ts`
  - WebSocket: `tools/gui-react/src/api/ws.ts`
  - GraphQL proxy client: `tools/gui-react/src/api/graphql.ts`
- Sensitive settings pages:
  - `/llm-config` reads unauthenticated `/api/v1/llm-policy` and `/api/v1/indexing/llm-config`, both of which can return secret-bearing fields when configured.
  - `/pipeline-settings` reads unauthenticated `/api/v1/runtime-settings`, `/api/v1/source-strategy`, and `/api/v1/spec-seeds`; `/api/v1/runtime-settings` can return secret-bearing provider key fields when configured.
  - `/pipeline-settings` does not call a live `/api/v1/storage-settings` or `/api/v1/convergence-settings` route.
  - `/storage` uses `/api/v1/storage/*` only; it does not render a storage-settings form in the current code.

## Component Ownership Notes

- `tools/gui-react/src/registries/pageRegistry.ts` points most tabbed routes directly at feature-owned components under `tools/gui-react/src/features/**`.
- `tools/gui-react/src/App.tsx` no longer hardcodes the tabbed route inventory; it mounts registry-derived routes plus standalone `/test-mode`.
- `tools/gui-react/src/pages/storage/StoragePage.tsx` is now a thin wrapper around `StorageManagerPanel`.
- `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` owns runtime, source-strategy, and deterministic-spec-seed editing.
- `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` owns the composite LLM policy editor, while `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` owns category route-matrix editing.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/registries/pageRegistry.ts` | route registry, tab labels, and disabled-state metadata |
| source | `tools/gui-react/src/App.tsx` | registry-driven route mounting plus standalone `test-mode` route |
| source | `tools/gui-react/src/pages/layout/AppShell.tsx` | shell ownership |
| source | `tools/gui-react/src/pages/layout/Sidebar.tsx` | sidebar ownership |
| source | `tools/gui-react/src/pages/layout/TabNav.tsx` | operator-facing tab derivation from the registry |
| source | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` | runtime/source strategy/spec seeds ownership |
| source | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | `/llm-config` ownership and metadata reads |
| source | `tools/gui-react/src/pages/storage/StoragePage.tsx` | storage page now wraps inventory-only panel |
| source | `tools/gui-react/src/features/storage-manager/state/useStorageOverview.ts` | `/storage/overview` client contract |
| source | `tools/gui-react/src/features/storage-manager/state/useStorageRuns.ts` | `/storage/runs` client contract |

## Related Documents

- [Frontend Architecture](./frontend-architecture.md) - Broader GUI framework, state, and fetch context.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - Deep dive on `/llm-config`.
- [Feature Index](../04-features/feature-index.md) - Route-to-feature lookup table.
- [API Surface](../06-references/api-surface.md) - Server endpoints called by these routes.

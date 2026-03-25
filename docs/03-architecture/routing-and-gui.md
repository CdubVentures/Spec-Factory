# Routing and GUI

> **Purpose:** Map the live GUI route table, shared layouts, and client/server boundaries with exact file ownership.
> **Prerequisites:** [frontend-architecture.md](./frontend-architecture.md)
> **Last validated:** 2026-03-24

## Route Source Of Truth

- `tools/gui-react/src/registries/pageRegistry.ts` is the single source of truth for tabbed GUI route paths, labels, lazy loaders, and `disabledOnAll` / `disabledOnTest` metadata.
- `tools/gui-react/src/App.tsx` derives `<Route>` elements from `ROUTE_ENTRIES`.
- `tools/gui-react/src/pages/layout/TabNav.tsx` derives the operator tab strip from `CATALOG_TABS` and `OPS_TABS`.
- `/test-mode` is the deliberate exception: it is mounted directly in `tools/gui-react/src/App.tsx` and does not participate in the tab registry.

## Route Map

| Path | Component/Page | Guard | Loader | Layout | Purpose |
|------|---------------|-------|--------|--------|---------|
| `/` | `OverviewPage` | none | React Query inside page | `AppShell` | high-level catalog/billing overview |
| `/categories` | `CategoryManager` | none | client query/mutation hooks | `AppShell` | create/select categories |
| `/catalog` | `CatalogPage` | none | child queries in `BrandManager` and `ProductManager` | `AppShell` | brand + model/product catalog management |
| `/product` | `ProductPage` | none | page-level query | `AppShell` | selected product detail |
| `/llm-settings` | `LlmSettingsPage` | none | `useLlmSettingsAuthority()` plus bootstrap rows from `tools/gui-react/src/stores/llmSettingsAuthority.ts` | `AppShell` | category-scoped LLM route-matrix editor persisted via `/api/v1/llm-settings/:category/routes` |
| `/indexing` | `IndexingPage` | none | heavy React Query surface | `AppShell` | run IndexLab and inspect run artifacts |
| `/llm-config` | `LlmConfigPage` | none | `useLlmPolicyAuthority()` plus `GET /api/v1/indexing/llm-config` | `AppShell` | global LLM policy, provider registry, budgets, API keys, and phase overrides persisted via `/api/v1/llm-policy` |
| `/pipeline-settings` | `PipelineSettingsPage` | none | runtime settings authority, source-strategy authority, and `GET /api/v1/indexing/llm-config` for token defaults | `AppShell` | runtime settings, storage settings, and source strategy editor; no live `/convergence-settings` route is mounted |
| `/billing` | `BillingPage` | none | page-level queries | `AppShell` | billing rollups and learning artifacts |
| `/studio` | `StudioPage` | none | studio page queries/mutations | `AppShell` | field-rules studio |
| `/review` | `ReviewPage` | none | review queries/mutations | `AppShell` | scalar product-field review workflow |
| `/review-components` | `ComponentReviewPage` | none | component review queries/mutations | `AppShell` | component + enum review workflow |
| `/test-mode` | `TestModePage` | none | page-level queries/mutations | `AppShell` | deterministic fixture generation/validation |
| `/runtime-ops` | `RuntimeOpsPage` | none | runtime-ops query surface | `AppShell` | live worker/runtime diagnostics |
| `/storage` | `StoragePage` | none | storage queries/browse | `AppShell` | storage settings and file browsing |

## Shared Layouts and Navigation

| File | Role |
|------|------|
| `tools/gui-react/src/registries/pageRegistry.ts` | tabbed route and tab metadata single source of truth |
| `tools/gui-react/src/pages/layout/AppShell.tsx` | top-level shell, product/category context, drawers, and outlet |
| `tools/gui-react/src/pages/layout/Sidebar.tsx` | side navigation and category/product controls |
| `tools/gui-react/src/pages/layout/TabNav.tsx` | top tab strip derived from registry tab groups |
| `tools/gui-react/src/features/llm-config/components/LlmConfigPageShell.tsx` | page-local left-nav shell for the `/llm-config` phase editor |

## Client/Server Boundary

- Client-rendered SPA: all GUI routes render in the browser after the backend serves the built assets.
- Server-rendered content: none verified.
- Client transport:
  - REST: `tools/gui-react/src/api/client.ts`
  - WebSocket: `tools/gui-react/src/api/ws.ts`
  - GraphQL proxy client: `tools/gui-react/src/api/graphql.ts`
- Settings route split:
  - `/llm-settings` uses category-scoped SQLite route-matrix endpoints in `src/features/settings/api/configLlmSettingsHandler.js`.
  - `/llm-config` uses the composite runtime-policy endpoint in `src/features/settings-authority/llmPolicyHandler.js`.
  - `/pipeline-settings` uses `/runtime-settings`, `/storage-settings`, and `/source-strategy`; it does not call a live `/convergence-settings` route.

## Component Ownership Notes

- `tools/gui-react/src/registries/pageRegistry.ts` points most routes directly at feature-owned components under `tools/gui-react/src/features/**`.
- `tools/gui-react/src/App.tsx` no longer hardcodes the tabbed route inventory; it wraps the registry-derived routes plus the standalone `test-mode` route.
- `tools/gui-react/src/pages/overview/OverviewPage.tsx`, `tools/gui-react/src/pages/product/ProductPage.tsx`, `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `tools/gui-react/src/pages/billing/BillingPage.tsx`, `tools/gui-react/src/pages/storage/StoragePage.tsx`, `tools/gui-react/src/pages/test-mode/TestModePage.tsx`, and `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx` are still page-local implementations rather than wrappers.
- `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` owns the composite LLM policy editor, while `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` owns the per-category route-matrix editor.
- `tools/gui-react/src/pages/layout/AppShell.tsx` remains the shared route shell around all first-class pages.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/registries/pageRegistry.ts` | route registry, tab labels, and route disabled-state metadata |
| source | `tools/gui-react/src/App.tsx` | registry-driven route mounting plus standalone `test-mode` route |
| source | `tools/gui-react/src/pages/layout/AppShell.tsx` | shell ownership |
| source | `tools/gui-react/src/pages/layout/Sidebar.tsx` | sidebar ownership |
| source | `tools/gui-react/src/pages/layout/TabNav.tsx` | operator-facing tab derivation from the registry |
| source | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | `/llm-config` ownership and loader split |
| source | `tools/gui-react/src/features/llm-config/components/LlmConfigPageShell.tsx` | `/llm-config` phase-shell composition |
| source | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` | `/llm-settings` route-matrix ownership |
| source | `tools/gui-react/src/api/client.ts` | REST boundary |

## Related Documents

- [Frontend Architecture](./frontend-architecture.md) - Broader GUI framework/state/fetching context.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - Deep dive on the `/llm-config` surface.
- [Feature Index](../04-features/feature-index.md) - Route-to-feature lookup table.
- [API Surface](../06-references/api-surface.md) - Server endpoints called by these routes.

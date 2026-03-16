# Routing and GUI

> **Purpose:** Map the live GUI route table, shared layouts, and client/server boundaries with exact file ownership.
> **Prerequisites:** [frontend-architecture.md](./frontend-architecture.md)
> **Last validated:** 2026-03-15

## Route Map

| Path | Component/Page | Guard | Loader | Layout | Purpose |
|------|---------------|-------|--------|--------|---------|
| `/` | `OverviewPage` | none | React Query inside page | `AppShell` | high-level catalog/billing overview |
| `/categories` | `CategoryManager` | none | client query/mutation hooks | `AppShell` | create/select categories |
| `/catalog` | `CatalogPage` | none | child queries in `BrandManager` and `ProductManager` | `AppShell` | brand + model/product catalog management |
| `/product` | `ProductPage` | none | page-level query | `AppShell` | selected product detail |
| `/llm-settings` | `LlmSettingsPage` | none | authority hooks | `AppShell` | LLM route matrix editing |
| `/indexing` | `IndexingPage` | none | heavy React Query surface | `AppShell` | run IndexLab and inspect run artifacts |
| `/pipeline-settings` | `PipelineSettingsPage` | none | authority hooks | `AppShell` | runtime, convergence, storage, and source strategy settings |
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
| `tools/gui-react/src/pages/layout/AppShell.tsx` | top-level shell, product/category context, drawers, and outlet |
| `tools/gui-react/src/pages/layout/Sidebar.tsx` | side navigation and category/product controls |
| `tools/gui-react/src/pages/layout/TabNav.tsx` | top tab strip and route labels |

## Client/Server Boundary

- Client-rendered SPA: all GUI routes render in the browser after the backend serves the built assets.
- Server-rendered content: none verified.
- Client transport:
  - REST: `tools/gui-react/src/api/client.ts`
  - WebSocket: `tools/gui-react/src/api/ws.ts`
  - GraphQL proxy client: `tools/gui-react/src/api/graphql.ts`

## Component Ownership Notes

- `tools/gui-react/src/pages/catalog/CategoryManager.tsx` re-exports `tools/gui-react/src/features/catalog/components/CategoryManager.tsx`.
- `tools/gui-react/src/pages/catalog/CatalogPage.tsx` re-exports `tools/gui-react/src/features/catalog/components/CatalogPage.tsx`.
- `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` re-exports `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx`.
- `tools/gui-react/src/pages/studio/StudioPage.tsx` re-exports `tools/gui-react/src/features/studio/components/StudioPage.tsx`.
- `tools/gui-react/src/pages/runtime-ops/RuntimeOpsPage.tsx` re-exports `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx`.
- `tools/gui-react/src/pages/review/ReviewPage.tsx` re-exports `tools/gui-react/src/features/review/components/ReviewPage.tsx`.
- `tools/gui-react/src/pages/overview/OverviewPage.tsx`, `tools/gui-react/src/pages/product/ProductPage.tsx`, `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `tools/gui-react/src/pages/billing/BillingPage.tsx`, `tools/gui-react/src/pages/storage/StoragePage.tsx`, `tools/gui-react/src/pages/test-mode/TestModePage.tsx`, and `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx` are page-local implementations rather than wrappers.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/App.tsx` | route table and shared layout |
| source | `tools/gui-react/src/pages/layout/AppShell.tsx` | shell ownership |
| source | `tools/gui-react/src/pages/layout/Sidebar.tsx` | sidebar ownership |
| source | `tools/gui-react/src/pages/layout/TabNav.tsx` | operator-facing route labels |
| source | `tools/gui-react/src/api/client.ts` | REST boundary |

## Related Documents

- [Frontend Architecture](./frontend-architecture.md) - Broader GUI framework/state/fetching context.
- [Feature Index](../04-features/feature-index.md) - Route-to-feature lookup table.
- [API Surface](../06-references/api-surface.md) - Server endpoints called by these routes.

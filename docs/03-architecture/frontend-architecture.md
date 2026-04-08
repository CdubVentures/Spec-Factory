# Frontend Architecture

> **Purpose:** Describe the verified GUI framework, rendering model, route composition, state ownership, and client-side transport boundaries with exact file paths.
> **Prerequisites:** [system-map.md](./system-map.md), [../02-dependencies/stack-and-toolchain.md](../02-dependencies/stack-and-toolchain.md)
> **Last validated:** 2026-04-07

## Framework And Rendering Model

| Concern | Live implementation | Files |
|---------|---------------------|-------|
| runtime | React 18 SPA | `tools/gui-react/src/main.tsx`, `tools/gui-react/src/App.tsx` |
| router | `HashRouter` | `tools/gui-react/src/App.tsx` |
| build tool | Vite | `tools/gui-react/vite.config.ts` |
| data fetching | TanStack React Query plus direct `fetch()` wrappers | `tools/gui-react/src/App.tsx`, `tools/gui-react/src/api/client.ts`, `tools/gui-react/src/api/graphql.ts` |
| shared client state | Zustand stores | `tools/gui-react/src/stores/*.ts` |
| realtime transport | browser `WebSocket` manager | `tools/gui-react/src/api/ws.ts` |
| rendering model | client-side rendering only | built assets served by `src/app/api/staticFileServer.js` |

There is no SSR layer, no server component tree, and no React Router data-loader stack in the live GUI.

## Route Composition

- Route and tab metadata SSOT: `tools/gui-react/src/registries/pageRegistry.ts`
- Route mounting: `tools/gui-react/src/App.tsx`
- Shared shell: `tools/gui-react/src/pages/layout/AppShell.tsx`
- Shared navigation:
  - top tabs in `tools/gui-react/src/pages/layout/TabNav.tsx`
  - sidebar in `tools/gui-react/src/pages/layout/Sidebar.tsx`
- Standalone exception:
  - `/test-mode` is mounted directly in `tools/gui-react/src/App.tsx`
  - it is intentionally excluded from `PAGE_REGISTRY`

Important constraint: the `loader` field in `PAGE_REGISTRY` is a lazy page-module import, not a React Router data loader.

## Top-Level Render Hierarchy

```text
tools/gui-react/src/main.tsx
  -> tools/gui-react/src/App.tsx
    -> QueryClientProvider
    -> HashRouter
      -> AppShell (tools/gui-react/src/pages/layout/AppShell.tsx)
        -> TabNav
        -> Sidebar
        -> Outlet
          -> registry-selected page component
```

## State Management

| State surface | Files | Responsibility |
|---------------|-------|----------------|
| UI shell state | `tools/gui-react/src/stores/uiStore.ts` | selected category, theme, and general GUI state |
| persisted toggle state | `tools/gui-react/src/stores/collapseStore.ts` | shell and panel expand/collapse state |
| persisted tab state | `tools/gui-react/src/stores/tabStore.ts` | remembers active nested tabs |
| runtime settings value map | `tools/gui-react/src/stores/runtimeSettingsValueStore.ts` | flat runtime settings authority used by multiple settings surfaces |
| settings readiness snapshot | `tools/gui-react/src/stores/settingsAuthorityStore.ts` | controls hydration-ready vs degraded-render state |
| category LLM route matrix authority | `tools/gui-react/src/stores/llmSettingsAuthority.ts` | category-scoped `llm_route_matrix` read/write surface |
| feature-local state | `tools/gui-react/src/features/**/state/*` | page-specific selectors, hooks, and derived state |

## Hydration And Shell Hooks

`tools/gui-react/src/pages/layout/AppShell.tsx` composes four shell-level hooks before rendering child pages:

| Hook | Path | Role |
|------|------|------|
| `useSettingsHydration()` | `tools/gui-react/src/pages/layout/hooks/useSettingsHydration.ts` | blocks child routes until settings are loaded or degraded render is allowed |
| `useCategorySync()` | `tools/gui-react/src/pages/layout/hooks/useCategorySync.ts` | aligns selected category and runtime process status |
| `useWsEventBridge()` | `tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts` | bridges websocket events into React Query invalidation/state updates |
| `useFieldTestNavigation()` | `tools/gui-react/src/pages/layout/hooks/useFieldTestNavigation.ts` | controls Field Test shortcut behavior |

`AppShell.tsx` also renders a "Field Audit" header button that links to `/test-mode`.

## Client Transport Boundaries

| Transport | Files | Notes |
|-----------|-------|-------|
| REST wrapper | `tools/gui-react/src/api/client.ts` | base path is `/api/v1`; exposes `get`, `post`, `put`, `del`, and parsed variants |
| GraphQL wrapper | `tools/gui-react/src/api/graphql.ts` | posts to `/api/v1/graphql` |
| WebSocket manager | `tools/gui-react/src/api/ws.ts` | connects to `/ws`, supports reconnect, reloads the page after a post-connect server restart |

## Page Ownership Pattern

| Pattern | Files | Notes |
|---------|-------|-------|
| registry-owned route inventory | `tools/gui-react/src/registries/pageRegistry.ts` | one entry per tabbed page |
| feature-owned pages | `tools/gui-react/src/features/**/components/*Page.tsx` | preferred home for complex routed surfaces |
| page wrappers / legacy pages | `tools/gui-react/src/pages/**` | still used for overview, product, billing, storage, LLM settings, and component review |
| standalone test-mode page | `tools/gui-react/src/pages/test-mode/TestModePage.tsx`, `tools/gui-react/src/pages/test-mode/FieldContractAudit.tsx`, `tools/gui-react/src/pages/test-mode/types.ts` | mounted directly in `App.tsx`, not in `PAGE_REGISTRY` |
| shell-only layout | `tools/gui-react/src/pages/layout/*` | route-independent navigation and frame |

## Feature Ownership By Route Group

| Group | Primary routes | Files |
|------|----------------|-------|
| global | `/categories`, `/brands`, `/colors`, `/billing` | `tools/gui-react/src/features/catalog/components/CategoryManager.tsx`, `tools/gui-react/src/features/studio/components/BrandManager.tsx`, `tools/gui-react/src/features/color-registry/components/ColorRegistryPage.tsx`, `tools/gui-react/src/pages/billing/BillingPage.tsx` |
| catalog | `/`, `/product`, `/catalog`, `/studio` | `tools/gui-react/src/pages/overview/OverviewPage.tsx`, `tools/gui-react/src/pages/product/ProductPage.tsx`, `tools/gui-react/src/features/catalog/components/CatalogPage.tsx`, `tools/gui-react/src/features/studio/components/StudioPage.tsx` |
| ops | `/indexing`, `/runtime-ops`, `/review`, `/review-components`, `/llm-settings`, `/storage` | `tools/gui-react/src/features/indexing/components/IndexingPage.tsx`, `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx`, `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx`, `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `tools/gui-react/src/pages/storage/StoragePage.tsx` |
| settings | `/llm-config`, `/pipeline-settings` | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx`, `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` |
| standalone | `/test-mode` | `tools/gui-react/src/pages/test-mode/TestModePage.tsx` (field contract audit; mounted in `App.tsx`, not in `PAGE_REGISTRY`) |

## Verified Constraints

- `tools/gui-react/src/pages/storage/StoragePage.tsx` is a thin wrapper over the storage-manager panel. It is not a storage-settings editor.
- `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` edits runtime settings, source strategy, and deterministic spec seeds. It does not talk to a live `/storage-settings` or `/convergence-settings` backend.
- `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` owns the global composite LLM policy surface.
- `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` separately owns category-scoped `llm_route_matrix` editing.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/main.tsx` | React entrypoint and tooltip/theme bootstrap |
| source | `tools/gui-react/src/App.tsx` | `HashRouter`, `QueryClientProvider`, lazy route mounting, standalone `/test-mode` |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | route inventory, tab groups, and lazy module imports |
| source | `tools/gui-react/src/pages/layout/AppShell.tsx` | shared shell composition and hydration gate |
| source | `tools/gui-react/src/pages/layout/TabNav.tsx` | top navigation derivation and LLM/Serper status chips |
| source | `tools/gui-react/src/pages/layout/hooks/useSettingsHydration.ts` | settings hydration boundary |
| source | `tools/gui-react/src/api/client.ts` | REST transport base path and helper methods |
| source | `tools/gui-react/src/api/graphql.ts` | GraphQL transport path |
| source | `tools/gui-react/src/api/ws.ts` | websocket lifecycle and reconnect behavior |
| source | `tools/gui-react/src/pages/storage/StoragePage.tsx` | storage page ownership |
| source | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` | runtime/source-strategy/spec-seed ownership |
| source | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | composite LLM policy ownership |

## Related Documents

- [Routing and GUI](./routing-and-gui.md) - Full route map, layouts, and page ownership detail.
- [Backend Architecture](./backend-architecture.md) - Server surfaces that these client routes call.
- [Feature Index](../04-features/feature-index.md) - Feature-level lookup table tied to the routed pages.
- [Conventions](../01-project-overview/conventions.md) - Registry-first routing and feature ownership rules.

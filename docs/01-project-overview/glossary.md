# Glossary

> **Purpose:** Define project-specific domain terms and overloaded words that would otherwise cause an arriving LLM to hallucinate generic meanings.
> **Prerequisites:** [scope.md](./scope.md)
> **Last validated:** 2026-03-23

| Term | Meaning in this repo | Primary evidence |
|------|----------------------|------------------|
| Spec Factory | The overall local workbench: GUI, API, CLI, SQLite, and authority content | `package.json`, `src/api/guiServer.js` |
| IndexLab | The run-centric indexing workflow and artifact model surfaced in GUI/API/CLI | `src/features/indexing/api/indexlabRoutes.js`, `src/cli/spec.js` |
| NeedSet | The run-time set of missing/required fields used to drive discovery and extraction planning | `src/features/indexing/api/indexlabRoutes.js`, `src/indexlab/` |
| Search Profile | The planned query/alias profile for an IndexLab run | `src/features/indexing/api/indexlabRoutes.js`, `tools/gui-react/src/features/runtime-ops/panels/prefetch/PrefetchSearchProfilePanel.tsx` |
| Runtime Ops | The GUI/API surface that visualizes live run workers, documents, extraction state, and queue state | `src/features/indexing/api/runtimeOpsRoutes.js`, `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx` |
| Field Rules Studio | The authoring surface for field rules, mappings, tooltips, component DBs, and compile actions | `src/features/studio/api/studioRoutes.js`, `tools/gui-react/src/features/studio/components/StudioPage.tsx` |
| Category authority | Authored category content stored under `category_authority/` and read by the runtime | `src/categories/loader.js`, `category_authority/` |
| Authority snapshot | The API payload that summarizes category compile/sync state and observability counters | `src/features/category-authority/api/dataAuthorityRoutes.js` |
| SpecDb | The SQLite composition root class that owns all local persistence | `src/db/specDb.js`, `src/db/DOMAIN.md` |
| Review grid | The product-field review workflow for accepting/manual-overriding extracted candidate values | `src/features/review/api/reviewRoutes.js`, `tools/gui-react/src/features/review/components/ReviewPage.tsx` |
| Component review | The review workflow for component identities and component-linked fields | `src/features/review/api/reviewRoutes.js`, `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx` |
| Enum review | The review workflow for enumerated value catalogs and enum consistency suggestions | `src/features/review/api/reviewRoutes.js`, `tools/gui-react/src/pages/component-review/EnumSubTab.tsx` |
| Runtime settings | Persisted user-editable operational settings exposed at `/api/v1/runtime-settings` | `src/features/settings/api/configRoutes.js`, `src/features/settings-authority/runtimeSettingsRouteGet.js` |
| Convergence settings | Persisted user-editable scoring/round/consensus settings exposed at `/api/v1/convergence-settings` | `src/features/settings/api/configRoutes.js`, `src/features/settings-authority/convergenceSettingsRouteContract.js` |
| Source strategy | Per-category source/discovery policy records exposed at `/api/v1/source-strategy` | `src/features/indexing/api/sourceStrategyRoutes.js` |
| Run data storage | Optional relocation/archive destination for run artifacts separate from the default local output root | `src/api/guiServer.js`, `src/api/services/runDataRelocationService.js` |
| Test mode | GUI/API surface for generating deterministic category fixtures and validation runs | `src/app/api/routes/testModeRoutes.js`, `tools/gui-react/src/pages/test-mode/TestModePage.tsx` |
| Pipeline context schema | Zod schema with 8 progressive checkpoints that validates the context object threading through discovery pipeline stages | `src/features/indexing/discovery/pipelineContextSchema.js` |
| Crawl module | Plugin-based browser automation module that opens pages, bypasses blocks, captures screenshots, and records to frontier DB. Replaces the former extraction pipeline | `src/features/crawl/index.js`, `src/features/crawl/README.md` |
| Crawl session | A persistent browser instance managed by the crawl module; one browser per session, never per-URL | `src/features/crawl/crawlSession.js` |
| Plugin runner | Sequential plugin lifecycle manager for crawl hooks (stealth, auto-scroll, extensible) | `src/features/crawl/core/pluginRunner.js` |
| Frontier DB | URL-level crawl state persistence with cooldown, replay, and rate-limiting support | used by `src/pipeline/runCrawlProcessingLifecycle.js` |
| Catalog product row | The per-product SpecDb row upserted when catalog products are added or updated, linking catalog identity to DB state | `src/features/catalog/products/upsertCatalogProductRow.js` |
| LLM Config | The GUI page for per-category LLM route matrix configuration, distinct from the LLM Settings page that manages global model routing | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/features/indexing/api/indexlabRoutes.js` | IndexLab, NeedSet, Search Profile terminology |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | Runtime Ops naming and payload surfaces |
| source | `src/features/studio/api/studioRoutes.js` | Field Rules Studio terminology |
| source | `src/features/review/api/reviewRoutes.js` | Review grid, component review, and enum review naming |
| source | `src/features/category-authority/api/dataAuthorityRoutes.js` | Authority snapshot semantics |

## Related Documents

- [Feature Index](../04-features/feature-index.md) - Uses these terms as the feature lookup table.
- [Data Model](../03-architecture/data-model.md) - Maps glossary terms to SQLite tables and authority state.
- [Routing and GUI](../03-architecture/routing-and-gui.md) - Shows where glossary terms appear in the operator GUI.

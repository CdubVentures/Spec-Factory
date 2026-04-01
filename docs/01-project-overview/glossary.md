# Glossary

> **Purpose:** Define project-specific domain terms and overloaded words that would otherwise cause an arriving LLM to hallucinate generic meanings.
> **Prerequisites:** [scope.md](./scope.md)
> **Last validated:** 2026-03-31

| Term | Meaning in this repo | Primary evidence |
|------|----------------------|------------------|
| Spec Factory | The overall local workbench: GUI, API, CLI, SQLite, and authority content | `package.json`, `src/api/guiServerRuntime.js` |
| AppDb | Global cross-category SQLite database at `.workspace/db/app.sqlite` for brands, settings, and studio maps | `src/db/appDb.js`, `src/db/appDbSchema.js`, `src/api/bootstrap/createBootstrapSessionLayer.js` |
| SpecDb | Per-category SQLite database at `.workspace/db/<category>/spec.sqlite` used by review, studio, indexing, and runtime queries | `src/db/specDb.js`, `src/app/api/specDbRuntime.js` |
| IndexLab | Run-centric indexing workflow and run-artifact API family | `src/features/indexing/api/indexlabRoutes.js`, `src/indexlab/` |
| Runtime Ops | GUI/API surface for worker, document, prefetch, queue, and screencast telemetry for a run | `src/features/indexing/api/runtimeOpsRoutes.js`, `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx` |
| NeedSet | Missing/required-field planning data derived for an indexing run | `src/features/indexing/api/indexlabRoutes.js`, `src/indexlab/` |
| Search Profile | Query-planning profile exposed from run artifacts and Runtime Ops panels | `src/features/indexing/api/indexlabRoutes.js`, `tools/gui-react/src/features/runtime-ops/panels/prefetch/PrefetchSearchProfilePanel.tsx` |
| Field Rules Studio | Authoring surface for field rules, studio maps, tooltips, and component DB projections | `src/features/studio/api/studioRoutes.js`, `tools/gui-react/src/features/studio/components/StudioPage.tsx` |
| Category authority | Authored control-plane content stored under `category_authority/` | `src/categories/loader.js`, `category_authority/` |
| Authority snapshot | API payload summarizing category compile, sync, and observability state | `src/features/category-authority/api/dataAuthorityRoutes.js` |
| Source strategy | Per-category source-entry records stored in `category_authority/<category>/sources.json` and exposed via `/api/v1/source-strategy` | `src/features/indexing/api/sourceStrategyRoutes.js`, `src/features/indexing/sources/sourceFileService.js` |
| Spec seeds | Per-category deterministic query templates stored in `category_authority/<category>/spec_seeds.json` and exposed via `/api/v1/spec-seeds` | `src/features/indexing/api/specSeedsRoutes.js`, `src/features/indexing/sources/specSeedsFileService.js` |
| Review grid | Scalar product-field review workflow | `src/features/review/api/reviewRoutes.js`, `tools/gui-react/src/features/review/components/ReviewPage.tsx` |
| Component review | Review workflow for component identities and component-linked fields | `src/features/review/api/reviewRoutes.js`, `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx` |
| Enum review | Review workflow for enum catalogs and enum-consistency suggestions | `src/features/review/api/reviewRoutes.js`, `tools/gui-react/src/pages/component-review/EnumSubTab.tsx` |
| Runtime settings | Flat operator-editable settings exposed at `/api/v1/runtime-settings` | `src/features/settings/api/configRuntimeSettingsHandler.js` |
| UI settings | Persisted GUI autosave toggles exposed at `/api/v1/ui-settings` | `src/features/settings/api/configUiSettingsHandler.js` |
| LLM Settings | Category-scoped `llm_route_matrix` editor persisted through `/api/v1/llm-settings/:category/routes` | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `src/features/settings/api/configLlmSettingsHandler.js` |
| LLM Config | Global composite `LlmPolicy` editor persisted through `/api/v1/llm-policy`; the page also reads `/api/v1/indexing/llm-config` metadata | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx`, `src/features/settings-authority/llmPolicyHandler.js`, `src/features/settings/api/configIndexingMetricsHandler.js` |
| Storage Manager | GUI/API surface for run inventory, delete, prune, purge, and export under `/api/v1/storage/*` | `tools/gui-react/src/features/storage-manager/components/StorageManagerPanel.tsx`, `src/features/indexing/api/storageManagerRoutes.js` |
| Test mode | GUI/API surface for creating `_test_*` categories, generating fixtures, attempting runs, and validating results | `src/app/api/routes/testModeRoutes.js`, `tools/gui-react/src/pages/test-mode/TestModePage.tsx` |
| Crawl module | Plugin-based browser automation subsystem that replaced the older extraction-heavy pipeline | `src/features/crawl/index.js`, `src/features/crawl/README.md` |
| Frontier DB / Crawl ledger | URL-level crawl state persistence adapter used during crawl execution; currently built through `createCrawlLedgerAdapter()` and consumed by `session.runFetchPlan()` | `src/features/indexing/orchestration/shared/crawlLedgerAdapter.js`, `src/pipeline/runProduct.js`, `src/features/crawl/crawlSession.js` |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/db/appDb.js` | AppDb meaning and location |
| source | `src/db/specDb.js` | SpecDb meaning |
| source | `src/features/indexing/api/indexlabRoutes.js` | IndexLab, NeedSet, and Search Profile terminology |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | Runtime Ops naming |
| source | `src/features/studio/api/studioRoutes.js` | Field Rules Studio terminology |
| source | `src/features/review/api/reviewRoutes.js` | review-grid, component-review, and enum-review naming |
| source | `src/features/indexing/api/sourceStrategyRoutes.js` | source strategy terminology |
| source | `src/features/indexing/api/specSeedsRoutes.js` | deterministic spec-seed terminology |
| source | `src/features/settings-authority/llmPolicyHandler.js` | composite LLM policy terminology |
| source | `tools/gui-react/src/features/storage-manager/components/StorageManagerPanel.tsx` | Storage Manager naming |

## Related Documents

- [Feature Index](../04-features/feature-index.md) - Maps these terms to concrete feature docs.
- [Data Model](../03-architecture/data-model.md) - Maps the DB-related glossary terms to actual tables.
- [Routing and GUI](../03-architecture/routing-and-gui.md) - Shows where these terms surface in the GUI.

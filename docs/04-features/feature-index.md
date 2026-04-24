# Feature Index

> **Purpose:** Provide the verified lookup table of first-class operator features in the live system.
> **Prerequisites:** [../03-architecture/system-map.md](../03-architecture/system-map.md), [../03-architecture/routing-and-gui.md](../03-architecture/routing-and-gui.md)
> **Last validated:** 2026-04-10

## First-Class Features

| Feature | Description | Doc link | Key files |
|---------|-------------|----------|-----------|
| Category Authority | Exposes authority freshness and category control-plane state that drives compile/sync visibility. | [category-authority.md](./category-authority.md) | `src/features/category-authority/api/dataAuthorityRoutes.js`, `tools/gui-react/src/hooks/authoritySnapshotHelpers.js` |
| Catalog and Product Selection | Manages categories, products, brands, queue seeding, and product identity surfaces. | [catalog-and-product-selection.md](./catalog-and-product-selection.md) | `src/features/catalog/api/catalogRoutes.js`, `src/features/catalog/api/brandRoutes.js`, `tools/gui-react/src/features/catalog/components/CatalogPage.tsx` |
| Overview Command Console | Bulk-action surface on the Overview page: row selection, per-finder fan-out, smart-select, Score Card column, and the full-pipeline orchestrator. | [overview-command-console.md](./overview-command-console.md) | `tools/gui-react/src/pages/overview/OverviewPage.tsx`, `tools/gui-react/src/pages/overview/CommandConsole.tsx`, `tools/gui-react/src/pages/overview/SelectionStrip.tsx`, `tools/gui-react/src/pages/overview/usePipelineController.ts` |
| Color Registry | Manages the global AppDb-backed color registry and product-scoped color-edition discovery flows. | [color-registry.md](./color-registry.md) | `src/features/color-registry/api/colorRoutes.js`, `src/features/color-edition/api/colorEditionFinderRoutes.js`, `tools/gui-react/src/features/color-registry/components/ColorRegistryPage.tsx` |
| Unit Registry | Manages canonical units, synonyms, and conversions used by publisher unit validation. | [unit-registry.md](./unit-registry.md) | `src/features/unit-registry/api/unitRegistryRoutes.js`, `src/field-rules/unitRegistry.js`, `tools/gui-react/src/pages/unit-registry/UnitRegistryPage.tsx` |
| Field Rules Studio | Authors and validates field studio maps, known values, component DB views, and compile actions. | [field-rules-studio.md](./field-rules-studio.md) | `src/features/studio/api/studioRoutes.js`, `tools/gui-react/src/features/studio/components/StudioPage.tsx` |
| Indexing Lab | Starts indexing runs, replays run artifacts, and exposes crawl/search/runtime telemetry for a run. | [indexing-lab.md](./indexing-lab.md) | `src/features/indexing/api/indexlabRoutes.js`, `src/app/api/processRuntime.js`, `tools/gui-react/src/features/indexing/components/IndexingPage.tsx` |
| Runtime Ops | Reads worker, document, queue, screencast, and runtime telemetry for a selected run. | [runtime-ops.md](./runtime-ops.md) | `src/features/indexing/api/runtimeOpsRoutes.js`, `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx` |
| Publisher | Serves the category-scoped candidate audit log built from publisher validation output already persisted in SpecDb. | [publisher.md](./publisher.md) | `src/features/publisher/api/publisherRoutes.js`, `src/features/publisher/index.js`, `tools/gui-react/src/pages/publisher/PublisherPage.tsx` |
| Review Workbench | Serves scalar, component, and enum review payloads and applies human/AI review mutations. | [review-workbench.md](./review-workbench.md) | `src/features/review/api/reviewRoutes.js`, `src/features/review/api/itemMutationRoutes.js`, `tools/gui-react/src/features/review/components/ReviewPage.tsx` |
| LLM Policy and Provider Config | Edits the global composite LLM policy, provider registry, phase overrides, and budget/token settings. | [llm-policy-and-provider-config.md](./llm-policy-and-provider-config.md) | `src/features/settings-authority/llmPolicyHandler.js`, `src/core/llm/providerMeta.js`, `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` |
| Pipeline and Runtime Settings | Edits runtime settings plus file-backed source strategy and deterministic spec seeds. | [pipeline-and-runtime-settings.md](./pipeline-and-runtime-settings.md) | `src/features/settings/api/configRoutes.js`, `src/features/indexing/api/sourceStrategyRoutes.js`, `src/features/indexing/api/specSeedsRoutes.js`, `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` |
| Billing and Learning | Global LLM cost analytics via 6 `/billing/global/*` endpoints. Billing data in global `app.sqlite`, dual-written to JSONL. | [billing-and-learning.md](./billing-and-learning.md) | `src/features/indexing/api/queueBillingLearningRoutes.js`, `src/db/appDb.js`, `src/billing/costLedger.js`, `tools/gui-react/src/pages/billing/BillingPage.tsx` |
| Storage and Run Data | Inspects run inventory and performs delete, prune, purge, and export operations through `/storage/*`. | [storage-and-run-data.md](./storage-and-run-data.md) | `src/features/indexing/api/storageManagerRoutes.js`, `src/core/storage/storage.js`, `tools/gui-react/src/pages/storage/StoragePage.tsx` |
| Test Mode | Creates `_test_*` categories, generates synthetic products, attempts runs, and validates field-contract outcomes. | [test-mode.md](./test-mode.md) | `src/app/api/routes/testModeRoutes.js`, `src/tests/fieldContractTestRunner.js`, `tools/gui-react/src/pages/test-mode/TestModePage.tsx` |

## Supporting Backend-Only Feature Boundaries

These directories exist under `src/features/` but are not first-class operator docs in this folder because they are support boundaries rather than standalone GUI/API features.

| Boundary | Why it is not a standalone feature doc | Key files |
|----------|----------------------------------------|-----------|
| `crawl` | internal crawl/fetch orchestration used by Indexing Lab | `src/features/crawl/index.js`, `src/features/crawl/crawlSession.js` |
| `extraction` | internal screenshot/video/HTML extraction used by the pipeline | `src/features/extraction/index.js`, `src/features/extraction/core/extractionRunner.js` |
| `review-curation` | backward-compatibility barrel over `src/features/review/` | `src/features/review-curation/index.js` |

## Coverage Notes

- `src/features/` currently contains 14 top-level feature directories.
- This folder now documents 15 first-class operator features (14 backend-rooted plus the GUI-only Overview Command Console at `tools/gui-react/src/pages/overview/`).
- There is no verified standalone auth feature. Auth/session behavior is absent from the current runtime.
- `pageRegistry.ts` is the tabbed GUI feature map; `/test-mode` is the only first-class route mounted outside that registry.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/registries/pageRegistry.ts` | first-class tabbed GUI pages and route ownership |
| source | `tools/gui-react/src/App.tsx` | standalone `test-mode` route plus registry mounting |
| source | `src/app/api/guiServerRuntime.js` | live mounted route families and feature ownership |
| source | `src/features/unit-registry/api/unitRegistryRoutes.js` | unit registry operator surface |
| source | `src/features/publisher/api/publisherRoutes.js` | publisher operator surface |
| source | `src/features/indexing/api/specSeedsRoutes.js` | deterministic spec-seed feature surface |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage-manager feature surface |
| source | `src/features/settings-authority/llmPolicyHandler.js` | composite LLM policy feature surface |
| filesystem | `src/features/` | current top-level backend feature directories |

## Related Documents

- [Routing and GUI](../03-architecture/routing-and-gui.md) - maps these features onto concrete GUI routes.
- [API Surface](../06-references/api-surface.md) - lists the exact HTTP endpoints each feature uses.
- [Canonical Examples](../07-patterns/canonical-examples.md) - shows the repo-native extension patterns used by these features.

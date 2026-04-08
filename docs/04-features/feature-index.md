# Feature Index

> **Purpose:** Provide the verified lookup table of first-class product, authoring, runtime, and review features in the live system.
> **Prerequisites:** [../03-architecture/system-map.md](../03-architecture/system-map.md), [../03-architecture/routing-and-gui.md](../03-architecture/routing-and-gui.md)
> **Last validated:** 2026-04-07

| Feature | Description | Doc link | Key files |
|---------|-------------|----------|-----------|
| Category Authority Snapshot | Exposes authority/version state for a category and drives downstream cache invalidation. | [category-authority.md](./category-authority.md) | `src/features/category-authority/api/dataAuthorityRoutes.js`, `tools/gui-react/src/hooks/authoritySnapshotHelpers.js` |
| Catalog and Product Selection | Manages categories, products, brands, queue seeding, and product identity surfaces. | [catalog-and-product-selection.md](./catalog-and-product-selection.md) | `src/features/catalog/api/catalogRoutes.js`, `src/features/catalog/api/brandRoutes.js`, `tools/gui-react/src/features/catalog/components/CatalogPage.tsx` |
| Color Registry | Manages the global AppDb-backed color registry and the per-product color-edition finder history surfaced from the Indexing page. | [color-registry.md](./color-registry.md) | `src/features/color-registry/api/colorRoutes.js`, `src/features/color-edition/api/colorEditionFinderRoutes.js`, `tools/gui-react/src/features/color-registry/components/ColorRegistryPage.tsx`, `tools/gui-react/src/features/color-edition-finder/components/ColorEditionFinderPanel.tsx` |
| Field Rules Studio | Authors and validates field studio maps, known values, component DB views, and compile actions. CLI simplified to `compile-rules` and `validate-rules` only. | [field-rules-studio.md](./field-rules-studio.md) | `src/features/studio/api/studioRoutes.js`, `tools/gui-react/src/features/studio/components/StudioPage.tsx` |
| Indexing Lab | Starts indexing runs, replays run artifacts, and exposes crawl/search/runtime telemetry for a run. | [indexing-lab.md](./indexing-lab.md) | `src/features/indexing/api/indexlabRoutes.js`, `src/app/api/processRuntime.js`, `tools/gui-react/src/features/indexing/components/IndexingPage.tsx` |
| LLM Policy and Provider Config | Edits the global composite LLM policy, provider registry, phase overrides, and budget/token settings through `/llm-policy` plus `/indexing/llm-config` metadata. | [llm-policy-and-provider-config.md](./llm-policy-and-provider-config.md) | `src/features/settings-authority/llmPolicyHandler.js`, `src/core/llm/llmPolicySchema.js`, `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` |
| Pipeline and Runtime Settings | Edits runtime settings plus file-backed source strategy and deterministic spec seeds; category LLM route matrices remain adjacent through `/llm-settings`. | [pipeline-and-runtime-settings.md](./pipeline-and-runtime-settings.md) | `src/features/settings/api/configRoutes.js`, `src/features/indexing/api/sourceStrategyRoutes.js`, `src/features/indexing/api/specSeedsRoutes.js`, `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` |
| Runtime Ops Workbench | Reads worker, document, queue, screencast, and runtime telemetry for a selected run. | [runtime-ops.md](./runtime-ops.md) | `src/features/indexing/api/runtimeOpsRoutes.js`, `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx` |
| Review Workbench | Serves scalar, component, and enum review payloads and applies human/AI review mutations. Override functions no longer write directly to DB; overrides persist to JSON SSOT and sync through the publisher pipeline. | [review-workbench.md](./review-workbench.md) | `src/features/review/api/reviewRoutes.js`, `src/features/review/api/itemMutationRoutes.js`, `tools/gui-react/src/features/review/components/ReviewPage.tsx` |
| Billing and Learning | Surfaces accumulated LLM cost artifacts and learning outputs derived from completed runs. | [billing-and-learning.md](./billing-and-learning.md) | `src/features/indexing/api/queueBillingLearningRoutes.js`, `tools/gui-react/src/pages/billing/BillingPage.tsx` |
| Storage and Run Data | Inspects run inventory and performs delete, prune, purge, and export operations through `/storage/*`; the inventory surface currently reports a local backend rooted at the IndexLab runs directory. | [storage-and-run-data.md](./storage-and-run-data.md) | `src/features/indexing/api/storageManagerRoutes.js`, `src/core/storage/storage.js`, `tools/gui-react/src/pages/storage/StoragePage.tsx`, `tools/gui-react/src/features/storage-manager/components/StorageManagerPanel.tsx` |
| Test Mode / Field Contract Audit | Creates `_test_*` categories, generates synthetic products, attempts runs, and validates outcomes. Includes field contract audit surface that merges compiled known_values with discovered enums before audit. | [test-mode.md](./test-mode.md) | `src/app/api/routes/testModeRoutes.js`, `src/tests/fieldContractTestRunner.js`, `tools/gui-react/src/pages/test-mode/TestModePage.tsx`, `tools/gui-react/src/pages/test-mode/FieldContractAudit.tsx` |

## Coverage Notes

- There is no verified standalone auth feature. Auth/session behavior is absent from the current runtime.
- `pageRegistry.ts` is the tabbed GUI feature map; `/test-mode` is the only first-class route mounted outside that registry.
- `/colors` is a global registry page, but color-edition discovery is product-scoped and currently embedded on `tools/gui-react/src/features/indexing/components/IndexingPage.tsx`.
- `LlmSettingsPage` and `LlmConfigPage` are separate feature surfaces:
  - `LlmSettingsPage` edits category-scoped route matrices in SpecDb.
  - `LlmConfigPage` edits the global composite policy backed by managed runtime keys.
- The storage page is no longer a storage-settings editor. It is a storage-manager view over `/api/v1/storage/*`.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/registries/pageRegistry.ts` | first-class tabbed GUI pages and route ownership |
| source | `tools/gui-react/src/App.tsx` | standalone `test-mode` route plus registry mounting |
| source | `src/app/api/guiServerRuntime.js` | live mounted route families and feature ownership |
| source | `src/features/color-registry/api/colorRoutes.js` | global color CRUD feature surface |
| source | `src/features/color-edition/api/colorEditionFinderRoutes.js` | product-scoped color-edition finder feature surface |
| source | `src/features/indexing/api/specSeedsRoutes.js` | deterministic spec-seed feature surface |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage-manager feature surface |
| source | `src/features/settings-authority/llmPolicyHandler.js` | composite LLM policy feature surface |

## Related Documents

- [Routing and GUI](../03-architecture/routing-and-gui.md) - Maps these features onto concrete GUI routes.
- [API Surface](../06-references/api-surface.md) - Lists the exact HTTP endpoints each feature uses.

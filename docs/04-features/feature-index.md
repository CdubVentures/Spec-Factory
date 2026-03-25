# Feature Index

> **Purpose:** Provide the verified lookup table of first-class product, authoring, runtime, and review features in the live system.
> **Prerequisites:** [../03-architecture/system-map.md](../03-architecture/system-map.md), [../03-architecture/routing-and-gui.md](../03-architecture/routing-and-gui.md)
> **Last validated:** 2026-03-25

| Feature | Description | Doc link | Key files |
|---------|-------------|----------|-----------|
| Category Authority Snapshot | Exposes authority/version state for a category and drives downstream cache invalidation. | [category-authority.md](./category-authority.md) | `src/features/category-authority/api/dataAuthorityRoutes.js`, `tools/gui-react/src/hooks/authoritySnapshotHelpers.js` |
| Catalog and Product Selection | Manages categories, products, brands, queue seeding, and product identity surfaces. | [catalog-and-product-selection.md](./catalog-and-product-selection.md) | `src/features/catalog/api/catalogRoutes.js`, `src/features/catalog/api/brandRoutes.js`, `tools/gui-react/src/features/catalog/components/CatalogPage.tsx` |
| Field Rules Studio | Authors and validates field studio maps, known values, component DB views, and compile actions. | [field-rules-studio.md](./field-rules-studio.md) | `src/features/studio/api/studioRoutes.js`, `tools/gui-react/src/features/studio/components/StudioPage.tsx` |
| Indexing Lab | Starts index runs, replays run artifacts, and exposes needset/search/extraction telemetry. | [indexing-lab.md](./indexing-lab.md) | `src/features/indexing/api/indexlabRoutes.js`, `src/app/api/processRuntime.js`, `tools/gui-react/src/features/indexing/components/IndexingPage.tsx` |
| LLM Policy and Provider Config | Edits the global LLM policy, provider registry, phase overrides, and budget/token settings through `/llm-policy` plus read-only `/indexing/llm-config` metadata. | [llm-policy-and-provider-config.md](./llm-policy-and-provider-config.md) | `src/features/settings-authority/llmPolicyHandler.js`, `src/core/llm/llmPolicySchema.js`, `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` |
| Pipeline and Runtime Settings | Persists runtime, UI, storage, deterministic spec-seed, source-strategy, and category LLM route-matrix settings through the settings-authority plus indexing control-plane APIs. | [pipeline-and-runtime-settings.md](./pipeline-and-runtime-settings.md) | `src/features/settings/api/configRoutes.js`, `src/features/indexing/api/sourceStrategyRoutes.js`, `src/features/indexing/api/specSeedsRoutes.js`, `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` |
| Runtime Ops Workbench | Reads run-time worker, document, screencast, and pipeline telemetry for a selected run. | [runtime-ops.md](./runtime-ops.md) | `src/features/indexing/api/runtimeOpsRoutes.js`, `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx` |
| Review Workbench | Serves scalar, component, and enum review payloads and applies human/AI review mutations. | [review-workbench.md](./review-workbench.md) | `src/features/review/api/reviewRoutes.js`, `src/features/review/api/itemMutationRoutes.js`, `tools/gui-react/src/features/review/components/ReviewPage.tsx` |
| Billing and Learning | Surfaces accumulated LLM cost artifacts and learning outputs derived from completed runs. | [billing-and-learning.md](./billing-and-learning.md) | `src/features/indexing/api/queueBillingLearningRoutes.js`, `tools/gui-react/src/pages/billing/BillingPage.tsx` |
| Storage and Run Data | Configures where run outputs land, inventories archived runs, and performs storage maintenance/sync operations. | [storage-and-run-data.md](./storage-and-run-data.md) | `src/api/services/runDataRelocationService.js`, `src/features/indexing/api/storageManagerRoutes.js`, `src/s3/storage.js`, `tools/gui-react/src/pages/storage/StoragePage.tsx`, `tools/gui-react/src/features/storage-manager/components/StorageManagerPanel.tsx` |
| Test Mode | Creates `_test_*` categories, generates synthetic products, runs them, and validates outcomes. | [test-mode.md](./test-mode.md) | `src/app/api/routes/testModeRoutes.js`, `tools/gui-react/src/pages/test-mode/TestModePage.tsx` |

## Coverage Notes

- There is no verified standalone auth feature. Auth-related config keys exist, but the live GUI/API runtime does not enforce login/session checks.
- Source strategy is documented inside pipeline/runtime settings and references because it is configured from the settings/control-plane side rather than exposed as a separate user-facing page.
- Tabbed GUI feature routes are enumerated in `tools/gui-react/src/registries/pageRegistry.ts`; `/test-mode` is the deliberate exception mounted directly in `tools/gui-react/src/App.tsx`.
- `LlmSettingsPage` and `LlmConfigPage` are separate features:
  - `LlmSettingsPage` edits category-scoped route matrices in SQLite.
  - `LlmConfigPage` edits the global composite policy backed by managed runtime keys.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/registries/pageRegistry.ts` | first-class tabbed GUI pages and route ownership |
| source | `tools/gui-react/src/App.tsx` | standalone `test-mode` route plus registry mounting |
| source | `src/api/guiServerRuntime.js` | live mounted route families and feature ownership |
| source | `src/features/catalog/README.md` | catalog feature boundary |
| source | `src/features/indexing/README.md` | indexing feature boundary |
| source | `src/features/indexing/api/specSeedsRoutes.js` | deterministic spec-seed feature surface under pipeline settings |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage-manager feature surface under the storage page |
| source | `src/features/review/README.md` | review feature boundary |
| source | `src/features/studio/README.md` | studio feature boundary |

## Related Documents

- [Routing and GUI](../03-architecture/routing-and-gui.md) - Maps these features onto concrete GUI routes.
- [API Surface](../06-references/api-surface.md) - Lists the exact HTTP endpoints each feature uses.

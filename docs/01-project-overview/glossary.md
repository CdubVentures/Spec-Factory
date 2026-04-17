# Glossary

> **Purpose:** Define project-specific terms and overloaded names so an arriving LLM does not substitute generic meanings.
> **Prerequisites:** [scope.md](./scope.md), [folder-map.md](./folder-map.md)
> **Last validated:** 2026-04-10

| Term | Meaning in this repo | Primary files |
|------|----------------------|---------------|
| Spec Factory | The full local workbench: Node GUI/API server, React GUI, CLI, SQLite stores, and authored category authority content | `package.json`, `src/app/api/guiServer.js`, `src/app/cli/spec.js` |
| AppDb | Global SQLite database at `.workspace/db/app.sqlite` for shared state such as settings, brands, colors, units, and studio maps | `src/db/appDb.js`, `src/db/appDbSchema.js`, `src/app/api/bootstrap/createBootstrapSessionLayer.js` |
| SpecDb | Per-category SQLite database at `.workspace/db/<category>/spec.sqlite` used by review, indexing, authority reseed, publisher audit, and category-scoped settings | `src/db/specDb.js`, `src/db/specDbSchema.js`, `src/app/api/specDbRuntime.js` |
| IndexLab | Run-centric indexing surface: `/api/v1/indexlab/*` plus the GUI/CLI workflows that inspect and launch crawl runs | `src/features/indexing/api/indexlabRoutes.js`, `tools/gui-react/src/features/indexing/components/IndexingPage.tsx`, `src/app/cli/commands/pipelineCommands.js` |
| Storage Manager | The `/api/v1/storage/*` inventory and deletion surface mounted inside the IndexLab route family | `src/features/indexing/api/indexlabRoutes.js`, `src/features/indexing/api/storageManagerRoutes.js`, `tools/gui-react/src/features/storage-manager/` |
| Runtime Ops | The GUI/API surface for process status, run telemetry, screencasts, and runtime diagnostics | `src/features/indexing/api/runtimeOpsRoutes.js`, `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx` |
| Category authority | Authored control-plane files under `category_authority/` that define category-specific sources, seeds, maps, and helper content | `category_authority/`, `src/categories/loader.js` |
| Source strategy | Per-category source-entry configuration stored in `category_authority/<category>/sources.json` and exposed by `/api/v1/source-strategy` | `src/features/indexing/api/sourceStrategyRoutes.js`, `src/features/indexing/sources/sourceFileService.js` |
| Spec seeds | Per-category deterministic seed-query configuration stored in `category_authority/<category>/spec_seeds.json` and exposed by `/api/v1/spec-seeds` | `src/features/indexing/api/specSeedsRoutes.js`, `src/features/indexing/sources/specSeedsFileService.js` |
| Field Rules Studio | The authoring surface for field rules, maps, tooltips, component projections, and related authority artifacts | `src/features/studio/api/studioRoutes.js`, `tools/gui-react/src/features/studio/components/StudioPage.tsx` |
| Review grid | Product-field review workflow for scalar field decisions | `src/features/review/api/reviewRoutes.js`, `tools/gui-react/src/features/review/components/ReviewPage.tsx` |
| Component review | Review workflow for shared/component-backed review items | `src/features/review/api/reviewRoutes.js`, `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx` |
| Enum review | Review workflow for enum-backed review items and catalog suggestions | `src/features/review/api/reviewRoutes.js`, `tools/gui-react/src/pages/component-review/EnumSubTab.tsx` |
| LLM policy | The composite global provider/model policy returned by `/api/v1/llm-policy` and edited in the GUI LLM config surface | `src/features/settings-authority/llmPolicyHandler.js`, `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` |
| Runtime settings | Flat operator-editable runtime settings returned by `/api/v1/runtime-settings` | `src/features/settings/api/configRuntimeSettingsHandler.js` |
| UI settings | Persisted GUI autosave/settings toggles returned by `/api/v1/ui-settings` | `src/features/settings/api/configUiSettingsHandler.js` |
| Unit Registry | Global managed table of canonical units, synonyms, and conversions used by publisher unit validation and exposed at `/#/units` | `src/features/unit-registry/api/unitRegistryRoutes.js`, `tools/gui-react/src/pages/unit-registry/UnitRegistryPage.tsx`, `src/field-rules/unitRegistry.js` |
| NeedSet | Missing/required-field planning payload for an IndexLab run | `src/features/indexing/api/indexlabRoutes.js` |
| Search profile | Search-planning payload recorded per run and surfaced through IndexLab APIs and runtime panels | `src/features/indexing/api/indexlabRoutes.js`, `tools/gui-react/src/features/runtime-ops/panels/prefetch/PrefetchSearchProfilePanel.tsx` |
| Test mode | Isolated test-category tooling exposed through the standalone `/test-mode` GUI route and matching backend routes | `tools/gui-react/src/pages/test-mode/TestModePage.tsx`, `src/app/api/routes/testModeRoutes.js` |
| Color registry | Shared global color registry backed by AppDb and a JSON mirror under `_global` authority content | `src/features/color-registry/api/colorRoutes.js`, `tools/gui-react/src/features/color-registry/components/ColorRegistryPage.tsx` |
| Color edition finder | LLM-assisted color-edition lookup surface embedded alongside color workflows | `src/features/color-edition/api/colorEditionFinderRoutes.js`, `tools/gui-react/src/features/color-edition-finder/components/ColorEditionFinderPanel.tsx` |
| Discovery enums | Self-tightening vocabulary: pipeline-discovered enum values merged with curated `known_values` for validation | `src/features/publisher/buildDiscoveredEnumMap.js`, `src/features/publisher/validation/mergeDiscoveredEnums.js`, `src/features/publisher/persistDiscoveredValues.js` |
| Field contract audit | Automated test harness that validates field rules against synthesized good/reject/repair values and caches results in `field_audit_cache` | `src/tests/fieldContractTestRunner.js`, `src/tests/deriveFailureValues.js`, `src/app/api/routes/testModeRoutes.js` |
| Publisher | Validation and audit boundary over candidate values: an 11-phase validation registry plus the read-only `/publisher/:category/*` API and `/#/publisher` GUI surface | `src/features/publisher/index.js`, `src/features/publisher/validation/phaseRegistry.js`, `src/features/publisher/api/publisherRoutes.js`, `tools/gui-react/src/pages/publisher/PublisherPage.tsx` |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/guiServer.js` | project-level runtime meaning of Spec Factory |
| source | `src/app/api/bootstrap/createBootstrapSessionLayer.js` | AppDb bootstrap path |
| source | `src/app/api/specDbRuntime.js` | SpecDb path and lifecycle |
| source | `src/features/indexing/api/indexlabRoutes.js` | IndexLab, NeedSet, and Search Profile terminology |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | Runtime Ops terminology |
| source | `src/features/indexing/api/sourceStrategyRoutes.js` | Source strategy terminology |
| source | `src/features/indexing/api/specSeedsRoutes.js` | Spec seeds terminology |
| source | `src/features/studio/api/studioRoutes.js` | Field Rules Studio terminology |
| source | `src/features/review/api/reviewRoutes.js` | review-grid, component-review, and enum-review terminology |
| source | `src/features/settings-authority/llmPolicyHandler.js` | LLM policy terminology |
| source | `src/features/unit-registry/api/unitRegistryRoutes.js` | Unit Registry terminology and API surface |
| source | `src/field-rules/unitRegistry.js` | Unit Registry runtime-cache semantics |
| source | `src/features/color-registry/api/colorRoutes.js` | Color Registry terminology |
| source | `src/features/color-edition/api/colorEditionFinderRoutes.js` | Color Edition Finder terminology |
| source | `src/features/publisher/index.js` | Publisher public API and phase inventory |
| source | `src/features/publisher/api/publisherRoutes.js` | Publisher API terminology |
| source | `src/features/publisher/validation/phaseRegistry.js` | 11-phase registry (`order` 0-10) |
| source | `src/features/publisher/buildDiscoveredEnumMap.js` | Discovery enum map builder |
| source | `src/features/publisher/validation/mergeDiscoveredEnums.js` | Discovery enum merger |
| source | `src/tests/fieldContractTestRunner.js` | Field contract test runner |
| source | `src/app/api/routes/testModeRoutes.js` | Test-mode route registration |

## Related Documents

- [Feature Index](../04-features/feature-index.md) - maps these terms to concrete feature docs.
- [Data Model](../03-architecture/data-model.md) - expands database-related terms into actual schemas and tables.
- [Routing and GUI](../03-architecture/routing-and-gui.md) - shows where these terms appear in the routed UI.
- [API Surface](../06-references/api-surface.md) - maps glossary terms to concrete endpoints.

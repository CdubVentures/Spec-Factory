# Contract Test Audit Log

## Scope

- `src/app/api/tests/guiStaticFileServerWiring.test.js`
- `src/app/api/tests/guiServerRouteRegistryWiring.test.js`
- `src/app/api/tests/apiSpecDbRuntimeWiring.test.js`
- `src/app/api/tests/apiRealtimeBridgeWiring.test.js`
- `src/app/api/tests/apiProcessRuntimeWiring.test.js`
- `src/app/api/tests/apiCategoryAliasWiring.test.js`
- `src/app/api/tests/apiCatalogHelpersWiring.test.js`

## File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/guiStaticFileServerWiring.test.js` | COLLAPSE | Previous coverage asserted stream plumbing and file-path internals instead of the response contract. | Rewritten to stream real files from a temp dist root and assert response body, mime type, cache headers, SPA fallback, and 404 behavior. | Targeted app API cluster green on 2026-03-24. | Kept as a smaller response-level contract test file. |
| `src/app/api/tests/guiServerRouteRegistryWiring.test.js` | COLLAPSE | Exact `GUI_API_ROUTE_ORDER` and named context coupling pinned internal assembly details already covered elsewhere. | Retired the canonical-order/context-name assertions; kept parser, dispatcher, HTTP handler, and generic registry-order/validation contracts. | Targeted app API cluster green on 2026-03-24. | Kept with the internal-only assertions removed. |
| `src/app/api/tests/apiSpecDbRuntimeWiring.test.js` | KEEP | `getSpecDb` / `getSpecDbReady` protect public runtime behavior: seeded-handle reuse and readiness after alias resolution. | Rewritten to assert readiness behavior directly instead of helper call counts. | Targeted app API cluster green on 2026-03-24. | Kept as contract coverage. |
| `src/app/api/tests/apiRealtimeBridgeWiring.test.js` | KEEP | Websocket filtering, watcher fanout, and screencast frame caching are runtime-visible behavior. | Consolidated around shared builders and behavior-level websocket assertions. | Targeted app API cluster green; live websocket validation green on 2026-03-24. | Kept as contract coverage. |
| `src/app/api/tests/apiProcessRuntimeWiring.test.js` | COLLAPSE | Several cases pinned spawn options, signal sequences, and orphan-scan mechanics already protected by narrower route/process helper tests. | Retired cwd/windowsHide/signal/orphan-command assertions; kept start/status, stop result, screencast IPC, relocation roots, and force-stop result contracts. | Targeted app API cluster green; surrounding process/route proof green; live child-process validation green on 2026-03-24. | Kept with the internal-only assertions removed. |
| `src/app/api/tests/apiCategoryAliasWiring.test.js` | KEEP | Category alias normalization is a direct routing/config contract with minimal brittleness. | No replacement required. | Targeted app API cluster green on 2026-03-24. | Kept unchanged. |
| `src/app/api/tests/apiCatalogHelpersWiring.test.js` | KEEP | Catalog row enrichment and compiled component-db patching protect user-visible output contracts. | Centralized repeated fixture payloads with shared builders. | Targeted app API cluster green on 2026-03-24. | Kept as contract coverage with shared factories. |

## Shared Builders Added

- `src/app/api/tests/helpers/appApiTestBuilders.js`

Centralized builders added for:

- response capture
- websocket/runtime harness payloads
- fake child processes
- catalog input/summary/component payloads

## Proof Stack

### Targeted proof

- `node --test src/app/api/tests/guiStaticFileServerWiring.test.js src/app/api/tests/guiServerRouteRegistryWiring.test.js src/app/api/tests/apiSpecDbRuntimeWiring.test.js src/app/api/tests/apiRealtimeBridgeWiring.test.js src/app/api/tests/apiProcessRuntimeWiring.test.js src/app/api/tests/apiCategoryAliasWiring.test.js src/app/api/tests/apiCatalogHelpersWiring.test.js`
- Result: green, 25/25 passing.

### Surrounding proof

- `node --test src/app/api/tests/commandCapture.test.js src/app/api/tests/processOrphanOps.test.js src/app/api/tests/processLifecycleState.test.js src/app/api/tests/searxngRuntime.test.js src/api/tests/guiServerHttpAssembly.test.js src/app/api/routes/tests/infraRoutesContract.test.js src/app/api/routes/tests/processStartRunIdContract.test.js`
- Result: green, 80/80 passing.

### Live validation

- Real websocket validation with `createRealtimeBridge.attachWebSocketUpgrade(...)` plus an actual `ws` client.
- Real child-process validation with `createProcessRuntime.startProcess(...)`, `forwardScreencastControl(...)`, and `stopProcess(...)`.
- Result: `LIVE_VALIDATION_OK`.

### Full suite

- `npm test`
- Result: green, 6828/6828 passing on 2026-03-24.

## Final Proof State

- Targeted tests: green
- Surrounding integration proof: green
- Full suite: green
- Live validation: green

This audit pass is **complete**.

## Extension: Source-Text Audit

### Scope

- `src/api/tests/serverBootstrapShape.characterization.test.js`
- `src/features/indexing/pipeline/shared/tests/discoveryQueryPlan.test.js`
- `src/shared/tests/settingsDefaultsEnvSync.test.js`
- `src/features/indexing/pipeline/shared/tests/sourceRegistry.test.js`
- `src/features/indexing/pipeline/shared/tests/sourceAuthorityProductionCategories.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/api/tests/serverBootstrapShape.characterization.test.js` | RETIRE | Parsed raw source to extract internal bootstrap return keys, so it broke on refactors without protecting a runtime contract. The usable surface is already protected through route-context, HTTP-assembly, runtime-config, and app-api contract tests. | None. Existing contract coverage remains in `guiServerRuntimeConfig.test.js`, `guiServerHttpAssembly.test.js`, `guiRouteContextShape.characterization.test.js`, and the audited app-api wiring cluster. | Targeted retirement proof green on 2026-03-24. | Deleted. |
| `src/features/indexing/pipeline/shared/tests/discoveryQueryPlan.test.js` | RETIRE (single test) | The removed case only asserted that another source file did not import a helper. That is implementation-layout coupling, not behavior. | None. Query planning behavior stays covered by the remaining `buildManufacturerPlanUrls`, fallback, ranking, and identity-guard tests in the same file. | Targeted retirement proof green on 2026-03-24. | Import-guard test deleted; behavioral tests kept. |
| `src/shared/tests/settingsDefaultsEnvSync.test.js` | KEEP | Reads `.env` artifacts and validates config/default/settings contract boundaries, not source layout. | No replacement required. | Targeted retirement proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/pipeline/shared/tests/sourceRegistry.test.js` | KEEP | Reads real `sources.json` category artifacts and validates loader behavior plus registry shape. | No replacement required. | Targeted retirement proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/pipeline/shared/tests/sourceAuthorityProductionCategories.test.js` | KEEP | Protects curated production source coverage and normalized `sources.json` artifacts for live categories. | No replacement required. | Targeted retirement proof green on 2026-03-24. | Kept unchanged. |

## Extension: Search Shim Audit

### Scope

- `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js`
- `src/features/indexing/search/tests/fetchSearchProviderConfig.test.js`
- `src/features/indexing/pipeline/searchExecution/tests/searchProviders.config.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js` | COLLAPSE | One case imported a removed internal file path instead of the current public search contract. The assertion itself still protects real behavior. | Repointed the test to `src/features/indexing/search/index.js`, which is the active public shim for `buildSearchProfile`. | Targeted shim proof green on 2026-03-24. | Kept with the stale internal import removed. |
| `src/features/indexing/search/tests/fetchSearchProviderConfig.test.js` | RETIRE | Duplicated search-provider normalization/readiness checks already covered more completely by the canonical search-execution contract suite. It also imported a removed internal module path. | Existing coverage remains in `src/features/indexing/pipeline/searchExecution/tests/searchProviders.config.test.js`. | Full suite red due this file before retirement; targeted replacement proof green on 2026-03-24. | Deleted. |
| `src/features/indexing/pipeline/searchExecution/tests/searchProviders.config.test.js` | KEEP | Covers the real normalization and readiness contract for search engines, fallback engines, and provider availability. | No replacement required. | Targeted shim proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js src/features/indexing/pipeline/searchExecution/tests/searchProviders.config.test.js`
- Result: green, 28/28 passing on 2026-03-24.
- `npm test`
- Result: green, 7010/7010 passing on 2026-03-24.

## Extension: GUI Taxonomy Audit

### Scope

- `tools/gui-react/src/registries/__tests__/fieldRuleTaxonomyAlignment.test.js`
- `tools/gui-react/src/pages/llm-settings/__tests__/llmRouteTaxonomy.test.ts`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `tools/gui-react/src/registries/__tests__/fieldRuleTaxonomyAlignment.test.js` | RETIRE | Parsed TypeScript source and asserted export names plus enum members, which protected file layout and source text more than runtime behavior. The same taxonomy contract is already covered through live module imports. | Existing coverage remains in `tools/gui-react/src/pages/llm-settings/__tests__/llmRouteTaxonomy.test.ts`. | Targeted taxonomy proof green on 2026-03-24. | Deleted. |
| `tools/gui-react/src/pages/llm-settings/__tests__/llmRouteTaxonomy.test.ts` | KEEP | Verifies option arrays, rank maps, sort helpers, and chip classification through the actual exported module contract. | No replacement required. | Targeted taxonomy proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test tools/gui-react/src/pages/llm-settings/__tests__/llmRouteTaxonomy.test.ts`
- Result: green, 41/41 passing on 2026-03-24.
- `npm test`
- Result: green, 6990/6990 passing on 2026-03-24.

## Extension: Search Profile Wrapper Audit

### Scope

- `src/features/indexing/pipeline/searchProfile/tests/searchProfileStageCharacterization.test.js`
- `src/features/indexing/search/tests/phase02SearchProfile.shape.test.js`
- `src/features/indexing/search/tests/phase02SearchProfile.tiers.test.js`
- `src/features/indexing/search/tests/queryBuilderCharacterization.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/indexing/pipeline/searchProfile/tests/searchProfileStageCharacterization.test.js` | COLLAPSE | The old file rechecked query-builder internals, dead-field absence, and hint-source implementation details that are already protected in lower-level search-profile contract suites. As a wrapper test, that level of internal characterization was brittle and duplicated coverage. | Rewritten as a smaller wrapper contract suite that asserts only the returned `searchProfileBase` surface plus the emitted `search_profile_generated` and `search_profile_tier_fallback` events. | Targeted wrapper proof green on 2026-03-24. | Kept as a smaller boundary-level contract test file. |
| `src/features/indexing/search/tests/phase02SearchProfile.shape.test.js` | KEEP | Protects the public search-profile shape and provenance fields returned by the search builder. | No replacement required. | Targeted wrapper proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/search/tests/phase02SearchProfile.tiers.test.js` | KEEP | Protects the tier-selection and tier-query generation behavior for seeds, groups, and unresolved keys. | No replacement required. | Targeted wrapper proof green on 2026-03-24. | Kept unchanged. |
| `src/features/indexing/search/tests/queryBuilderCharacterization.test.js` | KEEP | Protects the external `buildSearchProfile` contract, including fallback templates and emitted row alignment. | No replacement required. | Targeted wrapper proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/indexing/pipeline/searchProfile/tests/searchProfileStageCharacterization.test.js src/features/indexing/search/tests/phase02SearchProfile.shape.test.js src/features/indexing/search/tests/phase02SearchProfile.tiers.test.js src/features/indexing/search/tests/queryBuilderCharacterization.test.js`
- Result: green, 52/52 passing on 2026-03-24.
- `npm test`
- Result: green, 6984/6984 passing on 2026-03-24.

## Extension: Settings Knob Retirement Audit

### Scope

- `src/features/settings-authority/tests/knobRetirementStage2.test.js`
- `src/shared/tests/runtimeSettingsApi.test.js`
- `src/shared/tests/settingsDefaultsEnvSync.test.js`
- `src/features/settings/api/tests/settingsEnvelopeContract.test.js`
- `src/api/tests/settingsCanonicalOnlyWrites.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/settings-authority/tests/knobRetirementStage2.test.js` | RETIRE | Duplicated removed-knob checks across config, shared defaults, key lists, and GET/PUT route maps. Most assertions targeted internal wiring rather than the live settings surfaces. | Replaced by live settings API assertions in `src/shared/tests/runtimeSettingsApi.test.js` that keep the retired runtime and convergence knobs off the public GET surfaces. Existing defaults/config coverage remains in `src/shared/tests/settingsDefaultsEnvSync.test.js`. | Targeted settings proof green on 2026-03-24. | Deleted. |
| `src/shared/tests/runtimeSettingsApi.test.js` | COLLAPSE | Already covered the public runtime settings surface, but it was missing the retired stage-2 knob assertions. | Expanded the existing live API contract to assert `phase3LlmTriageEnabled` and `llmSerpRerankEnabled` stay absent from `GET /runtime-settings`, and `serpTriageEnabled` stays absent from `GET /convergence-settings`. | Targeted settings proof green on 2026-03-24. | Kept as the public replacement coverage. |
| `src/shared/tests/settingsDefaultsEnvSync.test.js` | KEEP | Protects the remaining shared-defaults and config absence contracts for retired settings without depending on route-map internals. | No replacement required. | Targeted settings proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings/api/tests/settingsEnvelopeContract.test.js` | KEEP | Protects the route-envelope contract for settings writes. | No replacement required. | Targeted settings proof green on 2026-03-24. | Kept unchanged. |
| `src/api/tests/settingsCanonicalOnlyWrites.test.js` | KEEP | Protects canonical persistence behavior for settings writes. | No replacement required. | Targeted settings proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/shared/tests/runtimeSettingsApi.test.js src/shared/tests/settingsDefaultsEnvSync.test.js src/features/settings/api/tests/settingsEnvelopeContract.test.js src/api/tests/settingsCanonicalOnlyWrites.test.js`
- Result: green, 29/29 passing on 2026-03-24.
- `npm test`
- Result: green, 6958/6958 passing on 2026-03-24.

## Extension: Settings Boundary Audit

### Scope

- `src/features/settings-authority/tests/settingsKeySetsModuleBoundary.test.js`
- `src/features/settings-authority/tests/settingsValueTypesModuleBoundary.test.js`
- `src/features/settings-authority/tests/convergenceRegistryCharacterization.test.js`
- `src/features/settings-authority/tests/settingsContract.test.js`
- `src/features/settings-authority/tests/settingsKeyDerivationContract.test.js`
- `src/features/settings-authority/tests/runtimeSettingsValueTypesSsot.test.js`
- `src/shared/tests/uiRegistryDerivations.test.js`
- `src/shared/tests/storageRegistryDerivations.test.js`
- `src/features/settings/api/tests/uiSettingsRoutes.test.js`
- `src/shared/tests/runtimeSettingsApi.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/settings-authority/tests/settingsKeySetsModuleBoundary.test.js` | RETIRE | Only asserted that `settingsContract.js` re-exported the exact same key-array objects as `settingsKeySets.js`. That is internal module wiring, not a runtime contract. | Existing key-set coverage remains in `src/features/settings-authority/tests/settingsContract.test.js` and `src/features/settings-authority/tests/settingsKeyDerivationContract.test.js`. | Targeted settings-boundary proof green on 2026-03-24. | Deleted. |
| `src/features/settings-authority/tests/settingsValueTypesModuleBoundary.test.js` | RETIRE | Mixed one re-export identity assertion with exact-shape golden masters for UI/storage value-type maps. Those shapes are already protected by the registry-derivation suites and live UI/settings route tests, so this file only added brittle duplication. | Existing coverage remains in `src/shared/tests/uiRegistryDerivations.test.js`, `src/shared/tests/storageRegistryDerivations.test.js`, `src/features/settings-authority/tests/settingsKeyDerivationContract.test.js`, and `src/features/settings/api/tests/uiSettingsRoutes.test.js`. | Targeted settings-boundary proof green on 2026-03-24. | Deleted. |
| `src/features/settings-authority/tests/convergenceRegistryCharacterization.test.js` | RETIRE | Locked the current empty convergence surface with exact empty-array and empty-object golden masters. The real contract is already covered by settings migration/validation tests and the live `GET /convergence-settings` / PUT rejection behavior. | Existing coverage remains in `src/features/settings-authority/tests/settingsContract.test.js` and `src/shared/tests/runtimeSettingsApi.test.js`. | Targeted settings-boundary proof green on 2026-03-24. | Deleted. |
| `src/features/settings-authority/tests/settingsContract.test.js` | KEEP | Protects settings migration, key coverage, validation, and route-contract alignment. | No replacement required. | Targeted settings-boundary proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings-authority/tests/settingsKeyDerivationContract.test.js` | KEEP | Protects canonical key-set/value-type alignment without depending on re-export identity. | No replacement required. | Targeted settings-boundary proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings-authority/tests/runtimeSettingsValueTypesSsot.test.js` | KEEP | Protects the registry-derived runtime value-type map and exclusions. | No replacement required. | Targeted settings-boundary proof green on 2026-03-24. | Kept unchanged. |
| `src/shared/tests/uiRegistryDerivations.test.js` | KEEP | Protects the UI defaults, value types, and mutable-key derivations directly from the registry SSOT. | No replacement required. | Targeted settings-boundary proof green on 2026-03-24. | Kept unchanged. |
| `src/shared/tests/storageRegistryDerivations.test.js` | KEEP | Protects storage defaults, value types, option values, and canonical key derivations directly from the registry SSOT. | No replacement required. | Targeted settings-boundary proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings/api/tests/uiSettingsRoutes.test.js` | KEEP | Protects the live UI settings GET/PUT behavior and persistence surface. | No replacement required. | Targeted settings-boundary proof green on 2026-03-24. | Kept unchanged. |
| `src/shared/tests/runtimeSettingsApi.test.js` | KEEP | Protects the live runtime/convergence settings API surface. | No replacement required. | Targeted settings-boundary proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/settings-authority/tests/settingsContract.test.js src/features/settings-authority/tests/settingsKeyDerivationContract.test.js src/features/settings-authority/tests/runtimeSettingsValueTypesSsot.test.js src/shared/tests/uiRegistryDerivations.test.js src/shared/tests/storageRegistryDerivations.test.js src/features/settings/api/tests/uiSettingsRoutes.test.js src/shared/tests/runtimeSettingsApi.test.js`
- Result: green, 57/57 passing on 2026-03-24.
- `npm test`
- Result: green, 6864/6864 passing on 2026-03-24.

## Extension: Settings Apply Audit

### Scope

- `src/features/settings-authority/tests/settingsApplyCharacterization.test.js`
- `src/shared/tests/runtimeSettingsApi.test.js`
- `src/features/settings-authority/tests/runtimeSettingsSerializerContract.test.js`
- `src/features/settings-authority/tests/runtimeSettingsHydrationContract.test.js`
- `src/features/settings-authority/tests/settingsContract.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/settings-authority/tests/settingsApplyCharacterization.test.js` | COLLAPSE | The old file locked down many internal no-op and mutation mechanics: null guards, duplicate empty-payload cases, repeated direct-key updates, rollback absence, and `_registryLookup` non-rebuild behavior. Those assertions were mostly implementation-coupled and duplicated broader settings route coverage. | Rewritten to four contract-level checks: sanitized runtime updates, phase-override refresh, global plan-model refresh, and provider-registry refresh. | Targeted settings-apply proof green on 2026-03-24. | Kept as a smaller runtime-settings application contract file. |
| `src/shared/tests/runtimeSettingsApi.test.js` | KEEP | Protects the live runtime/convergence settings API surface. | No replacement required. | Targeted settings-apply proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings-authority/tests/runtimeSettingsSerializerContract.test.js` | KEEP | Protects the frontend serializer contract for runtime settings payloads. | No replacement required. | Targeted settings-apply proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings-authority/tests/runtimeSettingsHydrationContract.test.js` | KEEP | Protects frontend hydration coverage for runtime settings route keys. | No replacement required. | Targeted settings-apply proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings-authority/tests/settingsContract.test.js` | KEEP | Protects canonical settings migration, validation, and route-map alignment. | No replacement required. | Targeted settings-apply proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/features/settings-authority/tests/settingsApplyCharacterization.test.js src/features/settings-authority/tests/settingsContract.test.js src/shared/tests/runtimeSettingsApi.test.js src/features/settings-authority/tests/runtimeSettingsSerializerContract.test.js src/features/settings-authority/tests/runtimeSettingsHydrationContract.test.js`
- Result: green, 29/29 passing on 2026-03-24.
- `npm test`
- Result: green, 6846/6846 passing on 2026-03-24.

## Extension: Settings Dual-Key Audit

### Scope

- `src/features/settings-authority/tests/settingsDualKeyConsistency.test.js`
- `src/core/config/tests/llmConfigReadSurface.test.js`
- `src/features/settings-authority/tests/settingsApplyCharacterization.test.js`
- `src/features/settings-authority/tests/settingsContract.test.js`
- `src/shared/tests/runtimeSettingsApi.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/features/settings-authority/tests/settingsDualKeyConsistency.test.js` | RETIRE | The file only asserted `DUAL_KEY_PAIRS` array shape, self-referencing no-op entries, a no-op consistency helper call, and two direct runtime-key assignments already covered elsewhere. That is internal scaffolding, not a product contract. | Existing dead-fallback and surviving-read-surface coverage remains in `src/core/config/tests/llmConfigReadSurface.test.js`, and runtime-settings application behavior remains in `src/features/settings-authority/tests/settingsApplyCharacterization.test.js`. | Targeted dual-key proof green on 2026-03-24. | Deleted. |
| `src/core/config/tests/llmConfigReadSurface.test.js` | KEEP | Protects the surviving LLM fallback/read surfaces and dead-key removals that still matter to config consumers. | No replacement required. | Targeted dual-key proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings-authority/tests/settingsApplyCharacterization.test.js` | KEEP | Protects the runtime settings application contract after collapse. | No replacement required. | Targeted dual-key proof green on 2026-03-24. | Kept unchanged. |
| `src/features/settings-authority/tests/settingsContract.test.js` | KEEP | Protects canonical settings migration and route-map alignment. | No replacement required. | Targeted dual-key proof green on 2026-03-24. | Kept unchanged. |
| `src/shared/tests/runtimeSettingsApi.test.js` | KEEP | Protects the live settings API surface. | No replacement required. | Targeted dual-key proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/core/config/tests/llmConfigReadSurface.test.js src/features/settings-authority/tests/settingsApplyCharacterization.test.js src/features/settings-authority/tests/settingsContract.test.js src/shared/tests/runtimeSettingsApi.test.js`
- Result: green, 39/39 passing on 2026-03-24.
- `npm test`
- Result: green, 6840/6840 passing on 2026-03-24.

## Extension: Storage Registry Audit

### Scope

- `src/shared/tests/storageRegistryCharacterization.test.js`
- `src/shared/tests/storageRegistryDerivations.test.js`
- `src/shared/tests/storageSettingsDefaultsContract.test.js`
- `src/api/tests/settingsCanonicalOnlyWrites.test.js`

### File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/shared/tests/storageRegistryCharacterization.test.js` | RETIRE | Pre-migration golden-master residue. It duplicated the exact storage defaults/options assertions already covered by the registry derivation suite and storage defaults contract tests. | Existing coverage remains in `src/shared/tests/storageRegistryDerivations.test.js` and `src/shared/tests/storageSettingsDefaultsContract.test.js`, with canonical persistence behavior covered by `src/api/tests/settingsCanonicalOnlyWrites.test.js`. | Targeted storage proof green on 2026-03-24. | Deleted. |
| `src/shared/tests/storageRegistryDerivations.test.js` | KEEP | Protects storage defaults, value types, option values, and canonical-key derivations directly from the registry SSOT. | No replacement required. | Targeted storage proof green on 2026-03-24. | Kept unchanged. |
| `src/shared/tests/storageSettingsDefaultsContract.test.js` | KEEP | Protects storage bootstrap/default snapshot behavior. | No replacement required. | Targeted storage proof green on 2026-03-24. | Kept unchanged. |
| `src/api/tests/settingsCanonicalOnlyWrites.test.js` | KEEP | Protects canonical-only persistence behavior for settings writes. | No replacement required. | Targeted storage proof green on 2026-03-24. | Kept unchanged. |

### Proof Stack

- `node --test src/shared/tests/storageRegistryDerivations.test.js src/shared/tests/storageSettingsDefaultsContract.test.js src/api/tests/settingsCanonicalOnlyWrites.test.js`
- Result: green, 23/23 passing on 2026-03-24.
- `npm test`
- Result: green, 6828/6828 passing on 2026-03-24.

# Settings Full Audit - 2026-03-19

Current status: complete for the current working tree on 2026-03-19.

This audit was validated from:
- source inspection across registry, defaults, GUI stores, handlers, launch transport, and runtime consumers
- focused `node --test` slices
- a fresh current-tree GUI server probe
- a child-launch payload -> snapshot -> `loadConfigWithUserSettings()` readback probe
- a comparison probe against the already-running server on port `8788`

The server already running on `8788` is stale relative to the current tree and is recorded as environment drift, not source truth.

## Deliverable A - Settings Matrix

### A.1 Inventory totals

| Surface | Count | Notes |
|---|---:|---|
| Runtime registry keys | 195 | `src/shared/settingsRegistry.js` |
| Runtime defaults keys | 207 | `src/shared/settingsDefaults.js` |
| Runtime GET surface keys | 192 | `runtimeSettingsRouteGet.js` |
| Runtime PUT surface keys | 190 | `runtimeSettingsRoutePut.js` |
| Runtime persisted value-type keys | 193 | `runtimeSettingsValueTypes.js` |
| Runtime secrets | 5 | `anthropicApiKey`, `deepseekApiKey`, `geminiApiKey`, `llmPlanApiKey`, `openaiApiKey` |
| Runtime read-only keys | 2 | `awsRegion`, `s3Bucket` |
| Runtime `defaultsOnly` keys | 3 | `discoveryEnabled`, `daemonGracefulShutdownTimeoutMs`, `runtimeAutoSaveEnabled` |
| Alias-like canonical runtime keys | 5 | `fetchConcurrency`, `resumeMode`, `resumeWindowHours`, `reextractAfterHours`, `reextractIndexed` |
| Storage keys | 10 | `settingsValueTypes.js` |
| UI keys | 5 | `settingsValueTypes.js` |
| Convergence keys | 1 | `serpTriageMinScore` |
| Inventory scan hits | 264 | `src` 80, `tools/gui-react` 77, `test` 67, `docs` 40 |

### A.2 Ownership answers

#### LLM

- Canonical owner: flat runtime keys in `tools/gui-react/src/stores/runtimeSettingsValueStore.ts`, persisted under `user-settings.json.runtime`.
- Composite policy primary or facade: facade. `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts` derives a composite `LlmPolicy` from the flat runtime store and writes flat keys back into that same store.
- Other places mirroring the same value: yes. The composite LLM facade adds its own query, dirty state, autosave timers, unload guard, and save contract on top of the shared runtime store.
- Can saving one LLM surface clear dirty state for non-LLM settings: yes. `useLlmPolicyAuthority.ts` calls `markClean()` on the shared runtime store after successful save.

#### Pipeline / Runtime

- Canonical owner: GUI in-memory owner is `runtimeSettingsValueStore`; persisted owner is `user-settings.json.runtime`; backend owner is `config` after settings application.
- Direct owner vs write-through cache: the runtime value store is the direct GUI owner.
- Editors write direct or local draft first: the runtime flow keeps a normalized draft layer and then emits normalized runtime payloads into the shared store/save path.
- Does launch read the same source the UI edits: yes for current GUI launches. The launch probe verified payload -> snapshot -> child load via `RUNTIME_SETTINGS_SNAPSHOT`.

#### Storage

- Same store architecture: no. Storage has a separate authority path in `tools/gui-react/src/features/pipeline-settings/state/storageSettingsAuthority.ts`.
- Secrets, clear-secret flags, and status flags in one place: yes, through the storage authority and `configStorageSettingsHandler.js`.
- Unload autosave semantics vs regular save: same route contract. Fresh current-tree probe confirmed `PUT` and `POST` both return `200` for `/api/v1/storage-settings` and `/api/v1/runtime-settings`.

#### Legacy

- `searchProvider` is still live through GUI normalization, launch payload fallback, runtime consumers, reporting, tests, and docs.
- `helperFilesRoot` is still live through registry/defaults, GUI draft state, launch transport, env/config compatibility, tests, and docs.
- Legacy persistence keys `concurrency`, `indexingResumeMode`, `indexingResumeMaxAgeHours`, `indexingReextractAfterHours`, `indexingReextractEnabled`, and `dynamicFetchPolicyMap` remain behaviorally live.

### A.3 Contract drift sets

| Drift | Keys | Classification |
|---|---|---|
| Registry keys missing from runtime defaults | `googleSearchMaxRetries`, `googleSearchMinQueryIntervalMs`, `googleSearchProxyUrlsJson`, `googleSearchScreenshotsEnabled`, `googleSearchTimeoutMs`, `parsingConfidenceBaseMapJson` | Duplicate SSOT |
| Runtime defaults keys outside registry | `authoritySnapshotEnabled`, `billingJsonWrite`, `cacheJsonWrite`, `concurrency`, `corpusJsonWrite`, `dynamicFetchPolicyMap`, `frontierRepairSearchEnabled`, `htmlTableExtractorV2`, `indexingReextractAfterHours`, `indexingReextractEnabled`, `indexingResumeMaxAgeHours`, `indexingResumeMode`, `intelJsonWrite`, `learningJsonWrite`, `llmExtractionCacheEnabled`, `queueJsonWrite`, `scannedPdfOcrPromoteCandidates`, `staticDomExtractorEnabled` | Duplicate SSOT / legacy-live mix |
| Registry keys missing from runtime GET | `daemonGracefulShutdownTimeoutMs`, `discoveryEnabled`, `runtimeAutoSaveEnabled` | Partial surface / duplicated contract |
| Value-type keys not present in registry | `concurrency`, `dynamicFetchPolicyMap`, `indexingReextractAfterHours`, `indexingReextractEnabled`, `indexingResumeMaxAgeHours`, `indexingResumeMode` | Legacy But Live |
| Canonical registry keys missing from value types | `daemonGracefulShutdownTimeoutMs`, `discoveryEnabled`, `fetchConcurrency`, `reextractAfterHours`, `reextractIndexed`, `resumeMode`, `resumeWindowHours`, `runtimeAutoSaveEnabled` | Duplicate SSOT |

### A.4 Legacy-but-live list

| Key / path | Evidence | Classification |
|---|---|---|
| `searchProvider` | GUI normalization reads it; launch payload still falls back to it; runtime consumers still read it; tests still characterize it | Legacy But Live |
| `helperFilesRoot` | Still in registry/defaults, GUI draft state, launch transport, env mapping, config load, tests, and docs | Legacy But Live |
| `concurrency` | Persisted/value-typed legacy config key behind canonical `fetchConcurrency` | Legacy But Live |
| `indexingResumeMode` | Persisted/value-typed legacy config key behind canonical `resumeMode` | Legacy But Live |
| `indexingResumeMaxAgeHours` | Persisted/value-typed legacy config key behind canonical `resumeWindowHours` | Legacy But Live |
| `indexingReextractAfterHours` | Persisted/value-typed legacy config key behind canonical `reextractAfterHours` | Legacy But Live |
| `indexingReextractEnabled` | Persisted/value-typed legacy config key behind canonical `reextractIndexed` | Legacy But Live |
| `dynamicFetchPolicyMap` | Persisted object mirror still coexists with `dynamicFetchPolicyMapJson` | Legacy But Live |

### A.5 Compatibility-only list

| Key / path | Evidence | Classification |
|---|---|---|
| `dynamicFetchPolicyMap` object mirror | UI edits JSON string; handler persists both JSON and object shape; object form is a compatibility mirror, not a first-class edit surface | Compatibility Only |

### A.6 Non-runtime settings inventory

| Area | Keys |
|---|---|
| Storage | `enabled`, `destinationType`, `localDirectory`, `awsRegion`, `s3Bucket`, `s3Prefix`, `s3AccessKeyId`, `s3SecretAccessKey`, `s3SessionToken`, `updatedAt` |
| UI | `studioAutoSaveAllEnabled`, `studioAutoSaveEnabled`, `studioAutoSaveMapEnabled`, `runtimeAutoSaveEnabled`, `storageAutoSaveEnabled` |
| Convergence | `serpTriageMinScore` |

Canonical runtime inventory note:
- All 195 runtime registry rows were re-enumerated from `src/shared/settingsRegistry.js` during the audit.
- The high-signal audit output is the drift matrix above: it identifies where those canonical rows diverge from defaults, routes, persistence, and runtime transport.

## Deliverable B - File Matrix

Focused issue matrix:

| File | Role | Settings touched | Issue category | Severity | Action |
|---|---|---|---|---|---|
| `src/features/settings-authority/llmPolicyHandler.js` | handler | composite LLM policy | Active Bug when paired with missing mount | Critical | Mount or retire the route |
| `tools/gui-react/src/features/llm-config/api/llmPolicyApi.ts` | transport | `/llm-policy` GET/PUT | Active Bug | Critical | Point to a mounted endpoint or remove composite surface |
| `src/features/settings/api/configRoutes.js` | transport | mounted settings routes | Active Bug | Critical | Register `/llm-policy` or fully remove references |
| `src/app/api/routeRegistry.js` | transport | route groups | Active Bug | Critical | Add missing mount or consolidate contracts |
| `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts` | owner/facade | composite LLM policy over flat keys | Overlapping Ownership | High | Remove separate authority or stop clearing shared dirty flag |
| `tools/gui-react/src/stores/runtimeSettingsValueStore.ts` | owner | all flat runtime values | Overlapping Ownership | High | Replace global `dirty` boolean with scoped dirty tracking if facade stays |
| `src/features/settings-authority/runtimeSettingsValueTypes.js` | adapter | persisted runtime schema | Duplicate SSOT | Medium | Derive from canonical registry keys or document the legacy schema boundary |
| `src/shared/settingsRegistry.js` | owner | runtime registry | Duplicate SSOT / legacy-live | Medium | Keep canonical registry, but remove dead/duplicated surfaces or explicitly mark them |
| `src/shared/settingsDefaults.js` | resolver | defaults | Duplicate SSOT | Medium | Converge defaults onto registry derivation |
| `src/shared/settingsDefaults.d.ts` | doc/type mirror | TS defaults contract | Doc/Test Drift | Low | Regenerate or remove the stale mirror |
| `test/settingsRegistryDerivations.test.js` | test | registry/default derivation contract | Doc/Test Drift | Low | Update stale known-drift list for `searchMaxRetries` |
| `src/features/indexing/api/builders/processStartLaunchPlan.js` | launch transport | helper root, search engines, snapshot write | Legacy But Live | High | Remove legacy seams only after runtime/docs/tests no longer depend on them |
| `tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsHydration.ts` | GUI adapter | `searchProvider`, `helperFilesRoot`, `serper*` | Legacy But Live | Medium | Keep only intentional compat, delete the rest |
| `src/features/indexing/search/searchProviders.js` | runtime consumer | `searchEngines`, `searchProvider`, `searchMaxRetries`, `serper*` | Legacy But Live | Medium | Retire `searchProvider` only after removing all callers/tests |
| `src/core/config/settingsClassification.js` | resolver | `helperFilesRoot`, env aliases | Legacy But Live | Medium | Collapse env compat once helper-root legacy path is retired |

## Deliverable C - Findings Summary

### 1. `Active Bug` `Critical`

`/api/v1/llm-policy` is still the composite LLM page's read/write endpoint, but it is not mounted in the current server.

Evidence:
- `tools/gui-react/src/features/llm-config/api/llmPolicyApi.ts` still calls `/llm-policy`.
- `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts` still depends on that endpoint for load/save/unload persistence.
- `src/features/settings-authority/llmPolicyHandler.js` still exists.
- Fresh current-tree server probe returned `404` for both `GET /api/v1/llm-policy` and `PUT /api/v1/llm-policy`.

### 2. `Overlapping Ownership` `High`

The LLM composite facade and the runtime settings store still share one value owner but keep separate dirty/save authorities.

Evidence:
- `useLlmPolicyAuthority.ts` derives `LlmPolicy` from `useRuntimeSettingsValueStore`.
- The same hook writes flat keys back into that shared store.
- It clears the entire runtime store dirty flag on successful save.

### 3. `Legacy But Live` `High`

`helperFilesRoot` is still behaviorally live.

Evidence:
- Present in registry/defaults.
- Still editable in the pipeline flow.
- Still consumed in launch transport and env/config compatibility.
- Launch probe showed the value survives payload -> snapshot -> `config.helperFilesRoot`.

### 4. `Legacy But Live` `High`

`searchProvider` is still behaviorally live.

Evidence:
- GUI normalization still reads it.
- Launch payload still falls back to it.
- Runtime consumers still read `config.searchEngines ?? config.searchProvider`.
- Reporting/tests still refer to it.

### 5. `Duplicate SSOT` `Medium`

Canonical runtime keys and persisted runtime schema still disagree.

Evidence:
- Canonical UI/registry keys: `fetchConcurrency`, `resumeMode`, `resumeWindowHours`, `reextractAfterHours`, `reextractIndexed`.
- Persisted/value-typed keys: `concurrency`, `indexingResumeMode`, `indexingResumeMaxAgeHours`, `indexingReextractAfterHours`, `indexingReextractEnabled`.

### 6. `Duplicate SSOT` `Medium`

Registry and defaults still diverge.

Evidence:
- 6 registry keys are missing from runtime defaults.
- 18 runtime defaults remain outside the registry.
- `runtimeAutoSaveEnabled` is a UI-owned setting but still leaks into runtime defaults and the runtime registry as a `defaultsOnly` key.

### 7. `Doc / Test Drift` `Low`

Several docs/tests still describe the old system.

Evidence:
- `test/settingsRegistryDerivations.test.js` still treats `searchMaxRetries` as registry-only drift even though it now exists in both registry and defaults.
- `src/shared/settingsDefaults.d.ts` still mirrors stale defaults/types.
- Multiple docs under `docs/implementation/settings-store-rewrite/` still claim `helperFilesRoot` and `searchProvider` are removed or dead.

### 8. `Environment Drift` `Low`

The already-running server on `http://localhost:8788` does not match the current tree.

Evidence:
- Live `GET /api/v1/runtime-settings` on `8788` still exposed stale keys such as `fetchSchedulerFallbackWaitMs`.
- Fresh current-tree probe did not.

## Deliverable D - Validation Record

### Commands run

| Command | Result |
|---|---|
| `rg -n --glob '!node_modules/**' --glob '!**/dist/**' --glob '!coverage/**' "(llmPolicy|llm-policy|runtimeSettings|storageSettings|settingsAuthority|settingsDefaults|settingsRegistry|settingsUnloadGuard|dataChangeContract|runtimeSettingsSnapshot|processStartLaunchPlan|llmMaxOutputTokens|helperFilesRoot|searchProvider|fetchConcurrency|resumeMode|resumeWindowHours|reextractAfterHours|reextractIndexed)" tools/gui-react src test docs` | 264-file inventory |
| Focused `node --test` slice across runtime, storage, unload, launch, routing, registry, and search contracts | 227 tests, 225 pass, 2 fail |
| `node --test test/settingsRegistryDerivations.test.js` | 31 tests, 30 pass, 1 fail |
| Fresh current-tree GUI server probe | `/runtime-settings` GET/PUT/POST `200`; `/storage-settings` GET/PUT/POST `200`; `/llm-policy` GET/PUT `404` |
| Launch probe using GUI payload builder + process start plan + snapshot readback | payload -> snapshot -> `RUNTIME_SETTINGS_SNAPSHOT` -> `loadConfigWithUserSettings()` verified |
| Live instance comparison on `8788` | stale relative to current tree; recorded as environment drift |

### Probe results

Current-tree server:
- `GET /api/v1/runtime-settings`: `200`
- `PUT /api/v1/runtime-settings`: `200`
- `POST /api/v1/runtime-settings`: `200`
- `GET /api/v1/storage-settings`: `200`
- `PUT /api/v1/storage-settings`: `200`
- `POST /api/v1/storage-settings`: `200`
- `GET /api/v1/llm-policy`: `404`
- `PUT /api/v1/llm-policy`: `404`

Launch / child-config readback:
- `buildIndexingRunStartPayload()` preserved current editor values into the POST body.
- `processStartLaunchPlan.js` wrote a snapshot file and exposed it through `envOverrides.RUNTIME_SETTINGS_SNAPSHOT`.
- `loadConfigWithUserSettings()` consumed that snapshot when `process.env.RUNTIME_SETTINGS_SNAPSHOT` was set.
- Alias remap for `fetchConcurrency`, `resumeMode`, `resumeWindowHours`, `reextractAfterHours`, and `reextractIndexed` worked over the real env handoff path.
- `helperFilesRoot` and `searchProvider` also survived payload -> snapshot -> config, confirming they are still live compatibility seams.
- Numeric alias values sourced from GUI payload can still arrive in config as strings; current main consumers coerce them with `toInt()`, so this is recorded as type-stability risk rather than the primary defect.

### Test results

Focused slice:
- 18 suites
- 227 tests
- 225 pass
- 2 fail

Failing assertions:
- `test/settingsRegistryDerivations.test.js` stale key-set expectation
- same suite rerun in isolation and still failed only on stale `searchMaxRetries` drift metadata

### Validation notes

- No GUI screenshot proof is attached here because this audit is not being used to close a phase.
- The source tree, not the long-running local server, is the contract authority for this report.

# Frontend Knob Audit (2026-02-25)

## Scope

Full audit of frontend setting surfaces that allow save/autosave or mutate persisted settings:

- Runtime settings (`IndexingPage` / `RuntimePanel`)
- Convergence settings (`IndexingPage` / `RuntimePanel` / `PipelineSettingsPage`)
- Storage settings (`StoragePage`)
- LLM route-matrix settings (`LlmSettingsPage`)
- Source strategy settings (`PipelineSettingsPage`)
- Studio map + field-rules settings (`StudioPage`, Key Navigator, Workbench)
- Global UI autosave settings (`/ui-settings`)

## Surface Matrix

| Surface | Frontend writer path | API path | Persistence target | Reload/hydration path | Shared/global propagation | Runtime consumer path | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Runtime settings | `tools/gui-react/src/pages/indexing/IndexingPage.tsx` + `tools/gui-react/src/stores/runtimeSettingsAuthority.ts` | `/runtime-settings` | `helper_files/_runtime/user-settings.json` (`runtime`) | authority `useQuery(['runtime-settings'])` + bootstrap helper `readRuntimeSettingsBootstrap` | shared runtime snapshot consumed by `Runtime Ops` (`WorkersTab`) | `/process/start` payload -> `infraRoutes` env overrides -> runtime config | PASS |
| Convergence settings | `tools/gui-react/src/stores/convergenceSettingsAuthority.ts`; controls in `RuntimePanel` + `PipelineSettingsPage` | `/convergence-settings` | `helper_files/_runtime/user-settings.json` (`convergence`) | shared authority query key `['convergence-settings']` | duplicated controls stay live-synced across Runtime/Pipeline surfaces | `runOrchestrator`, `runProduct`, `searchDiscovery` consume convergence keys | PASS |
| Storage settings | `tools/gui-react/src/pages/storage/StoragePage.tsx` + `tools/gui-react/src/stores/storageSettingsAuthority.ts` | `/storage-settings` | `helper_files/_runtime/user-settings.json` (`storage`) | authority `useQuery(['storage-settings'])` + `readStorageSettingsBootstrap` | autosave mode is global via `/ui-settings` (`storageAutoSaveEnabled`) | run-data relocation + destination usage in backend state | PASS |
| LLM route matrix | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` + `tools/gui-react/src/stores/llmSettingsAuthority.ts` | `/llm-settings/:category/routes` | category `spec.sqlite` (`llm_route_matrix`) | authority query key `['llm-settings-routes', category]` + bootstrap helper | autosave mode is global via `/ui-settings` (`llmSettingsAutoSaveEnabled`) | route policy drives model ladder, token caps, websearch gate, evidence action, prompt flags in extraction | PASS |
| Source strategy | `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` + `tools/gui-react/src/stores/sourceStrategyAuthority.ts` | `/source-strategy?category=...` | category `spec.sqlite` (`source_strategy`) | authority query key `['source-strategy', category]` | category-scoped; `category=all` writers disabled | discovery reads enabled rows (`runProduct` -> `discoverCandidateSources`) | PASS |
| Studio map + rules | `tools/gui-react/src/pages/studio/StudioPage.tsx` + `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts` | `/studio/:category/field-studio-map` (+ validate endpoint) | field-studio map files + canonical studio section in `user-settings` where applicable | studio map query + store hydration/rehydration | autosave toggles are global via `/ui-settings`; lock-state shared across tabs | compiled runtime field-rules + route context used in extraction/review flows | PASS |
| Global UI autosave | `tools/gui-react/src/stores/settingsAuthority.ts`, `uiStore.ts`, `uiSettingsAuthority.ts` | `/ui-settings` | `helper_files/_runtime/user-settings.json` (`ui`) | AppShell bootstrap via `useSettingsAuthorityBootstrap` | global source-of-truth for studio/runtime/storage/llm autosave modes | controls autosave behavior in all authorities | PASS |

## Visual Indicator and Text Wiring Checks

- Runtime settings status text + autosave badge: `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx`
- Storage status text parity (`Unsaved` vs `Unsaved changes queued for auto save.`): `tools/gui-react/src/pages/storage/StoragePage.tsx`
- LLM status parity (`Unsaved (auto-save pending).`): `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`
- Studio save status precedence (`Saving` -> `Save failed` -> `Unsaved` -> `Auto-saved`/`Up to date`): `tools/gui-react/src/pages/studio/StudioPage.tsx`
- Runtime Ops live badges hydrate from runtime authority snapshot (no endpoint-local hardcoding): `tools/gui-react/src/pages/runtime-ops/panels/WorkersTab.tsx`

## Execution Evidence (This Audit Run)

Commands executed:

1. `node --test --test-concurrency=1` settings authority + propagation matrix files  
   Result: `132/132` passing.
2. `node --test --test-concurrency=1 test/extractCandidatesLLM.test.js test/runtimeHelpers.test.js test/sourceStrategy.test.js test/retrievalIdentityFilter.test.js`  
   Result: `41/41` passing.
3. `node --test --test-concurrency=1 test/configRoutesPersistenceFailure.test.js test/settingsCanonicalOnlyWrites.test.js test/userSettingsService.test.js test/guiServerRootPathResolution.test.js`  
   Result: `11/11` passing.
4. `npm run gui:build`  
   Result: passing.

Total settings-audit tests executed this run: `184` passing, `0` failing.

## Rerun Evidence (2026-02-25, Current Workspace)

Validation rerun on current workspace state completed with the following explicit command set:

1. `node --test --test-concurrency=1` across settings authority/persistence/propagation suites (runtime/convergence/storage/llm/source-strategy/studio/ui/root-resolution/canonical-write checks)  
   Result: `111/111` passing.
2. `node --test --test-concurrency=1 test/extractCandidatesLLM.test.js test/runtimeHelpers.test.js test/sourceStrategy.test.js test/retrievalIdentityFilter.test.js`  
   Result: `41/41` passing.
3. `node --test --test-concurrency=1 test/configRoutesPersistenceFailure.test.js test/settingsCanonicalOnlyWrites.test.js test/userSettingsService.test.js test/guiServerRootPathResolution.test.js`  
   Result: `11/11` passing.
4. `npm run gui:build`  
   Result: passing (`tsc -b` + Vite production build).

Static ownership and no-hardcoded checks in this rerun:

- Settings endpoints are referenced from authority/store modules; page-level settings surfaces consume authority hooks.
- Direct query-cache ownership remains in authority/store paths; no page/component/hooks `.getQueryData(...)` readers were found in frontend settings surfaces.
- Shared status indicators remain authority-driven and covered in runtime/storage/llm/studio parity tests.

Rerun verdict: PASS.

## Finalization Update (2026-02-25, Mutation + Hydration Contracts)

Polish/finalization implementation added in this session:

- Shared optimistic-update + rollback mutation contract added:
  - `tools/gui-react/src/stores/settingsMutationContract.ts`
  - Wired through runtime/convergence/storage/ui/llm/source-strategy authorities.
- Settings bootstrap now runs a single startup hydration pipeline:
  - `runSettingsStartupHydrationPipeline` in `tools/gui-react/src/stores/settingsAuthority.ts`
  - category-change follow-up hydration uses `runCategoryScopedSettingsHydrationPipeline`.
- Bootstrap now uses explicit pipeline-owned query hydration (`enabled: false` + `reload()` pipeline) for runtime/convergence/storage/ui/source-strategy/active-category llm.

Validation evidence for this finalization step:

1. Wiring/contract suites (including new `test/settingsMutationContractWiring.test.js`)  
   Result: `24/24` passing.
2. Full settings authority/persistence/propagation rerun (with new mutation contract test included)  
   Result: `113/113` passing.
3. Runtime behavior-effect sweep  
   Result: `41/41` passing.
4. Frontend production build  
   Result: passing (`npm run gui:build`).

## Propagation Contract Update (2026-02-25, Cross-Tab)

Cross-surface propagation contract finalized in this session:

- Cross-tab settings propagation contract module added:
  - `tools/gui-react/src/stores/settingsPropagationContract.ts`
  - Transport: browser `storage` event over canonical key `spec-factory:settings-propagation:v1`.
  - Domains: `runtime`, `convergence`, `storage`, `ui`, `llm`, `source-strategy`.
- All settings writers now publish propagation events on successful persistence:
  - runtime/convergence/storage/ui/llm/source-strategy authorities.
- Settings bootstrap now subscribes to propagation events and routes domain events to scoped authority reload/invalidation:
  - runtime/convergence/storage/ui -> authority reload
  - llm/source-strategy -> category-scoped invalidate + active-category reload

Validation evidence:

1. Propagation + mutation + authority wiring suites  
   Result: `20/20` passing.
2. Full post-propagation settings authority/persistence/propagation rerun  
   Result: `116/116` passing.
3. Runtime behavior-effect sweep  
   Result: `41/41` passing.
4. Frontend production build  
   Result: passing (`npm run gui:build`).

## Deterministic Paint + Runtime LLM Hydration Update (2026-02-25, Current Pass)

Additional finalization changes in this pass:

- `tools/gui-react/src/stores/settingsAuthority.ts` now exports `isSettingsAuthoritySnapshotReady(...)` for canonical startup readiness checks.
- `tools/gui-react/src/components/layout/AppShell.tsx` now blocks first settings-sensitive content paint until readiness is met, with an explicit degraded-mode banner after timeout instead of silent fallback-state rendering.
- `tools/gui-react/src/pages/indexing/IndexingPage.tsx` no longer pre-seeds runtime LLM knobs from `indexingLlmConfig` defaults before runtime authority hydration; run payload now always uses authority-owned fallback knobs.

Validation evidence for this pass:

1. `node --test test/runtimeLlmInitResetGuardWiring.test.js test/settingsAuthorityMatrixWiring.test.js`  
   Result: `3/3` passing.
2. `node --test test/runtimeRunPayloadBaselineWiring.test.js test/runtimeSettingsKeyCoverageMatrix.test.js test/runtimeSettingsInitialBootstrapWiring.test.js test/settingsAuthorityStoreWiring.test.js`  
   Result: `5/5` passing.
3. `node --test test/storageSettingsGuiPersistencePropagation.test.js`  
   Result: `1/1` passing.
4. `node --test test/convergenceCrossSurfaceGuiPersistencePropagation.test.js`  
   Result: `1/1` passing.
5. `node --test test/runtimeOpsGuiSettingsPersistencePropagation.test.js`  
   Result: `1/1` passing.
6. `npm run gui:build`  
   Result: passing (`tsc -b` + Vite production build; existing non-blocking esbuild CSS minify warning remains).

## Authority Selector Migration Update (2026-02-25, Current Pass)

Reader-side readiness wiring refinement completed:

- `tools/gui-react/src/pages/indexing/IndexingPage.tsx` now derives runtime settings readiness from shared `settingsAuthorityStore` snapshot (`runtimeReady`) instead of page-local `runtimeSettingsData` presence heuristics.
- `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` now derives convergence/source-strategy readiness from shared `settingsAuthorityStore` snapshot (`convergenceReady`, `sourceStrategyReady`) and gates controls/rendering accordingly.

Validation evidence:

1. `node --test test/runtimeSettingsAuthorityWiring.test.js test/convergenceSettingsAuthorityWiring.test.js test/settingsAuthorityMatrixWiring.test.js`  
   Result: `5/5` passing.
2. `node --test test/sourceStrategyGuiPersistencePropagation.test.js test/convergenceCrossSurfaceGuiPersistencePropagation.test.js`  
   Result: `2/2` passing.
3. `npm run gui:build`  
   Result: passing.

## Save-Status Truth Parity Update (2026-02-25, Current Pass)

Persistence-error visibility hardening completed for convergence/runtime pipeline surfaces:

- `tools/gui-react/src/pages/indexing/IndexingPage.tsx` no longer resets `runtimeSettingsSaveState` or `convergenceSettingsSaveState` to `idle` whenever dirty state is true.
- `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` no longer resets convergence `saveStatus` to `idle` solely because the page remains dirty.
- `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` no longer resets `saveStatus` to `idle` solely because settings remain dirty.
- `tools/gui-react/src/pages/storage/StoragePage.tsx` status rendering now uses explicit saving/error/dirty/ok precedence and no longer clears save status on edit.
- `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` source-strategy status no longer force-resets to `idle` before mutation outcomes and now shows saving/error/ok precedence.
- Existing Runtime Panel and Pipeline status precedence keeps `error`/`partial` messages ahead of generic unsaved labels, so failed persistence truth remains visible.

Validation evidence:

1. `node --test test/storageAutosaveStatusParity.test.js test/settingsSaveStatusParityWiring.test.js test/runtimePanelAutosaveStatusParity.test.js test/llmSettingsAutosaveStatusParity.test.js`  
   Result: `6/6` passing.
2. `node --test test/storageSettingsGuiPersistencePropagation.test.js`  
   Result: `1/1` passing.
3. `node --test test/sourceStrategyGuiPersistencePropagation.test.js`  
   Result: `1/1` passing.
4. `node --test test/llmSettingsGuiPersistencePropagation.test.js`  
   Result: `1/1` passing.
5. `node --test test/runtimeOpsGuiSettingsPersistencePropagation.test.js`  
   Result: `1/1` passing.
6. `npm run gui:build`  
   Result: passing.

## Storage Hydration Selector Migration (2026-02-25, Current Pass)

`StoragePage` hydration/write readiness no longer relies on page-local mirror state:

- `tools/gui-react/src/pages/storage/StoragePage.tsx` now derives write gating from shared `settingsAuthorityStore` snapshot key `storageReady`.
- Component-local `hasHydratedFromServer` mirror was removed.
- Autosave/manual-save gating remains intact (`autoSaveEnabled && storageSettingsReady`, `canSave` requires `storageSettingsReady`).
- Local unsaved-edit clobber protection remains (`hasLocalEditsRef` guard for hydration re-apply).

Validation evidence:

1. `node --test test/storageSettingsHydrationGate.test.js test/storageSettingsInitialBootstrapWiring.test.js test/storageAutosaveStatusParity.test.js test/settingsSaveStatusParityWiring.test.js`  
   Result: `6/6` passing.
2. `node --test test/storageSettingsGuiPersistencePropagation.test.js`  
   Result: `1/1` passing.
3. `node --test test/sourceStrategyGuiPersistencePropagation.test.js`  
   Result: `1/1` passing.
4. `npm run gui:build`  
   Result: passing.

## LLM Hydration Selector Migration (2026-02-25, Current Pass)

`LlmSettingsPage` hydration/write readiness now uses shared authority snapshot state:

- `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` now reads `snapshot.llmSettingsReady` from `settingsAuthorityStore`.
- Page hydration state now derives from shared readiness (`llmHydrated = isAll || (llmSettingsReady && !isLoading)`), replacing loading-only gating.
- Initial empty-state rendering and save/reload/reset controls are hydration-gated on `llmHydrated`.
- Status text now reports `Loading persisted LLM settings...` before generic unsaved/saved labels until hydration completes.

Validation evidence:

1. `node --test test/llmSettingsHydrationGate.test.js test/llmSettingsAuthorityWiring.test.js test/llmSettingsInitialBootstrapWiring.test.js test/llmSettingsAutosaveStatusParity.test.js test/settingsAuthorityMatrixWiring.test.js test/storageSettingsHydrationGate.test.js test/settingsSaveStatusParityWiring.test.js`  
   Result: `10/10` passing.
2. `node --test test/llmSettingsGuiPersistencePropagation.test.js test/storageSettingsGuiPersistencePropagation.test.js test/sourceStrategyGuiPersistencePropagation.test.js`  
   Result: `3/3` passing.
3. `npm run gui:build`  
   Result: passing (`tsc -b` + Vite production build; existing non-blocking esbuild CSS minify warning remains).

## UI Autosave Persistence Status Surfacing (2026-02-25, Current Pass)

Global `/ui-settings` autosave-toggle persistence now exposes explicit saving/error truth in shared authority state and UI:

- `tools/gui-react/src/stores/settingsAuthority.ts` now tracks UI settings persistence status in canonical snapshot fields:
  - `uiSettingsPersistState` (`idle` | `saving` | `error`)
  - `uiSettingsPersistMessage` (error detail text)
- UI autosave persistence save attempts now set `uiSettingsPersistState='saving'` when debounce fires.
- UI autosave persistence failures now set `uiSettingsPersistState='error'` with message from mutation error.
- `tools/gui-react/src/components/layout/AppShell.tsx` now renders shared status banners:
  - `Saving autosave preference changes...`
  - `Failed to persist autosave preference changes. UI reverted to last persisted values. (...)`

Validation evidence:

1. `node --test test/settingsAuthorityStoreWiring.test.js test/settingsAuthorityMatrixWiring.test.js test/uiAutosaveAuthorityWiring.test.js test/studioAutosaveStatusParity.test.js test/llmSettingsHydrationGate.test.js test/storageSettingsHydrationGate.test.js`  
   Result: `20/20` passing.
2. `node --test test/studioSettingsGuiPersistencePropagation.test.js test/storageSettingsGuiPersistencePropagation.test.js test/llmSettingsGuiPersistencePropagation.test.js`  
   Result: `3/3` passing.
3. `npm run gui:build`  
   Result: passing (`tsc -b` + Vite production build; existing non-blocking esbuild CSS minify warning remains).

## AppShell Shared Snapshot Selector Migration (2026-02-25, Current Pass)

`AppShell` now consumes canonical settings snapshot selectors from shared authority store rather than page-local bootstrap return values:

- `tools/gui-react/src/components/layout/AppShell.tsx` now calls `useSettingsAuthorityBootstrap()` as hydrator-only side effect.
- `AppShell` now reads `settingsSnapshot` via `useSettingsAuthorityStore((s) => s.snapshot)`.
- Readiness gating (`isSettingsAuthoritySnapshotReady`) and UI settings persistence status banners now render from shared snapshot selectors.

Validation evidence:

1. `node --test test/settingsAuthorityMatrixWiring.test.js test/uiAutosaveAuthorityWiring.test.js test/settingsAuthorityStoreWiring.test.js test/llmSettingsHydrationGate.test.js test/storageSettingsHydrationGate.test.js`  
   Result: `19/19` passing.
2. `node --test --test-concurrency=1 test/studioSettingsGuiPersistencePropagation.test.js test/storageSettingsGuiPersistencePropagation.test.js test/llmSettingsGuiPersistencePropagation.test.js test/convergenceGuiSettingsPersistencePropagation.test.js test/sourceStrategyGuiPersistencePropagation.test.js test/convergenceCrossSurfaceGuiPersistencePropagation.test.js test/runtimeOpsGuiSettingsPersistencePropagation.test.js`  
   Result: `7/7` passing.
3. `npm run gui:build`  
   Result: passing (`tsc -b` + Vite production build; existing non-blocking esbuild CSS minify warning remains).

## Runtime LLM Token Fallback De-Hardcoding (2026-02-25, Current Pass)

`IndexingPage` runtime LLM token fallback behavior now avoids hardcoded literal defaults and derives fallback token defaults from authority/bootstrap state:

- `tools/gui-react/src/pages/indexing/IndexingPage.tsx` now derives `llmTokenPresetFallbackOptions` from runtime authority bootstrap token knobs (`llmTokensPlan`, `llmTokensTriage`, role/fallback token caps).
- `llmTokenPresetOptions` now falls back to authority-derived preset options when `indexingLlmConfig.token_presets` is unavailable.
- `resolveModelTokenDefaults` now falls back to authority-derived token defaults/ceilings (`llmTokenPresetOptions` + runtime bootstrap) instead of hardcoded `2048`/`8192`.
- Hardcoded static preset array fallback (`[256, 384, ..., 8192]`) is removed from runtime LLM token fallback path.

Validation evidence:

1. `node --test test/runtimeLlmTokenFallbackWiring.test.js test/runtimeLlmInitResetGuardWiring.test.js test/runtimeLlmDropdownOptionStabilityWiring.test.js test/runtimeSettingsInitialBootstrapWiring.test.js test/runtimeAutosavePayloadBaselineWiring.test.js test/runtimeRunPayloadBaselineWiring.test.js test/runtimeSettingsKeyCoverageMatrix.test.js`  
   Result: `7/7` passing.
2. `node --test --test-concurrency=1 test/runtimeOpsGuiSettingsPersistencePropagation.test.js test/llmSettingsGuiPersistencePropagation.test.js test/convergenceGuiSettingsPersistencePropagation.test.js test/convergenceCrossSurfaceGuiPersistencePropagation.test.js test/storageSettingsGuiPersistencePropagation.test.js test/sourceStrategyGuiPersistencePropagation.test.js test/studioSettingsGuiPersistencePropagation.test.js`  
   Result: `7/7` passing.
3. `npm run gui:build`  
   Result: passing (`tsc -b` + Vite production build; existing non-blocking esbuild CSS minify warning remains).

## Runtime LLM Token Min-Floor Contract Wiring (2026-02-25, Current Pass)

Runtime LLM token minimum clamping in `IndexingPage` now uses shared manifest limits instead of hardcoded floor literals:

- `tools/gui-react/src/pages/indexing/IndexingPage.tsx` now imports `LLM_SETTING_LIMITS` from `settingsManifest`.
- `LLM_MIN_OUTPUT_TOKENS` is now derived from `LLM_SETTING_LIMITS.maxTokens.min`.
- Both `resolveModelTokenDefaults` and `clampTokenForModel` now clamp with `LLM_MIN_OUTPUT_TOKENS` (no hardcoded `128` floor literals).

Validation evidence:

1. `node --test test/runtimeLlmTokenFallbackWiring.test.js test/runtimeLlmInitResetGuardWiring.test.js test/runtimeLlmDropdownOptionStabilityWiring.test.js test/runtimeSettingsInitialBootstrapWiring.test.js test/runtimeAutosavePayloadBaselineWiring.test.js test/runtimeRunPayloadBaselineWiring.test.js test/runtimeSettingsKeyCoverageMatrix.test.js`  
   Result: `7/7` passing.
2. `node --test --test-concurrency=1 test/runtimeOpsGuiSettingsPersistencePropagation.test.js test/llmSettingsGuiPersistencePropagation.test.js test/convergenceGuiSettingsPersistencePropagation.test.js test/convergenceCrossSurfaceGuiPersistencePropagation.test.js test/storageSettingsGuiPersistencePropagation.test.js test/sourceStrategyGuiPersistencePropagation.test.js test/studioSettingsGuiPersistencePropagation.test.js`  
   Result: `7/7` passing.
3. `npm run gui:build`  
   Result: passing (`tsc -b` + Vite production build; existing non-blocking esbuild CSS minify warning remains).

## Runtime LLM Token Cap Parser Contract Wiring (2026-02-25, Current Pass)

Runtime LLM token cap parsing in `IndexingPage` is now normalized through a shared limit-aware parser:

- `tools/gui-react/src/pages/indexing/IndexingPage.tsx` now defines `parseRuntimeLlmTokenCap(...)`.
- Parser enforces shared min/max bounds from `LLM_SETTING_LIMITS.maxTokens.{min,max}`.
- Runtime token preset fallbacks, config token presets, profile token caps, and token-default reads now all pass through this parser.
- Prevents out-of-contract token caps from creating UI/runtime clamp drift across fallback/default/profile paths.

Validation evidence:

1. `node --test test/runtimeLlmTokenFallbackWiring.test.js test/runtimeLlmInitResetGuardWiring.test.js test/runtimeLlmDropdownOptionStabilityWiring.test.js test/runtimeSettingsInitialBootstrapWiring.test.js test/runtimeAutosavePayloadBaselineWiring.test.js test/runtimeRunPayloadBaselineWiring.test.js test/runtimeSettingsKeyCoverageMatrix.test.js`  
   Result: `7/7` passing.
2. `node --test --test-concurrency=1 test/runtimeOpsGuiSettingsPersistencePropagation.test.js test/llmSettingsGuiPersistencePropagation.test.js test/convergenceGuiSettingsPersistencePropagation.test.js test/convergenceCrossSurfaceGuiPersistencePropagation.test.js test/storageSettingsGuiPersistencePropagation.test.js test/sourceStrategyGuiPersistencePropagation.test.js test/studioSettingsGuiPersistencePropagation.test.js`  
   Result: `7/7` passing.
3. `npm run gui:build`  
   Result: passing (`tsc -b` + Vite production build; existing non-blocking esbuild CSS minify warning remains).

## RuntimePanel Token Handler Contract Cleanup (2026-02-25, Current Pass)

RuntimePanel LLM token select handlers now rely only on shared clamp/default logic and no longer use page-local token fallbacks:

- `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx` removed `Number.parseInt(... ) || llmTokens*` fallback branches from all role/fallback token `<select>` handlers.
- Handlers now pass parsed values directly into shared `clampTokenForModel(...)`, so invalid/NaN fallback resolution is centralized in `IndexingPage` shared clamp/default contract.
- Regression guard added in `test/runtimeLlmTokenFallbackWiring.test.js` to prevent reintroducing local RuntimePanel fallback branches.

Validation evidence:

1. `node --test test/runtimeLlmTokenFallbackWiring.test.js test/runtimeLlmInitResetGuardWiring.test.js test/runtimeLlmDropdownOptionStabilityWiring.test.js test/runtimeSettingsInitialBootstrapWiring.test.js test/runtimeAutosavePayloadBaselineWiring.test.js test/runtimeRunPayloadBaselineWiring.test.js test/runtimeSettingsKeyCoverageMatrix.test.js`  
   Result: `7/7` passing.

## LLM Settings Slider Clamp Contract Cleanup (2026-02-25, Current Pass)

LLM route-matrix slider handlers now use shared clamp fallback behavior without local parse fallback branches:

- `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` effort/max-tokens/min-evidence slider handlers removed local `Number.parseInt(... ) || ...min` fallbacks.
- `clampToRange(...)` now centralizes non-finite value fallback via `safeValue` before min/max clamping.
- `toEffortBand(...)` now uses bounds-driven non-finite fallback (`EFFORT_BOUNDS.min`) instead of hardcoded `effort || 3`.
- Added `test/llmSettingsRangeClampWiring.test.js` to guard slider handler + clamp fallback contract wiring.

Validation evidence:

1. `node --test test/llmSettingsRangeClampWiring.test.js test/llmSettingsAuthorityWiring.test.js test/llmSettingsHydrationGate.test.js test/llmSettingsAutosaveStatusParity.test.js test/llmSettingsInitialBootstrapWiring.test.js`  
   Result: `5/5` passing.
2. `node --test --test-concurrency=1 test/llmSettingsGuiPersistencePropagation.test.js`  
   Result: `1/1` passing.
3. `npm run gui:build`  
   Result: passing (`tsc -b` + Vite production build; existing non-blocking esbuild CSS minify warning remains).

## Studio Numeric Knob Clamp Contract Cleanup (2026-02-25, Current Pass)

Studio Key Navigator + Workbench Drawer numeric knob parsing now uses shared bounded helpers and no longer relies on local `parseInt/parseFloat ... ||` fallback coercion:

- Added shared helper module: `tools/gui-react/src/pages/studio/numericInputHelpers.ts`.
- Added shared bounds/defaults module: `tools/gui-react/src/pages/studio/studioNumericKnobBounds.ts`.
- `tools/gui-react/src/pages/studio/StudioPage.tsx` and `tools/gui-react/src/pages/studio/workbench/WorkbenchDrawer.tsx` now use:
  - `parseBoundedIntInput(...)` for bounded integer knobs (rounding decimals, effort, min evidence refs).
  - `parseBoundedFloatInput(...)` for component-match float knobs.
  - `parseOptionalPositiveIntInput(...)` + `clampNumber(...)` for nullable AI knobs (`ai_assist.max_calls`, `ai_assist.max_tokens`).
- `tools/gui-react/src/pages/studio/workbench/WorkbenchBulkBar.tsx` now uses `parseBoundedIntInput(...)` and shared `evidenceMinRefs` bounds for bulk evidence-ref writes (no local `parseInt(... ) || 0`).
- Studio map normalization paths now clamp through the same shared bounds contract (`normalizePriorityProfile`, `normalizeAiAssistConfig`) instead of local inline numeric clamp literals.
- Min/max/fallback/default values for these Studio numeric knobs are now sourced from shared bounds constants (no duplicated literal ranges across Key Navigator vs Workbench).
- Key Navigator + Workbench min-evidence readers now use `STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback` for missing legacy values (no local `... , 1` fallback literal drift).
- Workbench row projection (`workbenchHelpers`) now uses the same shared `evidenceMinRefs.fallback` contract for min-evidence display values.
- `component.match.*` controls now preserve explicit `0` values (previous `parseFloat(...) || default` paths could coerce `0` to fallback defaults).
- `numN(...)` in both `StudioPage` and `workbenchHelpers` is now nullish-aware (`parsed === null ? fallback : parsed`) and no longer `||`-coerces parsed low/zero values.
- Added wiring regression test: `test/studioNumericInputClampWiring.test.js`.

Validation evidence:

1. `node --test test/studioNumericInputClampWiring.test.js test/studioDeferredKnobLock.test.js test/studioAutosaveStatusParity.test.js test/studioPersistenceAuthorityWiring.test.js test/studioConsumerToggleImmediatePropagation.test.js`  
   Result: `6/6` passing.
2. `node --test --test-concurrency=1 test/studioSettingsGuiPersistencePropagation.test.js`  
   Result: `1/1` passing.
3. `npm run gui:build`  
   Result: passing (`tsc -b` + Vite production build; existing non-blocking esbuild CSS minify warning remains).

## Full GUI Reload Matrix Rerun (2026-02-25, Current Pass)

End-to-end reload durability and consumer rehydration was revalidated across all main settings surfaces:

1. `test/studioSettingsGuiPersistencePropagation.test.js`
2. `test/storageSettingsGuiPersistencePropagation.test.js`
3. `test/llmSettingsGuiPersistencePropagation.test.js`
4. `test/convergenceGuiSettingsPersistencePropagation.test.js`
5. `test/sourceStrategyGuiPersistencePropagation.test.js`
6. `test/convergenceCrossSurfaceGuiPersistencePropagation.test.js`
7. `test/runtimeOpsGuiSettingsPersistencePropagation.test.js`

Run command:

- `node --test --test-concurrency=1` (all seven files above)

Result:

- `7/7` passing (reload persistence + cross-surface consumer propagation verified).

## Hardcoded/No-Effect Findings

- No blocking hardcoded/no-effect issues found across audited frontend settings surfaces.
- Known intentional exception remains: LLM `effort_band` is derived UI metadata, not a runtime control knob.

## Verdict

Audit verdict: PASS.

All frontend setting knobs that users can save/autosave in audited settings surfaces persist across reload and are wired to global/shared authority state where expected. Downstream runtime consumers were verified by targeted runtime-wiring tests and behavior tests.

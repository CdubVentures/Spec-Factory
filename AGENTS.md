# CLAUDE.grid.md - Spec Factory / Field Studio Grid

This file is read at session start and after every context compaction.
Keep it up to date as the project evolves.

---


## Active Implementation Plan

Tracking rule: every phase must be checked off only after tests are green and evidence is captured in docs/tests.

### Phase 0 - Baseline and safety net
- [x] Run current targeted test suites and record baseline failures/pass rates.
- [x] Add/extend characterization tests for current settings persistence behavior before refactor.
- [x] Capture an initial "frontend knob inventory seed" from code search to avoid missing hidden surfaces.
- [x] Confirm one end-to-end product flow runs successfully before structural changes.

### Phase 1 - Full frontend knob inventory and source trace
- [x] Enumerate every setting/save/autosave/inline edit control in `tools/gui-react/src` (inputs, toggles, selects, drawers, modals, hotkeys, quick actions).
- [x] Map each control to: UI component, current state owner, save trigger, persistence target, and read path on app load.
- [x] Identify duplicate settings exposed in multiple UI locations and document canonical key ownership.
- [x] Produce an auditable source map of all writers and readers (frontend + backend routes + db columns/files).

### Phase 2 - Settings authority contract
- [x] Define canonical settings schema (keys, types, defaults, versioning, migration rules). *(single backend contract added in `src/api/services/settingsContract.js`; `userSettingsService` now consumes this contract for schema version + migration + canonical key envelopes.)*
- [x] Define authority precedence (server snapshot vs local cache vs runtime defaults) with deterministic merge order. *(deterministic precedence is explicit via `SETTINGS_AUTHORITY_PRECEDENCE`; canonical runtime/convergence/storage/ui reads are now `user`-authority-only in `userSettingsService` load paths.)*
- [x] Define update contract: single write API, autosave debounce rules, optimistic update behavior, rollback behavior. *(autosave debounce/status timing contract remains centralized in `tools/gui-react/src/stores/settingsManifest.ts`; optimistic update + rollback semantics are now centralized in `tools/gui-react/src/stores/settingsMutationContract.ts` and consumed by runtime/convergence/storage/ui/llm/source-strategy authorities.)*
- [x] Define propagation contract for cross-surface updates (same-tab, cross-tab, websocket/event invalidation where needed). *(same-tab propagation remains authority/query-cache + invalidation based; cross-tab settings propagation is now explicit through `tools/gui-react/src/stores/settingsPropagationContract.ts` storage-event bus; bootstrap subscribers in `settingsAuthority.ts` route domain events to scoped reload/invalidation.)*
- [x] Make the canonical source of truth a single `user-settings.json` model that includes category-mapping studio config and all runtime/convergence/llm/storage settings.
- [ ] Define deterministic generation pipeline where all derived config artifacts are generated from `user-settings.json`, not vice versa.

### Settings audit gap log (2026-02-25)
- [x] `Storage settings` mutations now persist and restore on restart through the settings authority write/read path.
- [x] Runtime persistence no longer uses fallback coercion that overwrites explicit low/falsy values.
- [x] Convergence slider + toggle fallbacks in `PipelineSettingsPage` and `RuntimePanel` now use canonical defaults (`CONVERGENCE_SETTING_DEFAULTS`) instead of schema minima/implicit false coercion.
- [x] Runtime `dynamicFetchPolicyMapJson` is now part of the persisted runtime payload and write schema.
- [x] Canonical backend settings contract is now centralized in `src/api/services/settingsContract.js` (schema version, migration rules, canonical key sets, UI defaults, precedence contract).
- [x] Runtime + convergence route validation contracts are now centralized in `src/api/services/settingsContract.js` and consumed by `src/api/routes/configRoutes.js` (no duplicate route-local knob-map literals).
- [x] `user-settings` runtime/convergence trust boundaries now apply canonical typed sanitization (`RUNTIME_SETTINGS_VALUE_TYPES`, `CONVERGENCE_SETTINGS_VALUE_TYPES`) before merge/apply, preventing non-coercible stale types from mutating live config.
- [x] `user-settings` persistence now has AJV schema validation at write boundaries (`validateUserSettingsSnapshot`) with explicit failure surfacing (`user_settings_snapshot_validation_failed`) before disk commit.
- [x] Settings persistence telemetry now records write attempts/outcomes and stale-read/migration detection in `src/observability/settingsPersistenceCounters.js`, with route-level outcome targets (`*-settings-route`) and file-level target (`user-settings.json`).
- [x] `user-settings` persistence is now serialized through a single in-process queue (`persistUserSettingsSections`), preventing concurrent read-modify-write clobber across autosave/live route writes.
- [x] `user-settings` disk writes now use atomic temp-file replace and strict-read guards during persist (`strictRead: true`), so invalid/truncated JSON cannot be silently normalized to an empty snapshot.
- [x] Data authority observability snapshots now expose `settings_persistence` counters, including stale-read detection and settings write failure/success state.
- [x] Frontend autosave debounce + status timings are now centralized in `tools/gui-react/src/stores/settingsManifest.ts` (`SETTINGS_AUTOSAVE_DEBOUNCE_MS`, `SETTINGS_AUTOSAVE_STATUS_MS`) and consumed by runtime/storage/LLM/UI/studio autosave paths.
- [x] Runtime + Studio autosave timing indicator text now derives from the same debounce contract constants, preventing UI timing copy from drifting away from actual autosave behavior.
- [x] Convergence defaults are now first-class manifest keys (`CONVERGENCE_SETTING_DEFAULTS`) consumed by convergence authority bootstrap/hydration and by both Runtime + Pipeline convergence controls for undefined-value fallback.
- [x] Storage defaults are now first-class manifest keys (`STORAGE_SETTING_DEFAULTS`) consumed by settings bootstrap payloads, storage authority sanitization/bootstrap, and `StoragePage` form fallbacks.
- [x] Storage authority/bootstrap/form string readers are now nullish-aware (not `||`-coerced), so explicit persisted empty values are not silently replaced by manifest defaults on hydration.
- [x] Convergence knob definitions remain duplicated across `pipeline-settings` and authority modules.
- [x] Canonical defaults manifest is now a single initialization source for runtime/convergence/storage/ui/autosave surfaces via shared module `src/shared/settingsDefaults.js`, consumed by frontend `settingsManifest.ts` and backend `settingsContract.js`.
- [x] `IndexingPage` no longer seeds runtime LLM knob state from `indexingLlmConfig` defaults before runtime authority hydration; runtime LLM knobs now hydrate only from authority bootstrap/snapshot state.
- [x] AppShell now blocks first settings-sensitive page paint on canonical settings readiness (`isSettingsAuthoritySnapshotReady`) with explicit degraded-mode fallback messaging if hydration remains delayed.
- [x] `IndexingPage` and `PipelineSettingsPage` readiness gates now consume shared `settingsAuthorityStore` snapshot keys (`runtimeReady`, `convergenceReady`, `sourceStrategyReady`) instead of page-local data-presence heuristics.
- [x] `StoragePage` hydration/write gating now consumes shared `settingsAuthorityStore` snapshot key (`storageReady`) instead of component-local hydrate mirrors, while preserving unsaved-edit clobber guards.
- [x] `LlmSettingsPage` hydration/write gating now consumes shared `settingsAuthorityStore` snapshot key (`llmSettingsReady`) instead of page-local loading-only checks.
- [x] `AppShell` now reads canonical settings snapshot from shared `settingsAuthorityStore` selectors (bootstrap hook is hydrator-only), eliminating direct page-local snapshot consumption from bootstrap return values.
- [x] Runtime/convergence/pipeline save-status flows no longer clear `error`/`partial` state on dirty edits; failed/partial persistence truth remains visible until subsequent persistence outcomes replace it.
- [x] `IndexingPage` runtime LLM model-token fallback defaults now derive from authority/bootstrap token baselines plus `indexingLlmConfig` presets (when present), removing hardcoded `2048/8192` and static token-preset literal array drift.
- [x] `IndexingPage` runtime LLM token floor clamp now derives from shared manifest limit (`LLM_SETTING_LIMITS.maxTokens.min`) instead of hardcoded `128` literals in default/token-clamp paths.
- [x] `IndexingPage` runtime LLM token preset/profile/default parsing now normalizes via a shared limit-aware parser (`parseRuntimeLlmTokenCap`) using manifest min/max (`LLM_SETTING_LIMITS.maxTokens.{min,max}`), preventing out-of-contract token caps from drifting UI/runtime clamp behavior.
- [x] `RuntimePanel` LLM token-select handlers now pass parsed values directly into shared `clampTokenForModel` (no local `|| llmTokens*` fallback), so invalid selection fallback behavior is owned by the shared clamp/default contract; regression-covered in `test/runtimeLlmTokenFallbackWiring.test.js`.
- [x] `LlmSettingsPage` slider handlers now pass parsed values directly into shared `clampToRange` (no local `|| ...min` fallback branches), clamp fallback for non-finite values is centralized in `clampToRange` (`safeValue`), and effort-band fallback no longer uses hardcoded `3` (`toEffortBand` now uses bounds-driven fallback); regression-covered in `test/llmSettingsRangeClampWiring.test.js`.
- [x] Studio + Workbench numeric knob handlers now use shared bounded parse helpers (`numericInputHelpers`) and shared bounds/defaults contract (`studioNumericKnobBounds`) instead of local `parseInt/parseFloat ... ||` fallbacks or duplicated literals; `WorkbenchBulkBar` evidence-ref bulk writes now use the same bounded helper/contract; Studio map normalization (`normalizePriorityProfile`, `normalizeAiAssistConfig`) now clamps through shared bounds contract; min-evidence fallback reads in Key Navigator + Workbench (including Workbench row projection) now use shared `evidenceMinRefs.fallback` (no local `... || 1` literals); `component.match.*` controls preserve explicit `0` values and nullable AI knobs keep deterministic null-vs-bounded semantics; regression-covered in `test/studioNumericInputClampWiring.test.js`.
- [x] LLM settings save-status flow no longer clears `error`/`partial` state to `idle` on dirty edits; failed persistence truth remains visible ahead of generic unsaved labels.
- [x] Storage and Source Strategy save-status flows now preserve persistence outcome truth on local edits (no edit-triggered state wipe), with explicit saving/error/unsaved precedence in UI labels.
- [x] Failed autosave/error outcome handling is now surfaced as persisted-state truth across settings surfaces, including global `/ui-settings` autosave-toggle persistence (`uiSettingsPersistState` + `uiSettingsPersistMessage`) with AppShell saving/error banners.
- [x] LLM route-matrix editor knobs now affect runtime extraction behavior (field-policy mapping, evidence source mode, model ladder/tokens, studio prompt flags, insufficient-evidence action).
- [x] LLM autosave mode is now global durable state (`llmSettingsAutoSaveEnabled`) persisted via `/ui-settings` and hydrated from `user-settings.json`.
- [x] GUI API bootstrap now initializes `config` before settings hydration (`src/api/guiServer.js`).
- [x] Source strategy authority/routes are now category-scoped and runtime discovery consumes category-enabled source-strategy rows from SpecDb.
- [x] Source strategy authority now disables query/mutation paths in `category=all` scope, and `PipelineSettingsPage` renders an explicit category-required state instead of issuing invalid category-scoped writes.
- [x] Convergence knobs for identity caps / SERP triage min-max-enable / retrieval identity filter now affect runtime execution paths.
- [x] Global autosave-mode toggles (studio all/contract/map, runtime, storage) now persist through `/ui-settings` into `user-settings.json` and hydrate on app bootstrap.
- [x] Field Rules Studio `Auto-save ALL` now hard-locks Mapping Studio (tab1), Key Navigator (tab2), and Field Contract (tab3) autosave toggles to ON with explicit locked-state labels.
- [x] Studio nested writers under Key Navigator and Field Contract now respect autosave ownership (autosave-gated save path) and no longer bypass autosave mode with unconditional save commits.
- [x] `Storage settings` now persist from `StoragePage` through `useStorageSettingsAuthority` and are restored via the settings authority write/read pipeline.
- [x] `WorkersTab` no longer reads `/runtime-settings` directly (`useQuery`) and now consumes runtime settings via authority hook/snapshot.
- [x] Canonical settings model now includes category-studio mapping as a first-class persisted key in `user-settings.json`.
- [x] Runtime planner/triage UI now hard-locks closed when discovery is disabled and shows an explicit red blocked reason badge.
- [x] Field Rules Studio now recovers from stale session UI state by auto-selecting the first valid key, clearing invalid group filters, and seeding mapping from map payload shape (not only `version`).
- [x] Studio map read path now ignores missing/empty `user-settings` studio entries so canonical field-studio maps load instead of blank map payloads.
- [x] Review grid layout/source metadata now emits canonical field-studio naming (no `excel` layout block, fallback source token now `reference`, method token `contract_import`). *(validated by `test/reviewGridData.test.js`, `test/reviewLaneContractApi.test.js`, `test/reviewLaneContractGui.test.js`, `test/studioRoutesPropagation.test.js`, and `test/reviewCli.test.js`.)*
- [x] Compiler dry-run/source bootstrap now prefers canonical map source key `field_studio_source_path` (with legacy `workbook_path` fallback only for compatibility).
- [x] Autosave for runtime/storage/llm/studio now tracks last attempted payload fingerprints so unchanged failed payloads do not retry-loop; manual save paths can still force retry.
- [x] Settings authority reads for runtime/storage/convergence/ui no longer use fixed query polling intervals; hydration/refresh uses bootstrap reload plus invalidation.
- [x] Studio map GET now deterministically selects the richer source between `user-settings` and control-plane map files, preventing legacy partial `user-settings` map payloads from masking complete category maps.
- [x] Indexing `Run IndexLab` is now hydration-gated on runtime settings authority load, preventing pre-hydration defaults from overriding persisted runtime settings.
- [x] Runtime panel settings controls now hard-lock until runtime settings hydrate, preventing pre-hydration edits from writing default drift.
- [x] Deferred Studio contract knobs (`contract.unknown_token`, `contract.rounding.mode`, `contract.unknown_reason_required`) are now locked in Key Navigator + Workbench Drawer with explicit `Deferred: runtime wiring in progress` labels.
- [x] `StoragePage` autosave/manual save are now hydration-gated; writes stay disabled until initial storage-settings hydration settles.
- [x] `implementation/gui-persistence/llm-route-field-usage-audit.json` is now generated from source with a deterministic audit script (`scripts/generate-llm-route-field-usage-audit.js`) and regression-guarded by `test/llmRouteFieldUsageAudit.test.js`; only derived `effort_band` remains dormant by design.
- [x] Studio save status now prioritizes `saveStudioDocsMut` error and unsaved-pending state before autosave idle labels, preventing false `Up to date`/`Auto-saved` indicators while edits are unsaved or save failed.
- [x] LLM settings header now distinguishes autosave dirty state (`Unsaved (auto-save pending).`) from manual-save dirty state.
- [x] Runtime/convergence/storage settings routes now await persistence writes before returning success, preventing out-of-order stale snapshot overwrites during rapid successive saves.
- [x] Runtime/convergence/storage settings routes now return `500` with explicit error codes and rollback in-memory state when persistence writes fail (`runtime_settings_persist_failed`, `convergence_settings_persist_failed`, `storage_settings_persist_failed`).
- [x] Runtime + storage settings routes keep rollback-safe write ordering when legacy snapshots are enabled, and canonical-only mode (`SETTINGS_CANONICAL_ONLY_WRITES=true`) skips legacy snapshot writes entirely.
- [x] LLM settings autosave now flushes pending dirty payload on unmount, so debounce-window edits are not dropped on navigation/reload.
- [x] Studio map-doc autosave now flushes pending dirty payload on unmount, so debounce-window edits are not dropped on navigation/reload.
- [x] Convergence duplicate controls now have explicit cross-surface wiring coverage proving shared authority ownership + canonical knob-key propagation in both Runtime and Pipeline surfaces.
- [x] Runtime settings hydration in `IndexingPage` now uses binding-driven key maps (string/number/boolean) instead of hand-written per-key branches, reducing selector drift risk across save/load/read paths.
- [x] Indexing run-control/start payload fallbacks now derive from hydrated runtime authority baseline (`runtimeSettingsData`) rather than hardcoded `runtimeDefaults` once hydration is available.
- [x] Settings endpoint ownership matrix now includes `/source-strategy`, ensuring source-strategy controls remain authority-owned and page surfaces cannot bypass persistence adapters directly.
- [x] Runtime autosave payload serialization now uses an authority-synced numeric fallback baseline (`runtimeSettingsFallbackBaseline`) instead of direct `runtimeDefaults` numeric fallbacks after hydration.
- [x] Runtime + storage autosave authorities now have explicit unmount-flush regression coverage, matching LLM/studio debounce-window durability guarantees.
- [x] Storage page save-state labels now have explicit parity coverage for autosave-pending vs manual unsaved truth (`Unsaved changes queued for auto save.` vs `Unsaved changes.`).
- [x] Runtime Ops `WorkersTab` now has explicit propagation coverage proving downstream prefetch surfaces consume runtime knobs from shared runtime authority snapshot (`liveSettings`) rather than endpoint-local reads.
- [x] Runtime settings/store modules now expose shared cache-reader/bootstrap helpers (`readRuntimeSettingsSnapshot`, `readRuntimeSettingsBootstrap`) so consumers do not re-implement runtime query-key reads locally.
- [x] Storage settings/store modules now expose shared bootstrap helpers (`readStorageSettingsBootstrap`) so page initialization no longer duplicates storage snapshot/default coercion logic.
- [x] LLM settings/store modules now expose shared bootstrap helpers (`readLlmSettingsBootstrapRows`) so category route-table initialization no longer duplicates `llm-settings-routes` cache-read logic.
- [x] `IndexingPage`, `StoragePage`, `LlmSettingsPage`, and Runtime Ops `WorkersTab` now consume authority bootstrap/snapshot helpers (no direct page-local query-key cache reads for runtime/storage/llm settings bootstrap paths).
- [x] Frontend non-authority surfaces (`pages/`, `components/`, `hooks/`) no longer call query-cache reads directly (`.getQueryData(...)`), keeping settings read ownership inside authority/store modules.
- [x] UI autosave fallback defaults are now centralized in `settingsManifest` (`UI_SETTING_DEFAULTS`) and consumed by both `uiStore` session-fallback initialization and `/ui-settings` authority sanitization (no duplicated hardcoded `true/false` fallback literals for autosave knobs).
- [x] Shared Studio autosave invariant is now canonicalized across backend + frontend settings sanitization (`studioAutoSaveMapEnabled` and `studioAutoSaveAllEnabled` force `studioAutoSaveEnabled=true`), preventing persisted Mapping vs Key Navigator autosave drift.
- [x] Studio autosave controls now propagate shared lock ownership reason (`Auto-save ALL` vs `Auto-save Mapping`) across action bar, Key Navigator, and Field Contract/Workbench.
- [x] `/ui-settings` PUT now reports normalized `applied` values after canonicalization, so save responses and change events match persisted autosave truth.
- [x] Runtime Ops prefetch `liveSettings` projection now derives from authority-or-cache runtime snapshots without hard-coercing missing values to false/empty; search-profile planner badge now falls back to artifact-derived planner state when live runtime settings are unavailable.
- [x] Runtime Ops planner/triage header badges now render only when corresponding live runtime knobs are defined, preventing transient unhydrated state from incorrectly rendering `OFF`.
- [x] Runtime Ops Search Results domain-cap display now reports explicit `hydrating` state until runtime settings authority snapshot is available, avoiding pre-hydration fallback drift to synthetic default caps.
- [x] Runtime settings persistence snapshots now include `perHostMinDelayMs`, so delay edits persist across restart in both `settings.json` and `user-settings.json`.
- [x] `IndexingPage` LLM defaults bootstrap now skips model/toggle writes when runtime settings are already hydrated or currently dirty, preventing `phase2LlmEnabled` / `phase3LlmTriageEnabled` reset clobber during late LLM-config hydration.
- [x] Runtime LLM dropdown option lists now retain all currently selected model tokens (primary + fallback) in addition to backend option rows, preventing `<select>` fallback/reset when option rows refresh.
- [x] Runtime key coverage matrix is regression-guarded so every `/runtime-settings` PUT key is serialized by `collectRuntimeSettingsPayload` and forwarded into `/process/start` payload wiring (with explicit alias coverage for fallback model key names).
- [x] Full cross-domain frontend settings pass (runtime + convergence + storage + UI autosave + LLM routes + source strategy + studio shared-tab wiring) is now regression-backed by focused persistence/authority/autosave suites and key-coverage matrix tests.
- [x] Studio/Field Rules shared-tab autosave propagation paths (Key Navigator + Workbench immediate-commit writers + Auto-save ALL + Auto-save Mapping lock behavior) revalidated with focused regression suites.
- [x] Studio autosave GUI flow now has browser-level persistence + cross-tab propagation coverage (`test/studioSettingsGuiPersistencePropagation.test.js`) validating `/ui-settings` durability and locked-state parity after reload.
- [x] Storage settings GUI flow now has browser-level manual-save + autosave + reload persistence coverage (`test/storageSettingsGuiPersistencePropagation.test.js`) validating `/storage-settings` and `/ui-settings` durability for destination/credential knobs and autosave mode.
- [x] LLM settings GUI flow now has browser-level manual-save + autosave + reload persistence coverage (`test/llmSettingsGuiPersistencePropagation.test.js`) validating route-matrix knob durability (`insufficient_evidence_action`, `enable_websearch`) and global autosave-mode persistence through `/ui-settings`.
- [x] Convergence tuning GUI flow now has browser-level save + reload persistence coverage (`test/convergenceGuiSettingsPersistencePropagation.test.js`) validating Runtime Panel knob durability through `/convergence-settings`.
- [x] Pipeline Settings is now routed in `App.tsx` and exposed in `TabNav`, enabling browser-level Source Strategy persistence coverage (`test/sourceStrategyGuiPersistencePropagation.test.js`) for row toggle durability through `/source-strategy`.
- [x] Convergence shared knobs now have browser-level cross-surface sync + persistence coverage (`test/convergenceCrossSurfaceGuiPersistencePropagation.test.js`) validating `serpTriageEnabled` propagation between Pipeline Settings and Indexing Runtime Panel plus reload durability.
- [x] Settings bootstrap now publishes canonical snapshot state into a shared `settingsAuthorityStore` (`hydrateOnce` + `patchSnapshot` + `resetSnapshot` + selector reads), enabling single-store subscription across settings-ready/Autosave state consumers.
- [x] Studio Mapping tab autosave tooltip wiring now defines `studioMapAutoSaveDelaySeconds` inside `MappingStudioTab`, preventing Studio page runtime crash (`studioMapAutoSaveDelaySeconds is not defined`) that blocked settings controls from rendering.
- [x] Session-persistence key registry now matches live IndexLab Event Stream nested keys in source (`indexing:eventStream:nested:{category}:panelControls/sessionData`), preventing doc-vs-source drift in persistence audits.
- [x] GUI server now resolves relative settings/storage path roots against project root (`helperFilesRoot`, `localInputRoot`, `localOutputRoot`, `indexlab-root`, GUI `DIST_ROOT`, and SearXNG compose path), preventing session persistence drift when launched from non-root cwd.
- [x] Non-root launch regression is now covered by `test/guiServerRootPathResolution.test.js`, asserting `/ui-settings` writes persist to project-root-relative `helper_files/_runtime` rather than launch-cwd shadow paths.
- [x] GUI startup now hard-fails when launch-cwd shadow runtime exists (`helper_files/_runtime` under non-canonical cwd) to prevent split settings stores before writes start.
- [x] Canonical-only settings write mode is now behind migration flag `SETTINGS_CANONICAL_ONLY_WRITES=true` (runtime/convergence/storage routes skip legacy `settings*.json` snapshots and write canonical `user-settings.json` only).
- [x] Canonical-only write mode regression is covered by `test/settingsCanonicalOnlyWrites.test.js`.
- [x] Canonical user-settings load precedence now excludes legacy `settings*.json` read fallbacks (`SETTINGS_AUTHORITY_PRECEDENCE.runtime/convergence/storage = ['user']`; `userSettingsService` load paths read/migrate/sanitize `user-settings.json` only).
- [x] Shared defaults manifest now lives in `src/shared/settingsDefaults.js` (convergence/runtime/storage/ui/autosave), and both frontend `tools/gui-react/src/stores/settingsManifest.ts` and backend `src/api/services/settingsContract.js` read defaults from this single source.
- [x] Shared-default wiring regressions now assert literal defaults live in `src/shared/settingsDefaults.js` while `settingsManifest.ts` consumes the shared manifest (`test/convergenceDefaultsManifestWiring.test.js`, `test/settingsAutosaveDebounceContractWiring.test.js`, `test/uiSettingsDefaultsManifestWiring.test.js`).
- [x] Frontend production build validates shared-default cross-package wiring (`npm run gui:build`).
- [x] Strict settings/autosave matrix revalidation (latest local run): 161/161 passing.
- [x] Focused settings route/contract/persistence suites revalidated after canonical-only migration updates: 32/32 passing.
- [x] Mouse tab3 parity now has explicit regression coverage (`test/mouseTab3GeneratedParity.test.js`) asserting selected keys, field overrides, and component-property keys resolve into generated field rules (with key migrations).
- [x] Compiler now emits canonical `field_studio_hints` only (no legacy `excel_hints` output), and review hint extraction reads canonical field-studio hints only (no `rule.excel*` fallback reads) (`test/fieldStudioHintsCanonicalWiring.test.js`).
- [x] Runtime compile/review no-excel trace gate now blocks `excel_hints`/`rule.excel*` contract drift and enforces thin legacy shim re-export shape for `excelSeed`/`excelCategorySync` (`test/noLegacyRuntimeTraceGate.test.js`).
- [x] Full compile/generated/test-compiler audit rerun evidence captured (`implementation/field-rules-studio/audits/2026-02-25-full-compile-generated-test-compiler-audit.md`): compile/validate/dry-run/rules-diff stable for `mouse/keyboard/monitor`; compiler + contract-driven suites green (`63/63` and `220/220`) with canonical hint/trace guard regressions green (`10/10`).
- [x] Mouse key authority matrix + tab3 coverage artifacts refreshed with current key migration state (`implementation/field-rules-studio/audits/2026-02-25-mouse-key-authority-matrix.csv`, `implementation/field-rules-studio/audits/2026-02-25-mouse-key-authority-matrix-summary.json`, `implementation/field-rules-studio/audits/2026-02-25-mouse-tab3-coverage-refresh.json`).

### Frontend settings control audit (2026-02-24)
- Persistence authority coverage for knobs: `tools/gui-react/src/stores/runtimeSettingsAuthority.ts`, `tools/gui-react/src/stores/convergenceSettingsAuthority.ts`, `tools/gui-react/src/stores/storageSettingsAuthority.ts`, `tools/gui-react/src/stores/llmSettingsAuthority.ts`, `tools/gui-react/src/stores/sourceStrategyAuthority.ts`, `tools/gui-react/src/stores/settingsAuthority.ts`.
- UI writers through authority:
  - Convergence controls in `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` and `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx` route to convergence authority updates.
  - Runtime knobs in `tools/gui-react/src/pages/indexing/IndexingPage.tsx` route through runtime authority.
  - Storage controls in `tools/gui-react/src/pages/storage/StoragePage.tsx` use storage authority autosave/manual save APIs.
  - LLM controls in `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` use LLM authority APIs.
  - Source strategy controls in `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` use source-strategy authority APIs.
  - Studio map docs are owned by `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts` and written via `saveMap`/`saveStudioDocs` mutations.
  - Studio Key Navigator + Field Contract nested edits now trigger saved map-doc persistence via autosave-gated authority paths (manual save remains explicit when autosave is off).
- Read/hydration path:
  - Startup bootstrap now hydrates runtime + convergence + storage + source-strategy through `tools/gui-react/src/components/layout/AppShell.tsx`; LLM routes are preloaded for the active category.
  - Consumers should read via authority selectors (`useAuthoritySnapshot` + dedicated hooks), but some surfaces still carry local defaults on first render.
  - Indexing run-start actions now wait for runtime settings hydration before enabling run dispatch.
- No-op hardcoded behavior check:
  - Convergence undefined-value fallback now resolves from canonical defaults (`CONVERGENCE_SETTING_DEFAULTS`) in the primary slider surfaces.
  - Runtime numeric text/numeric parsing and serialization now go through authority schema-aware helpers rather than local ad-hoc coercion.
  - Runtime execution now consumes persisted convergence keys (`needsetCapIdentity*`, `serpTriage*`, `retrievalIdentityFilterEnabled`) in convergence/triage/retrieval flows.
  - Source strategy table mutations are now consumed by runtime discovery via category-scoped SpecDb reads in run execution.
  - Source strategy authority is explicitly disabled in `category=all` scope so UI cannot issue invalid category-scoped writes.
  - Planner/Triage runtime section is non-interactive and force-collapsed while `discoveryEnabled=false`, with a visible blocked-state reason.
  - Studio `Auto-save ALL` lock propagation is consistent across tab1/tab2/tab3 autosave controls and status labels.
  - Deferred Studio contract knobs are non-editable across Key Navigator + Workbench Drawer until runtime wiring is complete.
  - Endpoint ownership check is clean: settings routes (`/runtime-settings`, `/convergence-settings`, `/storage-settings`, `/ui-settings`, `/llm-settings/*`, `/source-strategy*`) are referenced from authority modules, not page components.
  - Storage autosave/manual save paths are hydration-gated in `StoragePage`, preventing pre-hydration default writes.
  - Storage authority + page form fallback reads are nullish-aware, preventing explicit empty persisted values from being replaced by default literals during hydration/render.
  - Studio header save status now reports `Save failed` / `Unsaved (auto-save pending)` before `Up to date`, so autosave failure/dirty truth is visible.
  - LLM header save status now reports autosave dirty state explicitly (`Unsaved (auto-save pending).`) instead of generic dirty text.
  - Backend settings route writes now await persistence completion (`/runtime-settings`, `/convergence-settings`, `/storage-settings`) before returning success.
  - Indexing run-control and run-start payload fallbacks are authority-derived post-hydration, not `runtimeDefaults`-derived, preventing hardcoded runtime drift during launches.
  - Runtime autosave payload numeric serialization fallbacks are authority-synced post-hydration, preventing invalid numeric input fallback from drifting to hardcoded defaults.
  - Runtime Ops downstream prefetch panels consume `liveSettings` derived from runtime authority snapshot in `WorkersTab`, so runtime knob values propagate outside primary settings pages.

### Phase 3 - Single authoritative store foundation
- [x] Implement a single settings authority store module with: hydrate-once, subscribe/select, patch update, and reset APIs. *(implemented in `tools/gui-react/src/stores/settingsAuthorityStore.ts`; bootstrap publishes canonical snapshot via `useSettingsAuthorityBootstrap`.)*
- [x] Add persistence adapters for backend + local cache with schema validation at trust boundaries. *(`userSettingsService` now validates canonical snapshot envelope with AJV via `validateUserSettingsSnapshot` before `user-settings.json` writes; runtime/convergence typed sanitizers enforce trust boundaries on load/merge/apply.)*
- [x] Add migration/version handling for stored settings so old payloads are upgraded deterministically. *(`readUserSettingsDocumentMeta` + `migrateUserSettingsDocument` now provide deterministic schema-version upgrade path; stale schema versions emit migration telemetry.)*
- [x] Add telemetry/log hooks for setting-write success/failure and stale-read detection. *(`settingsPersistenceCounters` now records route-level + file-level write outcomes and stale-read/migration detections; exposed in data authority observability snapshots.)*
- [ ] Add a generator-safe contract: every writer writes the canonical settings model, and every generated file derives from this model.

### Phase 4 - Bootstrap and load path unification
- [x] Route app startup through one hydration pipeline that resolves settings once and publishes globally (runtime + convergence + storage + source-strategy + active-category llm). *(implemented via `runSettingsStartupHydrationPipeline` + `runCategoryScopedSettingsHydrationPipeline` in `tools/gui-react/src/stores/settingsAuthority.ts` with pipeline-owned reload calls and global snapshot publication.)*
- [ ] Remove per-component ad hoc initialization that bypasses the authority store.
- [x] Ensure first paint and post-hydration behavior are deterministic (no hardcoded fallback drift). *(settings readiness selector `isSettingsAuthoritySnapshotReady` now gates first content paint in `AppShell`; delayed hydration falls back to explicit degraded-mode banner instead of silent fallback-state rendering.)*
- [x] Validate reload behavior: changes survive restart and load into all consumers immediately. *(full GUI reload/persistence matrix rerun on 2026-02-25 passed `7/7`: studio autosave, storage, llm routes, runtime->runtime-ops propagation, convergence runtime panel, source strategy, and convergence cross-surface sync.)*

### Phase 5 - Migrate all settings writers
- [x] Replace direct/local writes in every setting control with store actions.
- [x] Standardize autosave and explicit save flows to the same authority write path.
- [x] Ensure all mutation routes persist to the real authority target (no UI-only state). *(validated by route persistence/error suites and GUI persistence flows across runtime/convergence/storage/ui autosave/llm/source-strategy surfaces.)*
- [x] Add tests for every writer path proving persisted value is present after reload. *(covered by GUI persistence tests: studio/ui autosave, runtime, convergence, storage, llm, and source-strategy.)*

### Phase 6 - Migrate all settings readers/consumers
- [ ] Replace component-local mirrors and hardcoded constants with store selectors.
- [x] Ensure all duplicated setting surfaces subscribe to the same key and stay in sync live. *(convergence cross-surface GUI parity + runtime ops shared runtime snapshot propagation coverage.)*
- [x] Validate non-UI consumers (api payload builders, backend-triggered flows, derived displays) consume authority values. *(runtime key coverage matrix + convergence runtime wiring + runtime ops propagation wiring.)*
- [ ] Remove stale selector logic and dead fallback branches once parity is proven.

### Phase 7 - Hardcoded behavior elimination audit
- [ ] Audit for hardcoded setting-dependent behavior and replace with derived authority values.
- [ ] Audit conditional UI logic to ensure it reacts to live settings updates without refresh hacks.
- [ ] Audit save success states to ensure UI reflects actual persistence result, not assumed success.
- [ ] Document and remove obsolete constants that conflict with authority contract.

### Phase 8 - End-to-end validation matrix
- [x] Build a settings persistence matrix: setting key x writer surface x reload x duplicate surface sync x backend reflection.
- [x] Add/extend unit tests for store reducers/selectors and integration tests for writer/reader wiring.
- [x] Add/extend GUI/E2E tests for autosave, explicit save, reload persistence, and cross-surface live propagation. *(covered: Studio autosave shared-tab lock, Runtime Ops search-provider cross-page propagation, Storage manual-save/autosave durability, LLM route-matrix manual-save/autosave durability, Runtime Panel convergence save/reload durability, Pipeline Source Strategy toggle durability, and Convergence cross-surface sync/reload durability via `test/studioSettingsGuiPersistencePropagation.test.js`, `test/runtimeOpsGuiSettingsPersistencePropagation.test.js`, `test/storageSettingsGuiPersistencePropagation.test.js`, `test/llmSettingsGuiPersistencePropagation.test.js`, `test/convergenceGuiSettingsPersistencePropagation.test.js`, `test/sourceStrategyGuiPersistencePropagation.test.js`, and `test/convergenceCrossSurfaceGuiPersistencePropagation.test.js`.)*
- [x] Run full targeted suites and resolve regressions until green. *(latest full settings authority + propagation matrix: 161/161 passing.)*

## Frontend settings persistence status matrix (2026-02-24)
- Runtime settings (`/runtime-settings`)
  - Writer: `tools/gui-react/src/stores/runtimeSettingsAuthority.ts` → `useRuntimeSettingsAuthority`.
  - Save surfaces: `tools/gui-react/src/pages/indexing/IndexingPage.tsx`, `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx`.
  - Read/hydrate: `tools/gui-react/src/stores/runtimeSettingsAuthority.ts` + `tools/gui-react/src/components/layout/AppShell.tsx` bootstrap (no fixed `refetchInterval` polling).
  - Persist on reload: route-backed read/write exists.
  - Globality: partial; bootstrap available, with runtime run-start and runtime panel controls locked until runtime settings hydration completes.
  - Hardcoded risk: low; first settings paint now waits on authority readiness, runtime LLM knobs no longer pre-seed from `indexingLlmConfig` defaults, and run payload fallbacks derive from authority snapshot baseline.

- Convergence settings (`/convergence-settings`)
  - Writer: `tools/gui-react/src/stores/convergenceSettingsAuthority.ts` → `useConvergenceSettingsAuthority`.
  - Save surfaces: `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx`, `tools/gui-react/src/pages/indexing/IndexingPage.tsx`, `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx`.
  - Read/hydrate: `tools/gui-react/src/stores/convergenceSettingsAuthority.ts` + `tools/gui-react/src/components/layout/AppShell.tsx` bootstrap (no fixed `refetchInterval` polling).
  - Persist on reload: route-backed read/write exists.
  - Globality: partial; duplicate controls present and should be observed for cross-surface sync parity.
  - Hardcoded risk: medium; slider fallback rendering is fixed and runtime now consumes persisted convergence knobs, with residual risk limited to pre-hydration UI defaults.

- Storage settings (`/storage-settings`)
  - Writer: `tools/gui-react/src/stores/storageSettingsAuthority.ts` → `useStorageSettingsAuthority`.
  - Save surface: `tools/gui-react/src/pages/storage/StoragePage.tsx`.
  - Read/hydrate: authority query with AppShell bootstrap path plus page-level reads (no fixed `refetchInterval` polling).
  - Persist on reload: route-backed read/write exists.
  - Globality: now bootstrapped at app startup through AppShell.
  - Hardcoded risk: low/medium; local state now bootstraps from cached authority snapshot and autosave/manual save remain hydration-gated.

- UI autosave settings (`/ui-settings`)
  - Writer: `tools/gui-react/src/stores/settingsAuthority.ts` via `tools/gui-react/src/stores/uiSettingsAuthority.ts`.
  - Save surfaces: `tools/gui-react/src/pages/studio/StudioPage.tsx`, `tools/gui-react/src/pages/storage/StoragePage.tsx`, `tools/gui-react/src/pages/indexing/IndexingPage.tsx`.
  - Read/hydrate: `tools/gui-react/src/stores/settingsAuthority.ts` bootstrap hydrates `useUiStore` from `/ui-settings` (no fixed `refetchInterval` polling).
  - Persist on reload: route-backed read/write exists in `helper_files/_runtime/user-settings.json`.
  - Globality: global (not category-scoped); shared across studio/runtime/storage surfaces.
  - Hardcoded risk: low; LLM autosave is now part of global `/ui-settings` persistence with shared bootstrap hydration.

- LLM settings routes (`/llm-settings/:category/routes`)
  - Writer: `tools/gui-react/src/stores/llmSettingsAuthority.ts` → `useLlmSettingsAuthority`.
  - Save surface: `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`.
  - Read/hydrate: authority query exists per category on route entry.
  - Persist on reload: route-backed read/write exists.
  - Globality: active category preloaded at startup; non-active categories still load on demand.
  - Hardcoded risk: low; local route rows/default baselines now bootstrap from cached authority snapshot, with non-active-category hydration still on-demand.

- Source strategy (`/source-strategy/:id`)
  - Writer: `tools/gui-react/src/stores/sourceStrategyAuthority.ts`.
  - Save surface: `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx`.
  - Read/hydrate: authority query with AppShell bootstrap path plus page-level reads.
  - Persist on reload: route-backed read/write exists.
  - Globality: category-scoped; authority query keys + route params now bind to active category and avoid backend fallback categories.
  - Hardcoded risk: low/medium; runtime discovery now consumes category-enabled source strategy rows, with remaining risk in non-run contexts that do not load SpecDb.

- Studio map docs (field studio persistence endpoints)
  - Writer: `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts` (`saveMap`, `saveStudioDocs`).
  - Save surface: `tools/gui-react/src/pages/studio/StudioPage.tsx`.
  - Read/hydrate: page reads dedicated studio endpoints.
  - Persist on reload: route-backed persistence exists for map docs.
  - Globality: partial; domain-specific and does not yet use a shared app-shell settings pipeline.
  - Deferred knobs: `contract.unknown_token`, `contract.rounding.mode`, and `contract.unknown_reason_required` are intentionally locked in Studio UI pending runtime wiring.
  - Hardcoded risk: low.

### Reader Migration Follow-up Status (2026-02-25)
Tracks dated completion evidence for Phase 6 without duplicating phase numbering.
- [x] Complete migration of all settings reads to pure authority selectors (remaining local initialization mirrors/fallbacks). *(settings bootstrap/read paths now flow through authority helpers/selectors; page/component/hooks direct cache reads are regression-guarded.)*
- [x] Replace local duplicated defaults with authority-derived defaults across all setting consumers. *(`IndexingPage`, `StoragePage`, `LlmSettingsPage`, and Runtime Ops `WorkersTab` now bootstrap/hydrate through shared authority helper readers instead of page-local query-key/default merge code.)*
- [x] Add explicit cross-surface propagation tests for shared settings keys.
- [x] Ensure source-strategy authority is category-scoped end-to-end (UI query key, route params, and runtime consumption).
- [x] Ensure converged settings keys marked in manifest are all wired into runtime behavior (no persistence-only dead knobs).
- [x] Runtime Ops downstream prefetch settings consumers now read hydration-safe runtime authority snapshots and preserve artifact fallback behavior when runtime settings are temporarily unavailable.

### Phase 9 - Documentation and operational handoff
- [x] Update implementation docs with final authority contract, source map, and subscriber map. *(see `implementation/gui-persistence/SETTINGS-AUTHORITY-HANDOFF.md`)*
- [x] Record known invariants and anti-patterns (no direct component writes, no hardcoded setting forks). *(captured in `SETTINGS-AUTHORITY-HANDOFF.md`)*
- [x] Add a maintenance checklist for future settings: add key, add writer, add reader, add persistence test, add propagation test. *(captured in `SETTINGS-AUTHORITY-HANDOFF.md`)*
- [x] Keep this section as the active checklist and mark each phase complete as execution progresses.

## Scope and source trees

### Canonical plan docs

`implementation/data-management/`
- `01-data-authority-system-overview.md`
- `02-data-authority-data-sources.md`
- `03-data-authority-event-contract.md`
- `04-data-authority-subscribers-and-live-propagation.md`
- `05-data-authority-audit-playbook.md`

`implementation/grid-rules/`
- `component-slot-fill-rules.md`
- `flag-rules.md`
- `test-mode-data-coverage.md`
- `component-identity-pools-10-tabs.xlsx` (seed pool input)

`implementation/field-rules-studio/contracts/`
- `component-system-architecture.md`
- `field-studio-contract.mmd`
- `field-studio-contract-hierarchy.mmd`

`implementation/field-rules-studio/`
- `README.md`
- `test-contract-map.md`

`implementation/field-rules-studio/audits/`
- `2026-02-25-full-compile-generated-test-compiler-audit.md`
- `2026-02-25-full-audit-refresh.md`

### Runtime modules

Contract compile/load:
- `src/field-rules/compiler.js`
- `src/field-rules/loader.js`
- `src/field-rules/migrations.js`

Data authority and eventing:
- `src/api/events/dataChangeContract.js`
- `src/api/routes/dataAuthorityRoutes.js`
- `src/api/services/specDbSyncService.js`
- `src/api/services/compileProcessCompletion.js`
- `src/api/routes/studioRoutes.js`
- `src/api/routes/sourceStrategyRoutes.js`
- `src/api/routes/catalogRoutes.js`
- `src/api/routes/brandRoutes.js`
- `src/api/routes/reviewRoutes.js`

Review API and lane mutations:
- `src/api/guiServer.js`
- `src/api/reviewRouteSharedHelpers.js`
- `src/api/reviewMutationResolvers.js`
- `src/api/reviewItemRoutes.js`
- `src/api/reviewComponentMutationRoutes.js`
- `src/api/reviewEnumMutationRoutes.js`

Review payload builders:
- `src/review/reviewGridData.js`
- `src/review/componentReviewData.js`
- `src/review/keyReviewState.js`
- `src/review/componentImpact.js`

Persistence and seed:
- `src/db/specDb.js`
- `src/db/seed.js`
- `src/testing/testDataProvider.js`
- `src/testing/testRunner.js`
- `src/utils/componentIdentifier.js`
- `src/utils/candidateIdentifier.js`

Frontend propagation + review UI:
- `tools/gui-react/src/components/layout/AppShell.tsx`
- `tools/gui-react/src/components/layout/dataChangeInvalidationScheduler.js`
- `tools/gui-react/src/api/dataChangeInvalidationMap.js`
- `tools/gui-react/src/hooks/useDataChangeSubscription.js`
- `tools/gui-react/src/hooks/useAuthoritySnapshot.js`
- `tools/gui-react/src/pages/studio/authoritySync.js`
- `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx`
- `tools/gui-react/src/pages/component-review/ComponentSubTab.tsx`
- `tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx`
- `tools/gui-react/src/pages/component-review/EnumSubTab.tsx`

## Data authority model (authoritative behavior)

1. Authoring sources (saved map docs + generated artifacts) define category authority.
2. Mutation routes emit typed `data-change` events with category scope.
3. WebSocket server filters by category (`dataChangeMatchesCategory`).
4. Frontend subscribers invalidate query families from `domains` mapping.
5. Compile completion attempts SpecDb sync before `process-completed` fanout.
6. Sync state is durable in `data_authority_sync` and exposed via authority snapshot API.

### Authority invariants

- Authority is category-scoped, not global transactional.
- Source host/domain is provenance metadata, not an authority key.
- Component and enum masters propagate to linked item surfaces.
- Item acceptance does not become master authority for component/enum definitions.

## Review grid contract (item, component, enum)

### Row and lane identity

- Component row key is strict: `component_type + component_name + component_maker`.
- Shared lane key uses canonical format: `type::name::maker`.
- Candidate actions stay slot-scoped and candidate-scoped.

### Component slot aggregation invariant

For row key `K = (type, name, maker)` and slot field `F`:

```
C(K, F) = count(candidates where product_id in linked_products(K) and field_key = F)
```

This applies uniformly to `__name`, `__maker`, and every property slot.
No slot type is allowed to use a different linked-product aggregation path.

### Fallback guardrail

- If `LP(K) > 0`, slot candidates come only from linked products.
- Queue/pipeline fallback is allowed only when `LP(K) == 0`.
- Fallback candidates must remain lane-scoped to exact `type + name + maker`.

## Flag taxonomy (grid rules source of truth)

Primary real actionable flags:
1. `variance_violation`
2. `constraint_conflict`
3. `new_component`
4. `new_enum_value`
5. `below_min_evidence`
6. `conflict_policy_hold`
7. `dependency_missing`

Actionable variant:
- `compound_range_conflict` (variant of `constraint_conflict`, treated as real in grid reason-code handling)

Non-flag visual states include `manual_override`, `missing_value`, confidence bands, and `pending_ai`.

## Data source precedence and projection

1. Compiled generated rules are baseline.
2. Saved Field Studio map docs (`field_studio_map`) overlay baseline via `field_overrides`.
3. Field order derives from saved `selected_keys`; UI grouping markers (`__grp::`) are reconstructed from per-field group metadata.
4. Snapshot token is derived from saved-map timestamp, compiled timestamp, and SpecDb sync version.

Primary authority sources:
- `helper_files/{category}/_control_plane/*`
- `helper_files/{category}/_generated/*`
- `helper_files/{category}/_suggestions/*`
- `data_authority_sync` and runtime SQL tables in SpecDb

## Test mode contract highlights

- Seed pools are app-generated deterministically (no XLSX dependency in test-mode identity pool generation).
- Maker-capable component types include A/B/makerless lanes for same name.
- Each component type has deterministic 6-11 rows and 1-3 non-discovered rows.
- Non-discovered rows remain visible under test-mode rules.

## Targeted validation tests

Data authority and propagation:
- `test/dataChangeContract.test.js`
- `test/dataChangeInvalidationMap.test.js`
- `test/dataChangeDomainParity.test.js`
- `test/dataAuthorityRoutes.test.js`
- `test/specDbSyncService.test.js`
- `test/specDbSyncVersion.test.js`
- `test/compileProcessCompletion.test.js`
- `test/studioRoutesPropagation.test.js`
- `test/mapValidationPreflight.test.js`
- `test/dataAuthorityPropagationMatrix.test.js`

Grid and field contract:
- `test/contractDriven.test.js`
- `test/componentReviewDataLaneState.test.js`
- `test/reviewLaneContractApi.test.js`
- `test/reviewLaneContractGui.test.js`
- `test/reviewGridData.test.js`
- `test/reviewOverrideWorkflow.test.js`
- `test/phase1FieldRulesLoader.test.js`

Audit execution snapshot (2026-02-25):
- Frontend full settings audit rerun (this session): PASS.
- Settings authority + propagation matrix: `132/132` passing (`node --test --test-concurrency=1 ...` settings matrix set).
- Focused current-workspace settings authority/persistence/propagation rerun: `111/111` passing (runtime/convergence/storage/llm/source-strategy/studio/ui + canonical-write/root-resolution suites via `node --test --test-concurrency=1` explicit file set).
- Settings finalization contract pass (this session): shared optimistic/rollback mutation contract + unified startup hydration pipeline implemented across settings authorities (`settingsMutationContract.ts`, `settingsAuthority.ts` startup/category hydration pipeline).
- Settings finalization wiring contract suite (this session): `24/24` passing (includes new `test/settingsMutationContractWiring.test.js`).
- Full post-finalization settings authority/persistence/propagation rerun (this session): `113/113` passing.
- Cross-tab settings propagation contract pass (this session): storage-event bus contract + authority publish hooks + bootstrap subscriber routing implemented (`settingsPropagationContract.ts`, writer authorities, `settingsAuthority.ts` subscriber effect).
- Cross-tab propagation wiring contract suite (this session): `20/20` passing (`test/settingsPropagationContractWiring.test.js` + core authority wiring suite).
- Full post-propagation settings authority/persistence/propagation rerun (this session): `116/116` passing.
- Runtime/settings behavior wiring sweep: `41/41` passing (`test/extractCandidatesLLM.test.js`, `test/runtimeHelpers.test.js`, `test/sourceStrategy.test.js`, `test/retrievalIdentityFilter.test.js`).
- Persistence failure + canonical-write/root-resolution sweep: `11/11` passing (`test/configRoutesPersistenceFailure.test.js`, `test/settingsCanonicalOnlyWrites.test.js`, `test/userSettingsService.test.js`, `test/guiServerRootPathResolution.test.js`).
- Frontend production build validation: passing (`npm run gui:build`).
- Audit artifact captured: `implementation/gui-persistence/FRONTEND-KNOB-AUDIT-2026-02-25.md`.
- Data authority suite: 30/30 passing.
- Full repository suite: 3232/3232 passing (`npm test`).
- Grid suite: all targeted tests passing except `test/reviewLaneContractGui.test.js`.
- Current GUI failure: Playwright timeout waiting for visible `mouse_contract_lane_matrix_gui` option while option exists but is hidden.
- Settings full authority + session-scope matrix revalidation (latest local run): 161/161 passing (`--test-concurrency=1`).
- Playwright settings user-flow battery (latest local run): 7/7 passing (`--test-concurrency=1`).
- Frontend production build validation (latest local run): passing (`npm --prefix tools/gui-react run build`).
- Root-resolution + canonical-write focused regression run (latest local run): 22/22 passing.
  - `test/guiServerRootPathResolution.test.js`
  - `test/settingsCanonicalOnlyWrites.test.js`
  - `test/runtimeSettingsApi.test.js`
  - `test/storageSettingsRoutes.test.js`
  - `test/configRoutesPersistenceFailure.test.js`
- Cold-start restart smoke (ephemeral helper root) passed across settings surfaces:
  - UI autosave/global toggles (`/ui-settings`) persisted across restart.
  - Runtime knobs (`/runtime-settings`) persisted across restart.
  - Convergence knobs (`/convergence-settings`) persisted across restart.
  - Storage knobs (`/storage-settings`) persisted across restart.
  - LLM route matrix row toggle (`/llm-settings/mouse/routes`) persisted across restart.
  - Source strategy row toggle (`/source-strategy?category=mouse`) persisted across restart.
- Settings audit focused suites (latest local run): 31/31 passing.
  - `test/runtimeSettingsApi.test.js`
  - `test/storageSettingsRoutes.test.js`
  - `test/sourceStrategyCategoryScope.test.js`
  - `test/sourceStrategyAuthorityWiring.test.js`
  - `test/convergenceRuntimeKnobWiring.test.js`
  - `test/dataChangeInvalidationMap.test.js`
- Settings contract schema/migration/precedence regression coverage (latest local run): 23/23 passing.
  - `test/settingsContract.test.js`
  - `test/userSettingsService.test.js`
  - `test/runtimeSettingsSnapshotParity.test.js`
  - `test/uiSettingsRoutes.test.js`
  - `test/runtimeSettingsApi.test.js`
  - `test/configRoutesPersistenceFailure.test.js`
- Settings persistence telemetry + stale-read observability regression coverage (latest local run): 24/24 passing.
  - `test/settingsContract.test.js`
  - `test/settingsPersistenceCounters.test.js`
  - `test/settingsPersistenceTelemetry.test.js`
  - `test/configRoutesPersistenceFailure.test.js`
  - `test/dataAuthorityRoutes.test.js`
  - `test/userSettingsService.test.js`
- Settings contract route-map centralization regression coverage (latest local run): 20/20 passing.
  - `test/settingsContract.test.js`
  - `test/runtimeSettingsSnapshotParity.test.js`
  - `test/runtimeSettingsKeyCoverageMatrix.test.js`
  - `test/runtimeSettingsApi.test.js`
  - `test/configRoutesPersistenceFailure.test.js`
- Full settings authority + propagation matrix revalidation (latest local run): 161/161 passing.
  - `test/settingsAuthorityMatrixWiring.test.js`
  - `test/settingsAuthorityStoreWiring.test.js`
  - `test/settingsEndpointAuthorityOwnershipMatrix.test.js`
  - `test/settingsCacheReadAuthorityOwnership.test.js`
  - `test/runtimeSettingsApi.test.js`
  - `test/runtimeSettingsSnapshotParity.test.js`
  - `test/runtimeSettingsKeyCoverageMatrix.test.js`
  - `test/runtimeSettingsInitialBootstrapWiring.test.js`
  - `test/runtimeSettingsHydrationBindingWiring.test.js`
  - `test/runtimeRunPayloadBaselineWiring.test.js`
  - `test/runtimeAutosavePayloadBaselineWiring.test.js`
  - `test/runtimePanelAutosaveStatusParity.test.js`
  - `test/runtimeSettingsAutosaveFlushOnUnmount.test.js`
  - `test/runtimeOpsSettingsPropagationWiring.test.js`
  - `test/runtimeOpsSearchProfileLiveSettingsFallbackWiring.test.js`
  - `test/runtimeOpsSearchResultsLiveSettingsHydrationWiring.test.js`
  - `test/runtimeOpsPanelLiveSettingsUndefinedGuardWiring.test.js`
  - `test/convergenceSettingsAuthorityWiring.test.js`
  - `test/convergenceRuntimeKnobWiring.test.js`
  - `test/convergenceCrossSurfacePropagationWiring.test.js`
  - `test/convergenceDefaultsManifestWiring.test.js`
  - `test/convergenceGuiSettingsPersistencePropagation.test.js`
  - `test/convergenceCrossSurfaceGuiPersistencePropagation.test.js`
  - `test/storageSettingsRoutes.test.js`
  - `test/storageSettingsInitialBootstrapWiring.test.js`
  - `test/storageSettingsHydrationGate.test.js`
  - `test/storageSettingsAutosaveFlushOnUnmount.test.js`
  - `test/storageAutosaveStatusParity.test.js`
  - `test/storageDefaultsManifestWiring.test.js`
  - `test/uiSettingsRoutes.test.js`
  - `test/uiAutosaveAuthorityWiring.test.js`
  - `test/uiSettingsDefaultsManifestWiring.test.js`
  - `test/llmSettingsAuthorityWiring.test.js`
  - `test/llmSettingsInitialBootstrapWiring.test.js`
  - `test/llmSettingsAutosaveStatusParity.test.js`
  - `test/llmSettingsAutosaveFlushOnUnmount.test.js`
  - `test/llmRouteFieldUsageAudit.test.js`
  - `test/sourceStrategyAuthorityWiring.test.js`
  - `test/sourceStrategyCategoryScope.test.js`
  - `test/sourceStrategyGuiPersistencePropagation.test.js`
  - `test/sourceStrategyRoutesDataChangeContract.test.js`
  - `test/studioPersistenceAuthorityWiring.test.js`
  - `test/studioRoutesPropagation.test.js`
  - `test/studioAutosaveStatusParity.test.js`
  - `test/studioAutosaveFlushOnUnmount.test.js`
  - `test/studioDeferredKnobLock.test.js`
  - `test/studioConsumerToggleImmediatePropagation.test.js`
  - `test/studioSettingsGuiPersistencePropagation.test.js`
  - `test/runtimeOpsGuiSettingsPersistencePropagation.test.js`
  - `test/storageSettingsGuiPersistencePropagation.test.js`
  - `test/llmSettingsGuiPersistencePropagation.test.js`
  - `test/settingsContract.test.js`
  - `test/settingsAutosaveDebounceContractWiring.test.js`
  - `test/settingsPersistenceCounters.test.js`
  - `test/settingsPersistenceTelemetry.test.js`
  - `test/dataAuthorityRoutes.test.js`
  - `test/guiPersistenceSessionScope.test.js`
- Studio autosave GUI persistence + propagation coverage (latest local run): 1/1 passing.
  - `test/studioSettingsGuiPersistencePropagation.test.js`
- Runtime Ops GUI runtime-setting propagation coverage (latest local run): 1/1 passing.
  - `test/runtimeOpsGuiSettingsPersistencePropagation.test.js`
- Storage GUI settings persistence coverage (latest local run): 1/1 passing.
  - `test/storageSettingsGuiPersistencePropagation.test.js`
- LLM GUI settings persistence coverage (latest local run): 1/1 passing.
  - `test/llmSettingsGuiPersistencePropagation.test.js`
- Convergence GUI settings persistence coverage (latest local run): 1/1 passing.
  - `test/convergenceGuiSettingsPersistencePropagation.test.js`
- Convergence cross-surface GUI sync + persistence coverage (latest local run): 1/1 passing.
  - `test/convergenceCrossSurfaceGuiPersistencePropagation.test.js`
- Source strategy GUI settings persistence coverage (latest local run): 1/1 passing.
  - `test/sourceStrategyGuiPersistencePropagation.test.js`
- GUI + autosave authority focused regression suite (latest local run): 22/22 passing (`--test-concurrency=1`).
  - `test/studioSettingsGuiPersistencePropagation.test.js`
  - `test/runtimeOpsGuiSettingsPersistencePropagation.test.js`
  - `test/storageSettingsGuiPersistencePropagation.test.js`
  - `test/llmSettingsGuiPersistencePropagation.test.js`
  - `test/convergenceGuiSettingsPersistencePropagation.test.js`
  - `test/sourceStrategyGuiPersistencePropagation.test.js`
  - `test/convergenceCrossSurfaceGuiPersistencePropagation.test.js`
  - `test/settingsAuthorityStoreWiring.test.js`
  - `test/uiAutosaveAuthorityWiring.test.js`
  - `test/runtimeOpsSettingsPropagationWiring.test.js`
- Storage defaults manifest focused coverage (latest local run): 7/7 passing.
  - `test/storageDefaultsManifestWiring.test.js`
  - `test/storageSettingsInitialBootstrapWiring.test.js`
  - `test/storageSettingsHydrationGate.test.js`
  - `test/storageAutosaveStatusParity.test.js`
  - `test/settingsAuthorityMatrixWiring.test.js`
- Source strategy all-scope guard + authority ownership focused coverage (latest local run): 7/7 passing.
  - `test/sourceStrategyAuthorityWiring.test.js`
  - `test/sourceStrategyCategoryScope.test.js`
  - `test/settingsAuthorityMatrixWiring.test.js`
  - `test/settingsEndpointAuthorityOwnershipMatrix.test.js`
- Settings autosave debounce/timing-copy contract coverage (latest local run): 18/18 passing.
  - `test/settingsAutosaveDebounceContractWiring.test.js`
  - `test/runtimePanelAutosaveStatusParity.test.js`
  - `test/studioAutosaveStatusParity.test.js`
  - `test/uiAutosaveAuthorityWiring.test.js`
- Convergence defaults manifest wiring coverage (latest local run): 9/9 passing.
  - `test/convergenceDefaultsManifestWiring.test.js`
  - `test/convergenceCrossSurfacePropagationWiring.test.js`
  - `test/convergenceSettingsAuthorityWiring.test.js`
  - `test/settingsAuthorityMatrixWiring.test.js`
  - `test/runtimePanelAutosaveStatusParity.test.js`
- Settings autosave authority + studio propagation focused suites (latest local run): 42/42 passing.
  - `test/uiAutosaveAuthorityWiring.test.js`
  - `test/studioConsumerToggleImmediatePropagation.test.js`
  - `test/guiPersistenceSessionScope.test.js`
  - `test/uiSettingsRoutes.test.js`
  - `test/settingsAuthorityMatrixWiring.test.js`
  - `test/runtimeSettingsApi.test.js`
  - `test/storageSettingsRoutes.test.js`
- Settings persistence failure + unmount flush coverage (latest local run): 9/9 passing.
  - `test/configRoutesPersistenceFailure.test.js`
  - `test/llmSettingsAutosaveFlushOnUnmount.test.js`
  - `test/studioAutosaveFlushOnUnmount.test.js`
  - `test/runtimeSettingsAutosaveFlushOnUnmount.test.js`
  - `test/storageSettingsAutosaveFlushOnUnmount.test.js`
- Convergence cross-surface propagation wiring coverage (latest local run): 1/1 passing.
  - `test/convergenceCrossSurfacePropagationWiring.test.js`
- Settings endpoint authority ownership matrix coverage (latest local run): 2/2 passing.
  - `test/settingsEndpointAuthorityOwnershipMatrix.test.js`
- Runtime settings hydration binding wiring coverage (latest local run): 1/1 passing.
  - `test/runtimeSettingsHydrationBindingWiring.test.js`
- Runtime run payload baseline wiring coverage (latest local run): 1/1 passing.
  - `test/runtimeRunPayloadBaselineWiring.test.js`
- Runtime settings snapshot key parity coverage (latest local run): 1/1 passing.
  - `test/runtimeSettingsSnapshotParity.test.js`
- Runtime settings key coverage matrix (latest local run): 1/1 passing.
  - `test/runtimeSettingsKeyCoverageMatrix.test.js`
- Runtime LLM bootstrap reset-guard wiring coverage (latest local run): 1/1 passing.
  - `test/runtimeLlmInitResetGuardWiring.test.js`
- Runtime LLM dropdown option stability wiring coverage (latest local run): 1/1 passing.
  - `test/runtimeLlmDropdownOptionStabilityWiring.test.js`
- Runtime autosave payload baseline wiring coverage (latest local run): 1/1 passing.
  - `test/runtimeAutosavePayloadBaselineWiring.test.js`
- Runtime Ops settings propagation wiring coverage (latest local run): 1/1 passing.
  - `test/runtimeOpsSettingsPropagationWiring.test.js`
- Runtime Ops live-settings fallback wiring coverage (latest local run): 1/1 passing.
  - `test/runtimeOpsSearchProfileLiveSettingsFallbackWiring.test.js`
- Runtime Ops live-settings undefined-guard badge coverage (latest local run): 1/1 passing.
  - `test/runtimeOpsPanelLiveSettingsUndefinedGuardWiring.test.js`
- Runtime Ops search-results live-settings hydration coverage (latest local run): 1/1 passing.
  - `test/runtimeOpsSearchResultsLiveSettingsHydrationWiring.test.js`
- Shared settings bootstrap-helper wiring coverage (latest local run): 3/3 passing.
  - `test/runtimeSettingsInitialBootstrapWiring.test.js`
  - `test/storageSettingsInitialBootstrapWiring.test.js`
  - `test/llmSettingsInitialBootstrapWiring.test.js`
- Settings cache-read authority ownership coverage (latest local run): 1/1 passing.
  - `test/settingsCacheReadAuthorityOwnership.test.js`
- UI settings defaults manifest wiring coverage (latest local run): 1/1 passing.
  - `test/uiSettingsDefaultsManifestWiring.test.js`
- Runtime settings + autosave regression suite (latest local run): 47/47 passing.
  - `test/runtimeSettingsApi.test.js`
  - `test/runtimeSettingsSnapshotParity.test.js`
  - `test/runtimeSettingsKeyCoverageMatrix.test.js`
  - `test/runtimeLlmInitResetGuardWiring.test.js`
  - `test/runtimeLlmDropdownOptionStabilityWiring.test.js`
  - `test/runtimeSettingsAutosaveFlushOnUnmount.test.js`
  - `test/storageSettingsAutosaveFlushOnUnmount.test.js`
  - `test/llmSettingsAutosaveFlushOnUnmount.test.js`
  - `test/studioAutosaveFlushOnUnmount.test.js`
  - `test/runtimePanelAutosaveStatusParity.test.js`
  - `test/storageAutosaveStatusParity.test.js`
  - `test/llmSettingsAutosaveStatusParity.test.js`
  - `test/studioAutosaveStatusParity.test.js`
  - `test/uiAutosaveAuthorityWiring.test.js`
  - `test/guiPersistenceSessionScope.test.js`
  - `test/settingsAuthorityMatrixWiring.test.js`
  - `test/uiSettingsRoutes.test.js`
- Studio shared-tab settings propagation sweep (latest local run): 19/19 passing.
  - `test/studioConsumerToggleImmediatePropagation.test.js`
  - `test/uiAutosaveAuthorityWiring.test.js`
  - `test/studioDeferredKnobLock.test.js`
  - `test/studioPersistenceAuthorityWiring.test.js`
  - `test/studioAutosaveStatusParity.test.js`
  - `test/studioAutosaveFlushOnUnmount.test.js`
- Full cross-domain settings revalidation sweep (latest local run): 106/106 passing.
  - `test/runtimeSettingsApi.test.js`
  - `test/storageSettingsRoutes.test.js`
  - `test/sourceStrategyCategoryScope.test.js`
  - `test/sourceStrategyAuthorityWiring.test.js`
  - `test/convergenceRuntimeKnobWiring.test.js`
  - `test/dataChangeInvalidationMap.test.js`
  - `test/uiSettingsRoutes.test.js`
  - `test/userSettingsService.test.js`
  - `test/runtimeSettingsAuthorityWiring.test.js`
  - `test/convergenceSettingsAuthorityWiring.test.js`
  - `test/llmSettingsAuthorityWiring.test.js`
  - `test/settingsAuthorityMatrixWiring.test.js`
  - `test/uiAutosaveAuthorityWiring.test.js`
  - `test/studioPersistenceAuthorityWiring.test.js`
  - `test/guiPersistenceSessionScope.test.js`
  - `test/frontendSessionAuditCoverage.test.js`
  - `test/storageSettingsHydrationGate.test.js`
  - `test/studioDeferredKnobLock.test.js`
  - `test/llmRouteFieldUsageAudit.test.js`
  - `test/studioAutosaveStatusParity.test.js`
  - `test/runtimePanelAutosaveStatusParity.test.js`
  - `test/llmSettingsAutosaveStatusParity.test.js`
  - `test/storageAutosaveStatusParity.test.js`
  - `test/configRoutesPersistenceFailure.test.js`
  - `test/llmSettingsAutosaveFlushOnUnmount.test.js`
  - `test/studioAutosaveFlushOnUnmount.test.js`
  - `test/runtimeSettingsAutosaveFlushOnUnmount.test.js`
  - `test/storageSettingsAutosaveFlushOnUnmount.test.js`
  - `test/convergenceCrossSurfacePropagationWiring.test.js`
  - `test/runtimeOpsSettingsPropagationWiring.test.js`
  - `test/settingsEndpointAuthorityOwnershipMatrix.test.js`
  - `test/runtimeSettingsHydrationBindingWiring.test.js`
  - `test/runtimeRunPayloadBaselineWiring.test.js`
  - `test/runtimeAutosavePayloadBaselineWiring.test.js`
  - `test/runtimeSettingsInitialBootstrapWiring.test.js`
  - `test/storageSettingsInitialBootstrapWiring.test.js`
  - `test/llmSettingsInitialBootstrapWiring.test.js`
  - `test/settingsCacheReadAuthorityOwnership.test.js`
  - `test/uiSettingsDefaultsManifestWiring.test.js`
  - `test/runtimeSettingsSnapshotParity.test.js`
  - `test/runtimeSettingsKeyCoverageMatrix.test.js`
  - `test/runtimeLlmInitResetGuardWiring.test.js`
  - `test/runtimeLlmDropdownOptionStabilityWiring.test.js`
- Full settings persistence revalidation suite (latest local run): 98/98 passing.
  - `test/runtimeSettingsApi.test.js`
  - `test/storageSettingsRoutes.test.js`
  - `test/sourceStrategyCategoryScope.test.js`
  - `test/sourceStrategyAuthorityWiring.test.js`
  - `test/convergenceRuntimeKnobWiring.test.js`
  - `test/dataChangeInvalidationMap.test.js`
  - `test/uiSettingsRoutes.test.js`
  - `test/userSettingsService.test.js`
  - `test/runtimeSettingsAuthorityWiring.test.js`
  - `test/convergenceSettingsAuthorityWiring.test.js`
  - `test/llmSettingsAuthorityWiring.test.js`
  - `test/settingsAuthorityMatrixWiring.test.js`
  - `test/uiAutosaveAuthorityWiring.test.js`
  - `test/studioPersistenceAuthorityWiring.test.js`
  - `test/guiPersistenceSessionScope.test.js`
  - `test/frontendSessionAuditCoverage.test.js`
  - `test/storageSettingsHydrationGate.test.js`
  - `test/studioDeferredKnobLock.test.js`
  - `test/llmRouteFieldUsageAudit.test.js`
  - `test/studioAutosaveStatusParity.test.js`
  - `test/runtimePanelAutosaveStatusParity.test.js`
  - `test/llmSettingsAutosaveStatusParity.test.js`
  - `test/storageAutosaveStatusParity.test.js`
  - `test/configRoutesPersistenceFailure.test.js`
  - `test/llmSettingsAutosaveFlushOnUnmount.test.js`
  - `test/studioAutosaveFlushOnUnmount.test.js`
  - `test/runtimeSettingsAutosaveFlushOnUnmount.test.js`
  - `test/storageSettingsAutosaveFlushOnUnmount.test.js`
  - `test/convergenceCrossSurfacePropagationWiring.test.js`
  - `test/runtimeOpsSettingsPropagationWiring.test.js`
  - `test/settingsEndpointAuthorityOwnershipMatrix.test.js`
  - `test/runtimeSettingsHydrationBindingWiring.test.js`
  - `test/runtimeRunPayloadBaselineWiring.test.js`
  - `test/runtimeAutosavePayloadBaselineWiring.test.js`
  - `test/runtimeSettingsInitialBootstrapWiring.test.js`
  - `test/storageSettingsInitialBootstrapWiring.test.js`
  - `test/llmSettingsInitialBootstrapWiring.test.js`
- Studio deferred knob lock coverage (latest local run): 1/1 passing.
  - `test/studioDeferredKnobLock.test.js`
- Storage hydration gate coverage (latest local run): 1/1 passing.
  - `test/storageSettingsHydrationGate.test.js`
- Studio autosave status parity coverage (latest local run): 1/1 passing.
  - `test/studioAutosaveStatusParity.test.js`
- Runtime panel autosave status parity coverage (latest local run): 1/1 passing.
  - `test/runtimePanelAutosaveStatusParity.test.js`
- LLM settings autosave status parity coverage (latest local run): 1/1 passing.
  - `test/llmSettingsAutosaveStatusParity.test.js`
- Storage autosave status parity coverage (latest local run): 1/1 passing.
  - `test/storageAutosaveStatusParity.test.js`
- Adjacent runtime/discovery regression suites touched by these changes: 62/62 passing.
  - `test/convergenceLoop.test.js`
  - `test/phase07PrimeSourcesBuilder.test.js`
  - `test/discoveryBrandFilter.test.js`
  - `test/discoveryPerformanceAndRelevance.test.js`
  - `test/internalCorpusDiscovery.test.js`
  - `test/sourceStrategyRoutesDataChangeContract.test.js`
  - `test/sourceStrategy.test.js`



## Quick run commands

```bash
# Data authority validation
node --test test/dataChangeContract.test.js test/dataChangeInvalidationMap.test.js test/dataChangeDomainParity.test.js test/dataAuthorityRoutes.test.js test/specDbSyncService.test.js test/specDbSyncVersion.test.js test/compileProcessCompletion.test.js test/studioRoutesPropagation.test.js test/mapValidationPreflight.test.js test/dataAuthorityPropagationMatrix.test.js

# Grid and field validation
node --test test/contractDriven.test.js test/componentReviewDataLaneState.test.js test/reviewLaneContractApi.test.js test/reviewLaneContractGui.test.js test/reviewGridData.test.js test/reviewOverrideWorkflow.test.js test/phase1FieldRulesLoader.test.js
```

## Working rules for future updates

- Keep this file aligned with canonical docs under `implementation/
- Update this file whenever event domains, flag taxonomy, slot aggregation behavior, or source precedence rules change.


## Core Development Philosophy

### TEST-DRIVEN DEVELOPMENT IS NON-NEGOTIABLE

Every single line of production code must be written in response to a failing test.
No exceptions. This is the fundamental practice that enables all other principles.

**RED → GREEN → REFACTOR**
- **RED**: Write the failing test first. Zero production code without a failing test.
- **GREEN**: Write the minimum code to make the test pass.
- **REFACTOR**: Improve only if it adds real value. Keep increments small and always working.

Wait for explicit commit approval before every commit.

### Decomposition Safety Rule — NON-NEGOTIABLE

When decomposing, extracting, or refactoring existing code, **existing functionality must never break**.

The protocol is:
1. **Tests must be green before touching anything.** Run the full test suite and confirm it passes. If tests are already failing, stop and fix them before refactoring.
2. **Write characterization tests first** for any code that lacks coverage before moving it. These tests capture the current behavior — they are the safety net for the extraction.
3. **Move in the smallest possible increments.** Extract one function or one responsibility at a time. Run tests after every single move. Never batch multiple extractions into one step.
4. **The extracted module must produce identical outputs** to the inline code it replaced, on the same inputs. If behavior changes during extraction, that is a bug, not a feature.
5. **No behavior changes during a refactor step.** Refactor means structure changes, behavior stays identical. If you want to change behavior, do it in a separate commit with its own failing test.
6. **If tests go red at any point during extraction, revert the extraction, not the tests.** The tests are the source of truth. A red test during refactor means the extraction broke something.
7. **The pipeline must run end-to-end successfully** on at least one product before a decomposition step is considered complete.

### App Section / Feature Organization (Vertical Slicing)

**Organize by Domain, Not by Technical Layer**
App sections and features must be entirely self-contained within their own domain directories. This approach, known as Vertical Slicing, ensures modularity and prevents tangled dependencies.

* **The Rule of Proximity:** Everything required for a specific app feature (validation, pure logic, state transformations, and UI components) must live together in that feature's directory. 
* **No Generic "Junk Drawers":** Directories like `src/utils/`, `src/helpers/`, or `src/services/` are strictly prohibited. If a function belongs to a specific feature, it lives in that feature's folder. If it is genuinely shared across multiple boundaries, it must be extracted into a clearly defined `shared-core/` or `infrastructure/` module.
* **Strict Boundary Enforcement:** One feature cannot directly import internal implementations from another. If "Feature A" needs data from "Feature B", it must communicate through explicitly defined public contracts (`index.js` exports) or a central orchestrator.

**Standardized Feature Directory Structure:**

src/
├── feature-a/               # Self-contained domain boundary
│   ├── index.js             # Explicit public API for this feature
│   ├── transformations.js   # Pure functions and mapping logic
│   ├── validation.js        # Domain-specific schemas
│   └── components/          # UI components (if applicable to the stack)
│
├── feature-b/               # Completely isolated from feature-a
│   ├── index.js
│   ├── core-logic.js
│   └── rules.js
│
└── shared-infrastructure/   # Cross-cutting side effects and external adapters
    ├── network-client.js
    └── logger.js

### Approved Refactoring Techniques

These are the only refactoring patterns used during decomposition. No other approaches.

- **Preparatory Refactoring**: Do not add new features to the core orchestrator module. Refactor and extract logic in preparation for upcoming phases to avoid accumulating technical debt. New capabilities should go into distinct new modules, not into the existing monolith.

- **Extract Method / Composing Method**: Aggressively break down the monolith. Extract isolated logic and domain-specific operations into smaller, pure functions within new, dedicated modules. Replace the original inline code with a single delegating call. The core orchestrator must read like a high-level sequence of named steps, abstracting away all implementation details.

- **Moving Features Between Modules**: Shift non-orchestration responsibilities out of the main loop and into dedicated domain modules. Billing belongs in the billing module. Telemetry formatting belongs in the runtime bridge. Extraction state belongs in the extraction phase module. The orchestrator owns sequencing only.

- **Red-Green-Refactor Pipeline for Extraction**: When extracting a module, write a failing test for the new standalone component first. Make it pass using the extracted logic. Then wire the new module back into the orchestrator as a replacement for the inline code. Run the full suite. Green = done.

### Testing Principles
- Test behavior, not implementation. 100% coverage through business behavior.
- Test through the public API exclusively.
- Use factory functions for test data (no `let`/`beforeEach` mutation).
- Tests must document expected business behavior.
- No 1:1 mapping between test files and implementation files required.
- Test runner: `node --test` (NOT Jest/Vitest — this project uses the built-in runner).
- Tests live in `test/` directory.

### Code Style (Functional)
- No data mutation — immutable data structures only.
- Pure functions wherever possible.
- No nested if/else — use early returns or composition.
- No comments — code should be self-documenting.
- Prefer options objects over positional parameters.
- Use array methods (`map`, `filter`, `reduce`) over loops.
- Small, focused functions. Avoid premature abstractions.

### JavaScript Conventions (this is a JS project, not TypeScript)
- All source files are `.js` ESM (`import`/`export`).
- GUI frontend (`tools/gui-react/`) is TypeScript + React.
- Use `zod` or `ajv` for schema validation at trust boundaries.
- Avoid `any` equivalents — validate at boundaries, trust internals.

### Guiding Principles (IndexLab Specific)
- **Accuracy first**: 95%+ on technical specs is the objective.
- **Evidence tiers + confidence gates** control what happens next.
- **Need-driven discovery**: NeedSet drives search — no endless alias loops.
- **Deterministic indexing**: `content_hash` dedupe + stable `snippet_id`s = replayable, auditable.
- **GUI must prove each phase**: no phase is "done" until GUI proof checklist is complete.

---

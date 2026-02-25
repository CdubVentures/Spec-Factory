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
- [ ] Define canonical settings schema (keys, types, defaults, versioning, migration rules). *(partially done for domain schemas; no global single-file schema contract yet)*
- [ ] Define authority precedence (server snapshot vs local cache vs runtime defaults) with deterministic merge order.
- [ ] Define update contract: single write API, autosave debounce rules, optimistic update behavior, rollback behavior.
- [ ] Define propagation contract for cross-surface updates (same-tab, cross-tab, websocket/event invalidation where needed).
- [x] Make the canonical source of truth a single `user-settings.json` model that includes category-mapping studio config and all runtime/convergence/llm/storage settings.
- [ ] Define deterministic generation pipeline where all derived config artifacts are generated from `user-settings.json`, not vice versa.

### Settings audit gap log (2026-02-25)
- [x] `Storage settings` mutations now persist and restore on restart through the settings authority write/read path.
- [x] Runtime persistence no longer uses fallback coercion that overwrites explicit low/falsy values.
- [x] Convergence slider fallbacks in `PipelineSettingsPage` and `RuntimePanel` now use schema-derived minima (`knob.min`) instead of hardcoded `0`.
- [x] Runtime `dynamicFetchPolicyMapJson` is now part of the persisted runtime payload and write schema.
- [x] Convergence knob definitions remain duplicated across `pipeline-settings` and authority modules.
- [ ] Canonical defaults manifest is not the single initialization source for all settings surfaces.
- [ ] Failed autosave/error outcome handling is not fully surfaced as persisted-state truth in all settings surfaces (Studio + runtime panel + LLM status parity resolved; remaining broader cross-surface coverage still open).
- [x] LLM route-matrix editor knobs now affect runtime extraction behavior (field-policy mapping, evidence source mode, model ladder/tokens, studio prompt flags, insufficient-evidence action).
- [x] LLM autosave mode is now global durable state (`llmSettingsAutoSaveEnabled`) persisted via `/ui-settings` and hydrated from `user-settings.json`.
- [x] GUI API bootstrap now initializes `config` before settings hydration (`src/api/guiServer.js`).
- [x] Source strategy authority/routes are now category-scoped and runtime discovery consumes category-enabled source-strategy rows from SpecDb.
- [x] Convergence knobs for identity caps / SERP triage min-max-enable / retrieval identity filter now affect runtime execution paths.
- [x] Global autosave-mode toggles (studio all/workbook/map, runtime, storage) now persist through `/ui-settings` into `user-settings.json` and hydrate on app bootstrap.
- [x] Field Rules Studio `Auto-save ALL` now hard-locks Mapping Studio (tab1), Key Navigator (tab2), and Field Contract/Workbook (tab3) autosave toggles to ON with explicit locked-state labels.
- [x] Studio nested writers under Key Navigator and Field Contract now respect autosave ownership (autosave-gated save path) and no longer bypass autosave mode with unconditional save commits.
- [x] `Storage settings` now persist from `StoragePage` through `useStorageSettingsAuthority` and are restored via the settings authority write/read pipeline.
- [x] `WorkersTab` no longer reads `/runtime-settings` directly (`useQuery`) and now consumes runtime settings via authority hook/snapshot.
- [x] Canonical settings model now includes category-studio mapping as a first-class persisted key in `user-settings.json`.
- [x] Runtime planner/triage UI now hard-locks closed when discovery is disabled and shows an explicit red blocked reason badge.
- [x] Field Rules Studio now recovers from stale session UI state by auto-selecting the first valid key, clearing invalid group filters, and seeding mapping from map payload shape (not only `version`).
- [x] Studio map read path now ignores missing/empty `user-settings` studio entries so canonical workbook maps load instead of blank map payloads.
- [x] Autosave for runtime/storage/llm/studio now tracks last attempted payload fingerprints so unchanged failed payloads do not retry-loop; manual save paths can still force retry.
- [x] Settings authority reads for runtime/storage/convergence/ui no longer use fixed query polling intervals; hydration/refresh uses bootstrap reload plus invalidation.
- [x] Studio map GET now deterministically selects the richer source between `user-settings` and control-plane map files, preventing legacy partial `user-settings` map payloads from masking complete category maps.
- [x] Indexing `Run IndexLab` is now hydration-gated on runtime settings authority load, preventing pre-hydration defaults from overriding persisted runtime settings.
- [x] Runtime panel settings controls now hard-lock until runtime settings hydrate, preventing pre-hydration edits from writing default drift.
- [x] Deferred Studio contract knobs (`contract.unknown_token`, `contract.rounding.mode`, `contract.unknown_reason_required`) are now locked in Key Navigator + Workbench Drawer with explicit `Deferred: runtime wiring in progress` labels.
- [x] `StoragePage` autosave/manual save are now hydration-gated; writes stay disabled until initial storage-settings hydration settles.
- [x] `implementation/gui-persistence/llm-route-field-usage-audit.json` is now generated from source with a deterministic audit script (`scripts/generate-llm-route-field-usage-audit.js`) and regression-guarded by `test/llmRouteFieldUsageAudit.test.js`; only derived `effort_band` remains dormant by design.
- [x] Studio save status now prioritizes `saveDraftsMut` error and unsaved-pending state before autosave idle labels, preventing false `Up to date`/`Auto-saved` indicators while edits are unsaved or save failed.
- [x] LLM settings header now distinguishes autosave dirty state (`Unsaved (auto-save pending).`) from manual-save dirty state.
- [x] Runtime/convergence/storage settings routes now await persistence writes before returning success, preventing out-of-order stale snapshot overwrites during rapid successive saves.
- [x] Runtime/convergence/storage settings routes now return `500` with explicit error codes and rollback in-memory state when persistence writes fail (`runtime_settings_persist_failed`, `convergence_settings_persist_failed`, `storage_settings_persist_failed`).
- [x] LLM settings autosave now flushes pending dirty payload on unmount, so debounce-window edits are not dropped on navigation/reload.
- [x] Studio drafts + map autosave now flush pending dirty payload on unmount, so debounce-window edits are not dropped on navigation/reload.
- [x] Convergence duplicate controls now have explicit cross-surface wiring coverage proving shared authority ownership + canonical knob-key propagation in both Runtime and Pipeline surfaces.
- [x] Runtime settings hydration in `IndexingPage` now uses binding-driven key maps (string/number/boolean) instead of hand-written per-key branches, reducing selector drift risk across save/load/read paths.
- [x] Indexing run-control/start payload fallbacks now derive from hydrated runtime authority baseline (`runtimeSettingsData`) rather than hardcoded `runtimeDefaults` once hydration is available.
- [x] Settings endpoint ownership matrix now includes `/source-strategy`, ensuring source-strategy controls remain authority-owned and page surfaces cannot bypass persistence adapters directly.
- [x] Runtime autosave payload serialization now uses an authority-synced numeric fallback baseline (`runtimeSettingsFallbackBaseline`) instead of direct `runtimeDefaults` numeric fallbacks after hydration.
- [x] Runtime + storage autosave authorities now have explicit unmount-flush regression coverage, matching LLM/studio debounce-window durability guarantees.
- [x] Storage page save-state labels now have explicit parity coverage for autosave-pending vs manual unsaved truth (`Unsaved changes queued for auto save.` vs `Unsaved changes.`).
- [x] Runtime Ops `WorkersTab` now has explicit propagation coverage proving downstream prefetch surfaces consume runtime knobs from shared runtime authority snapshot (`liveSettings`) rather than endpoint-local reads.

### Frontend settings control audit (2026-02-24)
- Persistence authority coverage for knobs: `tools/gui-react/src/stores/runtimeSettingsAuthority.ts`, `tools/gui-react/src/stores/convergenceSettingsAuthority.ts`, `tools/gui-react/src/stores/storageSettingsAuthority.ts`, `tools/gui-react/src/stores/llmSettingsAuthority.ts`, `tools/gui-react/src/stores/sourceStrategyAuthority.ts`, `tools/gui-react/src/stores/settingsAuthority.ts`.
- UI writers through authority:
  - Convergence controls in `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` and `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx` route to convergence authority updates.
  - Runtime knobs in `tools/gui-react/src/pages/indexing/IndexingPage.tsx` route through runtime authority.
  - Storage controls in `tools/gui-react/src/pages/storage/StoragePage.tsx` use storage authority autosave/manual save APIs.
  - LLM controls in `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` use LLM authority APIs.
  - Source strategy controls in `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` use source-strategy authority APIs.
  - Studio map/drafts are owned by `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts` and written via `saveMap`/`saveDrafts` studio mutations.
  - Studio Key Navigator + Field Contract nested edits now trigger draft persistence via autosave-gated authority paths (manual save remains explicit when autosave is off).
- Read/hydration path:
  - Startup bootstrap now hydrates runtime + convergence + storage + source-strategy through `tools/gui-react/src/components/layout/AppShell.tsx`; LLM routes are preloaded for the active category.
  - Consumers should read via authority selectors (`useAuthoritySnapshot` + dedicated hooks), but some surfaces still carry local defaults on first render.
  - Indexing run-start actions now wait for runtime settings hydration before enabling run dispatch.
- No-op hardcoded behavior check:
  - Convergence `knob` minimum fallback is now metadata-driven (`knob.min`) in the primary slider surfaces.
  - Runtime numeric text/numeric parsing and serialization now go through authority schema-aware helpers rather than local ad-hoc coercion.
  - Runtime execution now consumes persisted convergence keys (`needsetCapIdentity*`, `serpTriage*`, `retrievalIdentityFilterEnabled`) in convergence/triage/retrieval flows.
  - Source strategy table mutations are now consumed by runtime discovery via category-scoped SpecDb reads in run execution.
  - Planner/Triage runtime section is non-interactive and force-collapsed while `discoveryEnabled=false`, with a visible blocked-state reason.
  - Studio `Auto-save ALL` lock propagation is consistent across tab1/tab2/tab3 autosave controls and status labels.
  - Deferred Studio contract knobs are non-editable across Key Navigator + Workbench Drawer until runtime wiring is complete.
  - Endpoint ownership check is clean: settings routes (`/runtime-settings`, `/convergence-settings`, `/storage-settings`, `/ui-settings`, `/llm-settings/*`, `/source-strategy*`) are referenced from authority modules, not page components.
  - Storage autosave/manual save paths are hydration-gated in `StoragePage`, preventing pre-hydration default writes.
  - Studio header save status now reports `Save failed` / `Unsaved (auto-save pending)` before `Up to date`, so autosave failure/dirty truth is visible.
  - LLM header save status now reports autosave dirty state explicitly (`Unsaved (auto-save pending).`) instead of generic dirty text.
  - Backend settings route writes now await persistence completion (`/runtime-settings`, `/convergence-settings`, `/storage-settings`) before returning success.
  - Indexing run-control and run-start payload fallbacks are authority-derived post-hydration, not `runtimeDefaults`-derived, preventing hardcoded runtime drift during launches.
  - Runtime autosave payload numeric serialization fallbacks are authority-synced post-hydration, preventing invalid numeric input fallback from drifting to hardcoded defaults.
  - Runtime Ops downstream prefetch panels consume `liveSettings` derived from runtime authority snapshot in `WorkersTab`, so runtime knob values propagate outside primary settings pages.

### Phase 3 - Single authoritative store foundation
- [ ] Implement a single settings authority store module with: hydrate-once, subscribe/select, patch update, and reset APIs.
- [ ] Add persistence adapters for backend + local cache with schema validation at trust boundaries.
- [ ] Add migration/version handling for stored settings so old payloads are upgraded deterministically.
- [ ] Add telemetry/log hooks for setting-write success/failure and stale-read detection.
- [ ] Add a generator-safe contract: every writer writes the canonical settings model, and every generated file derives from this model.

### Phase 4 - Bootstrap and load path unification
- [ ] Route app startup through one hydration pipeline that resolves settings once and publishes globally (runtime + convergence + storage + source-strategy + active-category llm).
- [ ] Remove per-component ad hoc initialization that bypasses the authority store.
- [ ] Ensure first paint and post-hydration behavior are deterministic (no hardcoded fallback drift).
- [ ] Validate reload behavior: changes survive restart and load into all consumers immediately.

### Phase 5 - Migrate all settings writers
- [x] Replace direct/local writes in every setting control with store actions.
- [x] Standardize autosave and explicit save flows to the same authority write path.
- [ ] Ensure all mutation routes persist to the real authority target (no UI-only state).
- [ ] Add tests for every writer path proving persisted value is present after reload.

### Phase 6 - Migrate all settings readers/consumers
- [ ] Replace component-local mirrors and hardcoded constants with store selectors.
- [ ] Ensure all duplicated setting surfaces subscribe to the same key and stay in sync live.
- [ ] Validate non-UI consumers (api payload builders, backend-triggered flows, derived displays) consume authority values.
- [ ] Remove stale selector logic and dead fallback branches once parity is proven.

### Phase 7 - Hardcoded behavior elimination audit
- [ ] Audit for hardcoded setting-dependent behavior and replace with derived authority values.
- [ ] Audit conditional UI logic to ensure it reacts to live settings updates without refresh hacks.
- [ ] Audit save success states to ensure UI reflects actual persistence result, not assumed success.
- [ ] Document and remove obsolete constants that conflict with authority contract.

### Phase 8 - End-to-end validation matrix
- [x] Build a settings persistence matrix: setting key x writer surface x reload x duplicate surface sync x backend reflection.
- [x] Add/extend unit tests for store reducers/selectors and integration tests for writer/reader wiring.
- [ ] Add/extend GUI/E2E tests for autosave, explicit save, reload persistence, and cross-surface live propagation.
- [ ] Run full targeted suites and resolve regressions until green.

## Frontend settings persistence status matrix (2026-02-24)
- Runtime settings (`/runtime-settings`)
  - Writer: `tools/gui-react/src/stores/runtimeSettingsAuthority.ts` → `useRuntimeSettingsAuthority`.
  - Save surfaces: `tools/gui-react/src/pages/indexing/IndexingPage.tsx`, `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx`.
  - Read/hydrate: `tools/gui-react/src/stores/runtimeSettingsAuthority.ts` + `tools/gui-react/src/components/layout/AppShell.tsx` bootstrap (no fixed `refetchInterval` polling).
  - Persist on reload: route-backed read/write exists.
  - Globality: partial; bootstrap available, with runtime run-start and runtime panel controls locked until runtime settings hydration completes.
  - Hardcoded risk: low; local fallback/default render state still exists pre-hydration, while post-hydration run payload fallbacks now derive from authority snapshot baseline.

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
  - Hardcoded risk: medium; local defaults render pre-hydration, but autosave/manual save are now hydration-gated.

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
  - Hardcoded risk: low in persistence path, but cross-page defaults remain a local concern.

- Source strategy (`/source-strategy/:id`)
  - Writer: `tools/gui-react/src/stores/sourceStrategyAuthority.ts`.
  - Save surface: `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx`.
  - Read/hydrate: authority query with AppShell bootstrap path plus page-level reads.
  - Persist on reload: route-backed read/write exists.
  - Globality: category-scoped; authority query keys + route params now bind to active category and avoid backend fallback categories.
  - Hardcoded risk: low/medium; runtime discovery now consumes category-enabled source strategy rows, with remaining risk in non-run contexts that do not load SpecDb.

- Studio map/drafts (field studio persistence endpoints)
  - Writer: `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts` (`saveMap`, `saveDrafts`).
  - Save surface: `tools/gui-react/src/pages/studio/StudioPage.tsx`.
  - Read/hydrate: page reads dedicated studio endpoints.
  - Persist on reload: route-backed persistence exists for map/drafts.
  - Globality: partial; domain-specific and does not yet use a shared app-shell settings pipeline.
  - Deferred knobs: `contract.unknown_token`, `contract.rounding.mode`, and `contract.unknown_reason_required` are intentionally locked in Studio UI pending runtime wiring.
  - Hardcoded risk: low.

### Phase 6 follow-up status (2026-02-25)
- [ ] Complete migration of all settings reads to pure authority selectors (remaining local initialization mirrors/fallbacks).
- [ ] Replace local duplicated defaults with authority-derived defaults across all setting consumers. *(runtime hydration branch drift reduced by binding-driven mapping; local mirror defaults still remain in `IndexingPage` state initialization)*
- [x] Add explicit cross-surface propagation tests for shared settings keys.
- [x] Ensure source-strategy authority is category-scoped end-to-end (UI query key, route params, and runtime consumption).
- [x] Ensure converged settings keys marked in manifest are all wired into runtime behavior (no persistence-only dead knobs).

### Phase 9 - Documentation and operational handoff
- [ ] Update implementation docs with final authority contract, source map, and subscriber map.
- [ ] Record known invariants and anti-patterns (no direct component writes, no hardcoded setting forks).
- [ ] Add a maintenance checklist for future settings: add key, add writer, add reader, add persistence test, add propagation test.
- [ ] Keep this section as the active checklist and mark each phase complete as execution progresses.

## Scope and source trees

### Canonical plan docs

`implementation/data-managament/`
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

`implementation/field-studio-contract/`
- `component-system-architecture.md`
- `field-studio-contract.mmd`
- `field-studio-contract-hierarchy.mmd`

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

1. Authoring sources (workbook map, drafts, generated artifacts) define category authority.
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
2. Draft rules overlay baseline via session cache merge.
3. Draft field order overrides compiled order and preserves `__grp::` markers.
4. Snapshot token is derived from draft timestamp, compiled timestamp, and SpecDb sync version.

Primary authority sources:
- `helper_files/{category}/_control_plane/*`
- `helper_files/{category}/_generated/*`
- `helper_files/{category}/_suggestions/*`
- `data_authority_sync` and runtime SQL tables in SpecDb

## Test mode contract highlights

- Seed pools come from `implementation/grid-rules/component-identity-pools-10-tabs.xlsx`.
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
- Data authority suite: 30/30 passing.
- Grid suite: all targeted tests passing except `test/reviewLaneContractGui.test.js`.
- Current GUI failure: Playwright timeout waiting for visible `mouse_contract_lane_matrix_gui` option while option exists but is hidden.
- Settings audit focused suites (latest local run): 31/31 passing.
  - `test/runtimeSettingsApi.test.js`
  - `test/storageSettingsRoutes.test.js`
  - `test/sourceStrategyCategoryScope.test.js`
  - `test/sourceStrategyAuthorityWiring.test.js`
  - `test/convergenceRuntimeKnobWiring.test.js`
  - `test/dataChangeInvalidationMap.test.js`
- Settings autosave authority + studio propagation focused suites (latest local run): 42/42 passing.
  - `test/uiAutosaveAuthorityWiring.test.js`
  - `test/studioConsumerToggleImmediatePropagation.test.js`
  - `test/guiPersistenceSessionScope.test.js`
  - `test/uiSettingsRoutes.test.js`
  - `test/settingsAuthorityMatrixWiring.test.js`
  - `test/runtimeSettingsApi.test.js`
  - `test/storageSettingsRoutes.test.js`
- Settings persistence failure + unmount flush coverage (latest local run): 8/8 passing.
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
- Runtime autosave payload baseline wiring coverage (latest local run): 1/1 passing.
  - `test/runtimeAutosavePayloadBaselineWiring.test.js`
- Runtime Ops settings propagation wiring coverage (latest local run): 1/1 passing.
  - `test/runtimeOpsSettingsPropagationWiring.test.js`
- Full settings persistence revalidation suite (latest local run): 95/95 passing.
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

- Keep this file aligned with canonical docs under `implementation/data-managament/` and `implementation/grid-rules/`.
- Treat mmd/png hierarchy diagrams as support artifacts, not sole authority.
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


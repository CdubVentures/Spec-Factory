# Settings Write/Read Audit

Audit date: 2026-02-25

Latest full-knob audit artifact:

- `implementation/gui-persistence/FRONTEND-KNOB-AUDIT-2026-02-24.md`
- `implementation/gui-persistence/settings-knob-usage-audit.json`
- `implementation/gui-persistence/llm-route-field-usage-audit.json`

## Scope

This audit maps frontend settings/save/autosave controls to:

- writer component(s)
- persistence route
- backend authority target
- read/hydration path
- live propagation path

It separates:

- config settings (should become single authoritative settings store)
- authoring settings/data (studio map docs)
- session UI preferences (collapse/tab/filter state)

## Baseline Status

- Data authority targeted suite: 43/43 passing.
- Grid/field targeted suite: 241/241 passing.

Commands used:

- `node --test test/dataChangeContract.test.js test/dataChangeInvalidationMap.test.js test/dataChangeDomainParity.test.js test/dataAuthorityRoutes.test.js test/specDbSyncService.test.js test/specDbSyncVersion.test.js test/compileProcessCompletion.test.js test/studioRoutesPropagation.test.js test/mapValidationPreflight.test.js test/dataAuthorityPropagationMatrix.test.js`
- `node --test test/contractDriven.test.js test/componentReviewDataLaneState.test.js test/reviewLaneContractApi.test.js test/reviewLaneContractGui.test.js test/reviewGridData.test.js test/reviewOverrideWorkflow.test.js test/phase1FieldRulesLoader.test.js`

## Authoritative Config Settings Matrix

| Surface | Frontend writers | Save mode | API route | Backend persistence target | Frontend read path | Live propagation |
|---|---|---|---|---|---|---|
| Runtime settings | `tools/gui-react/src/pages/indexing/IndexingPage.tsx` via `tools/gui-react/src/stores/runtimeSettingsAuthority.ts` | Manual + autosave (1.5s), plus unmount flush | `PUT /api/v1/runtime-settings` | In-memory `config` + `helper_files/_runtime/settings.json` | Shared runtime authority hook hydrates from `GET /api/v1/runtime-settings` | `runtime-settings-updated` -> domains `settings,indexing` -> invalidates `['runtime-settings']`, `['indexing','llm-config']` |
| Convergence settings | `tools/gui-react/src/pages/indexing/IndexingPage.tsx`, `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx` via `tools/gui-react/src/stores/convergenceSettingsAuthority.ts` | Manual save button | `PUT /api/v1/convergence-settings` | In-memory `config` + `helper_files/_runtime/convergence-settings.json` | Shared authority hook hydrates once from `GET /api/v1/convergence-settings` and both pages subscribe to the same store slice | `convergence-settings-updated` -> domains `settings,indexing` -> invalidates convergence/indexing queries |
| LLM route matrix | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` via `tools/gui-react/src/stores/llmSettingsAuthority.ts` | Manual + autosave (700ms) + reset | `PUT /api/v1/llm-settings/:category/routes`, `POST /reset` | SpecDb table via `saveLlmRouteMatrix/resetLlmRouteMatrixToDefaults` | `GET /api/v1/llm-settings/:category/routes` via shared authority hook | `llm-settings-updated/reset` -> domains `settings,indexing` |
| Storage settings | `tools/gui-react/src/pages/storage/StoragePage.tsx` | Manual + autosave (700ms) | `PUT /api/v1/storage-settings` | in-memory run-data storage state | `GET /api/v1/storage-settings` + local folder browser read path (`GET /api/v1/storage-settings/local/browse`) | `storage-settings-updated` -> domains `storage,settings` |

## Studio Authoring Save Matrix

| Surface | Frontend writers | Save mode | API route | Backend persistence target | Frontend read path | Live propagation |
|---|---|---|---|---|---|---|
| Field Studio map (mapping contract) | `tools/gui-react/src/pages/studio/StudioPage.tsx` (`MappingStudioTab`) via `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts` | Manual + autosave (1.5s) | `PUT /api/v1/studio/:category/field-studio-map` | `_control_plane/field_studio_map.json` (written by `saveFieldStudioMap`) | `GET /api/v1/studio/:category/field-studio-map` | `field-studio-map-saved` -> domains `studio,mapping,review-layout` |
| Field Studio docs (key navigator/workbench) | `tools/gui-react/src/pages/studio/StudioPage.tsx` (`KeyNavigatorTab`, `FieldRulesWorkbench`) via `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts` | Manual + autosave (1.5s) | `PUT /api/v1/studio/:category/field-studio-map` | `_control_plane/field_studio_map.json` (`selected_keys` + `field_overrides`) | `GET /api/v1/studio/:category/payload` merged reads + `GET /api/v1/studio/:category/field-studio-map` | `field-studio-map-saved` -> domains `studio,mapping,review-layout` |

## Session-Scoped UI Preference Stores

Canonical registry file: `implementation/gui-persistence/UI-STATE-STORES.md`

Primary store modules:

- `tools/gui-react/src/stores/collapseStore.ts`
- `tools/gui-react/src/stores/tabStore.ts`
- `tools/gui-react/src/stores/indexlabStore.ts`
- `tools/gui-react/src/stores/uiStore.ts`
- `tools/gui-react/src/pages/review/reviewGridSessionState.ts`
- `tools/gui-react/src/pages/studio/workbench/workbenchSessionState.ts`
- `tools/gui-react/src/components/common/DataTable.tsx`

Important current behavior:

- These are session-scoped (`sessionStorage`), not backend-persisted.
- Studio/runtime/storage/LLM autosave toggles are mirrored in `sessionStorage`, but canonical persistence is durable via `/ui-settings` and `user-settings.json`.
- LLM settings autosave uses global key `llmSettings:autoSaveEnabled` in `useUiStore` (no category-scoped autosave keys).
- Nested enum source tabs are session-scoped in both Studio surfaces:
  - `studio:keyNavigator:enumSourceTab:{category}:{fieldKey}`
  - `studio:workbench:enumSourceTab:{category}:{fieldKey}`

## Data-Edit Save Surfaces (Non-Config but Important)

These are not "settings files", but are save/autosave paths that mutate authoritative product/review data:

- Review inline edit autosave/manual commit: `tools/gui-react/src/pages/review/ReviewPage.tsx` -> `POST /review/:category/manual-override`
- Review candidate override/accept/confirm: `ReviewPage.tsx` -> `POST /review/:category/*`
- Brand save/rename/delete: `tools/gui-react/src/pages/studio/BrandManager.tsx` -> `POST/PUT/DELETE /brands*`
- Catalog product save/rename/delete: `tools/gui-react/src/pages/catalog/ProductManager.tsx` -> `POST/PUT /catalog/:category/products*`
- Component/enum review actions: `tools/gui-react/src/pages/component-review/*` -> `POST /review-components/:category/*`

## Cross-Surface Duplication and Risks

1. No full-app single frontend settings authority store exists yet.

- Settings state is still split across page-local state, authority slices, Zustand UI stores, and ad hoc session keys.

2. Runtime settings unmount flush still writes outside mutation lifecycle (now centralized in authority module).

- `runtimeSettingsAuthority.ts` flushes pending dirty payload on unmount using direct API call for last-chance persistence.

3. Autosave preference toggles still keep a session mirror and require continuous parity checks with durable `/ui-settings` state.

4. Storage settings writer now exists, but should be folded into centralized settings authority for parity.

- The page persists destination/credentials config and browse-path session state independently of the shared authority slices.

5. Storage page save/autosave paths are hydration-gated (resolved).

- `tools/gui-react/src/pages/storage/StoragePage.tsx` now gates save/autosave until first server hydration settles.
- Regression guard: `test/storageSettingsHydrationGate.test.js`.

6. LLM dormant-key audit artifact drift is resolved.

- `implementation/gui-persistence/llm-route-field-usage-audit.json` is now generated from source by `scripts/generate-llm-route-field-usage-audit.js`.
- Regression guard `test/llmRouteFieldUsageAudit.test.js` enforces artifact parity and allows only derived `effort_band` as dormant.

7. Studio autosave status parity is resolved for saved map-doc writes.

- `tools/gui-react/src/pages/studio/StudioPage.tsx` now reports save status in deterministic order: pending -> error -> unsaved -> autosave idle.
- Autosave-on dirty state no longer renders `Up to date`; it renders `Unsaved (auto-save pending)` until persistence succeeds.
- Regression guard: `test/studioAutosaveStatusParity.test.js`.

8. Backend settings route write-order race is resolved.

- `src/api/routes/configRoutes.js` now awaits persistence writes for `/runtime-settings`, `/convergence-settings`, and `/storage-settings` before returning success.
- This prevents older async writes from finishing after newer saves and overwriting persisted snapshots with stale values.
- Regression guard: `test/runtimeSettingsApi.test.js`.

9. LLM autosave status parity is resolved in header save-state text.

- `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` now shows `Unsaved (auto-save pending).` when autosave is enabled and edits are dirty.
- Regression guard: `test/llmSettingsAutosaveStatusParity.test.js`.

## Initial Migration Target (Authority Model)

1. Introduce one `settingsAuthorityStore` in frontend:

- hydrate once on app load from canonical settings endpoints
- expose typed selectors/actions
- centralize save/autosave scheduling and flush behavior

2. Move current config settings to authority-backed slices:

- runtime settings
- convergence settings
- llm route settings metadata/state
- autosave preferences

3. Keep domain authoring payloads (studio map docs) category-scoped:

- still use dedicated endpoints
- but route save/autosave state and preferences through the same authority store contract

4. Ensure all consumers subscribe to the same source:

- duplicate surfaces (Indexing + Pipeline convergence) read/write same authority slice
- reload/hydration resolves once and updates all subscribers

## Current Authority Ownership (Implemented)

- `tools/gui-react/src/stores/settingsAuthority.ts` bootstraps runtime + convergence hydration once at app startup (`AppShell`).
- `tools/gui-react/src/stores/runtimeSettingsAuthority.ts` owns runtime settings read/write/autosave.
- `tools/gui-react/src/stores/convergenceSettingsAuthority.ts` owns convergence settings read/write across Indexing + Pipeline Settings.
- `tools/gui-react/src/stores/llmSettingsAuthority.ts` owns LLM route matrix read/write/reset/autosave.
- `tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts` owns Studio map-doc write route (manual + autosave callers).

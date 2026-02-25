# Frontend Knob Audit (2026-02-24)

## Scope

Full audit of frontend surfaces that let users save, autosave, or mutate settings/state intended to persist across app loads.

Audited surfaces:

- Runtime settings knobs (`IndexingPage`/`RuntimePanel`)
- Convergence settings knobs (`IndexingPage`, `PipelineSettingsPage`)
- Storage settings knobs (`StoragePage`)
- LLM settings knobs (`LlmSettingsPage` route matrix controls)
- Source strategy toggles (`PipelineSettingsPage`)
- Studio save/autosave controls (`StudioPage`, map + drafts)
- Global UI autosave settings (`/ui-settings` contract)

## Evidence

Generated artifacts:

- `implementation/gui-persistence/settings-knob-usage-audit.json`
- `implementation/gui-persistence/llm-route-field-usage-audit.json`

Targeted verification suites run:

- `node --test --test-concurrency=1 test/runtimeSettingsApi.test.js test/storageSettingsRoutes.test.js test/sourceStrategyCategoryScope.test.js test/sourceStrategyAuthorityWiring.test.js test/convergenceRuntimeKnobWiring.test.js test/dataChangeInvalidationMap.test.js test/uiSettingsRoutes.test.js test/userSettingsService.test.js test/runtimeSettingsAuthorityWiring.test.js test/convergenceSettingsAuthorityWiring.test.js test/llmSettingsAuthorityWiring.test.js test/settingsAuthorityMatrixWiring.test.js test/uiAutosaveAuthorityWiring.test.js test/studioPersistenceAuthorityWiring.test.js test/guiPersistenceSessionScope.test.js test/frontendSessionAuditCoverage.test.js test/storageSettingsHydrationGate.test.js test/studioDeferredKnobLock.test.js test/llmRouteFieldUsageAudit.test.js test/studioAutosaveStatusParity.test.js test/runtimePanelAutosaveStatusParity.test.js test/llmSettingsAutosaveStatusParity.test.js`
- Result: `79/79` passing.

## Knob Coverage Result

Runtime settings:

- Frontend runtime knobs in manifest: `49`
- Mapped to runtime API + backend config: `48/49`
- Unmapped runtime key: `runtimeAutoSaveEnabled` (intentional UI-autosave preference key, persisted via `/ui-settings`, not `/runtime-settings`)
- Mapped runtime keys with zero downstream runtime usage: `0`

Convergence settings:

- Frontend convergence knobs in manifest: `26`
- Mapped to API + backend config: `26/26`
- Mapped convergence keys with zero downstream runtime usage: `0`

LLM route settings:

- Frontend editable row fields: `32`
- Runtime-consumed row fields outside persistence layer: `31/32`; the only non-runtime key is derived `effort_band`.
- `implementation/gui-persistence/llm-route-field-usage-audit.json` is now generated from source via `scripts/generate-llm-route-field-usage-audit.js` and guarded by `test/llmRouteFieldUsageAudit.test.js`.

## Surface Verdicts

Runtime settings (`/runtime-settings`): PASS

- Writers use shared authority (`runtimeSettingsAuthority`).
- Values persist and hydrate on reload.
- Runtime consumes mapped backend config keys.
- Route persistence writes now complete before success responses, preventing stale out-of-order snapshot overwrites under rapid successive saves.

Convergence settings (`/convergence-settings`): PASS

- Writers use shared authority (`convergenceSettingsAuthority`).
- Values persist and hydrate on reload.
- Runtime consumes convergence knobs (including identity caps, SERP triage, retrieval caps/filter).
- Route persistence writes now complete before success responses, preventing stale out-of-order snapshot overwrites under rapid successive saves.

Storage settings (`/storage-settings`): PASS

- Writers use shared authority (`storageSettingsAuthority`).
- Values persist and hydrate on reload.
- Runtime storage relocation path consumes persisted storage state.
- Save and autosave writes are hydration-gated in `StoragePage` until initial settings hydrate.
- Route persistence writes now complete before success responses, preventing stale out-of-order snapshot overwrites under rapid successive saves.

Source strategy (`/source-strategy/:id`): PASS

- Writers use shared authority (`sourceStrategyAuthority`).
- Values persist category-scoped to SpecDb and are consumed in runtime discovery.

Studio map + drafts (`/studio/:category/*`): PASS (domain-scoped)

- Map and draft saves/autosaves persist through dedicated routes.
- Hydration on load and autosave dedupe/force-save paths are present.
- Studio header save status now reports pending/error/unsaved truth before idle labels, preventing false `Up to date` state while autosave-pending or failed.

Global autosave settings (`/ui-settings`): PASS

- Studio all/workbook/map, runtime autosave, storage autosave, and LLM autosave are persisted durably and bootstrapped globally.
- `llmSettingsAutoSaveEnabled` is now persisted in `/ui-settings` and hydrated from `helper_files/_runtime/user-settings.json`.

LLM route matrix knobs (`/llm-settings/:category/routes`): PASS (with residual tuning risk)

- Save/autosave persistence path works (SpecDb-backed).
- Runtime now derives field-matched route policy rows and consumes row knobs in extraction behavior, including:
  - model ladder + route token cap selection
  - single/all-source evidence mode and websearch inclusion gate
  - studio prompt-context inclusion flags
  - insufficient-evidence escalation behavior
  - all-sources confidence repatch retry path

## Hardcoded/No-Effect Findings

Finding 1 (Resolved 2026-02-24): LLM route-matrix runtime wiring.

- Runtime route-matrix policy now includes field-policy mapping + full row knob projection.
- Runtime extraction consumes route policy knobs in evidence selection, prompt shaping, and model/token routing.
- Evidence:
  - `src/pipeline/helpers/runtimeHelpers.js`
  - `src/pipeline/runProduct.js`
  - `src/llm/extractCandidatesLLM.js`

Finding 2 (Resolved 2026-02-24): LLM autosave global durability.

- `/ui-settings` and `user-settings.json` now include `llmSettingsAutoSaveEnabled`.
- LLM autosave session key is now global (`llmSettings:autoSaveEnabled`) and synchronized with durable authority state.
- Evidence:
  - `src/api/routes/configRoutes.js`
  - `src/api/services/userSettingsService.js`
  - `tools/gui-react/src/stores/uiStore.ts`
  - `tools/gui-react/src/stores/settingsAuthority.ts`
  - `tools/gui-react/src/stores/uiSettingsAuthority.ts`

Finding 3 (Resolved 2026-02-24): Storage settings pre-hydration edit/save window.

- `StoragePage` now gates autosave and manual save until hydration is complete.
- Evidence:
  - `tools/gui-react/src/pages/storage/StoragePage.tsx` (`autoSaveEnabled` passed to authority is hydration-gated).
  - `tools/gui-react/src/pages/storage/StoragePage.tsx` (`canSave` now depends on `hasHydratedFromServer`).
  - `test/storageSettingsHydrationGate.test.js`

Finding 4 (Resolved 2026-02-25): LLM dormant-key audit artifact drift.

- Added deterministic audit generation + write path:
  - `scripts/llmRouteFieldUsageAudit.js`
  - `scripts/generate-llm-route-field-usage-audit.js`
- Regenerated `implementation/gui-persistence/llm-route-field-usage-audit.json` from current frontend key schema + runtime consumer files.
- Dormant output now correctly reports only `effort_band`, which is derived UI metadata from `effort` and intentionally not consumed by runtime policy wiring.
- Regression guard:
  - `test/llmRouteFieldUsageAudit.test.js`

Finding 5 (Resolved 2026-02-25): Studio autosave status truthiness.

- `StudioPage` save status precedence now resolves as `saving -> error -> unsaved -> autosave-idle`.
- With autosave enabled and local edits pending, header now shows `Unsaved (auto-save pending)` instead of `Up to date`.
- Save mutation failures now surface as `Save failed` state in the same status indicator.
- Evidence:
  - `tools/gui-react/src/pages/studio/StudioPage.tsx`
  - `test/studioAutosaveStatusParity.test.js`

Finding 6 (Resolved 2026-02-25): settings route write-order race across rapid saves.

- `/runtime-settings`, `/convergence-settings`, and `/storage-settings` routes now await persistence writes before returning success.
- This removes stale overwrite races where older async writes could finish after newer writes and leave persisted snapshots behind live in-memory state.
- Evidence:
  - `src/api/routes/configRoutes.js`
  - `test/runtimeSettingsApi.test.js`

## Overall Verdict

Audit verdict: PARTIAL PASS.

LLM autosave durability/globality, route-matrix runtime-effect blockers, and backend settings write-order race conditions are resolved. Remaining risks are:

- authority-default unification
- autosave error-state parity still needs broader cross-surface regression coverage beyond Studio/Runtime/LLM status surfaces

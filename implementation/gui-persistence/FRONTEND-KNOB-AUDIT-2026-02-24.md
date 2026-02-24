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

- `node --test test/runtimeSettingsApi.test.js test/storageSettingsRoutes.test.js test/sourceStrategyCategoryScope.test.js test/sourceStrategyAuthorityWiring.test.js test/convergenceRuntimeKnobWiring.test.js test/dataChangeInvalidationMap.test.js test/uiSettingsRoutes.test.js test/userSettingsService.test.js test/runtimeSettingsAuthorityWiring.test.js test/convergenceSettingsAuthorityWiring.test.js test/llmSettingsAuthorityWiring.test.js test/settingsAuthorityMatrixWiring.test.js test/uiAutosaveAuthorityWiring.test.js test/studioPersistenceAuthorityWiring.test.js test/guiPersistenceSessionScope.test.js test/frontendSessionAuditCoverage.test.js`
- Result: `72/72` passing.

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
- Fields with no runtime consumption outside persistence layer: `22`
- Dormant fields are listed in `implementation/gui-persistence/llm-route-field-usage-audit.json` under `dormantKeys`

## Surface Verdicts

Runtime settings (`/runtime-settings`): PASS

- Writers use shared authority (`runtimeSettingsAuthority`).
- Values persist and hydrate on reload.
- Runtime consumes mapped backend config keys.

Convergence settings (`/convergence-settings`): PASS

- Writers use shared authority (`convergenceSettingsAuthority`).
- Values persist and hydrate on reload.
- Runtime consumes convergence knobs (including identity caps, SERP triage, retrieval caps/filter).

Storage settings (`/storage-settings`): PASS

- Writers use shared authority (`storageSettingsAuthority`).
- Values persist and hydrate on reload.
- Runtime storage relocation path consumes persisted storage state.

Source strategy (`/source-strategy/:id`): PASS

- Writers use shared authority (`sourceStrategyAuthority`).
- Values persist category-scoped to SpecDb and are consumed in runtime discovery.

Studio map + drafts (`/studio/:category/*`): PASS (domain-scoped)

- Map and draft saves/autosaves persist through dedicated routes.
- Hydration on load and autosave dedupe/force-save paths are present.

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

## Overall Verdict

Audit verdict: PARTIAL PASS.

LLM autosave durability/globality and LLM route-matrix runtime-effect blockers are resolved. Remaining non-LLM risks are authority-default unification and autosave error-state UX parity.

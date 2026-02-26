# Phase 02 - Extract Runtime Settings Domain from Indexing

## Objective
Decouple runtime settings state, hydration, normalization, and payload logic from `IndexingPage` so runtime settings become a reusable domain module that `Pipeline Settings` can own.

This phase is a structural extraction phase. It preserves behavior and persistence contracts while reducing coupling.

## Why This Phase Exists
Current runtime behavior is functionally correct but structurally concentrated in one page:
- `IndexingPage` holds most runtime key state (`useState` fanout).
- `IndexingPage` owns hydration binding maps and baseline fallback logic.
- `IndexingPage` owns runtime payload serialization (`collectRuntimeSettingsPayload`).
- `IndexingPage` run-start payload wiring consumes those local states directly.

That layout blocks a clean transfer of runtime editing ownership to `Pipeline Settings` and increases drift risk.

## Target End State for Phase 02
At phase close:
- Runtime settings domain logic is extracted to a shared module in `tools/gui-react/src/stores` (or adjacent domain folder).
- `IndexingPage` no longer contains hand-maintained runtime key binding tables or runtime payload serialization internals.
- `IndexingPage` still starts runs with full key coverage and unchanged backend payload shape.
- Persistence contract remains unchanged (`useRuntimeSettingsAuthority` -> `/runtime-settings` -> canonical `user-settings.json`).

## In Scope
1. Extract runtime key metadata and typed bindings from `IndexingPage`.
2. Extract runtime payload serializer and numeric fallback baseline logic.
3. Extract token clamp/default helpers used by runtime model/token knobs.
4. Introduce a shared runtime editor state hook or store adapter consumed by pages.
5. Keep `IndexingPage` behavior parity while depending on extracted module.

## Out of Scope
- New Pipeline tabbed runtime editor UI (Phase 03).
- Removing RuntimePanel runtime controls from Indexing (Phase 04).
- Full end-to-end migration matrix refresh (Phase 05).

## Non-Negotiable Invariants
1. No runtime key loss in `/runtime-settings` PUT payload.
2. No run-start payload key loss for `/process/start`.
3. No regression in autosave/manual save semantics.
4. No schema/default drift from `settingsManifest` and backend `settingsContract`.
5. No page/component direct endpoint calls outside authority modules.

## Detailed Workstreams

## Workstream A - Runtime Domain Module Extraction
Create a dedicated runtime domain module set, for example:
- `tools/gui-react/src/stores/runtimeSettingsDomain.ts`
- `tools/gui-react/src/stores/runtimeSettingsBindings.ts`
- `tools/gui-react/src/stores/runtimeSettingsPayload.ts`

Responsibilities to move out of `IndexingPage`:
- string/number/boolean hydration bindings
- parse helpers (`parseRuntimeInt`, `parseRuntimeFloat`)
- baseline derivation utilities
- serializer (`collectRuntimeSettingsPayload` equivalent)
- token clamp helpers tied to runtime role knobs

Acceptance:
- `IndexingPage` becomes a consumer of runtime domain utilities, not an owner of runtime domain internals.

## Workstream B - Runtime Editor State Adapter
Implement an adapter hook that exposes runtime editor state/actions with authority-safe semantics. Expected shape:
- `values`
- `dirty`
- `saveStatus`
- `isSaving`
- `hydrateFromSnapshot`
- `updateKey`
- `saveNow`

Rules:
- Keep using `useRuntimeSettingsAuthority` as the single mutation path.
- Keep autosave debounce/fingerprint behavior unchanged.
- Ensure hydration guards still prevent pre-hydration drift.

Acceptance:
- Same saved values, same dirty/save status behavior as before extraction.

## Workstream C - IndexingPage Integration Refactor
Replace local runtime wiring in `IndexingPage` with extracted domain adapter:
- remove local key-by-key runtime state declarations where replaced
- remove local hydration loops in favor of domain binder
- remove local serializer construction in favor of domain serializer

But keep run control behavior:
- `/process/start` payload must still contain all runtime keys and aliases.
- Runtime readiness gates must remain (`runtimeReady` semantics).

Acceptance:
- Existing runtime run payload tests pass without relaxing assertions.

## Workstream D - Runtime Ops Consumer Stability
Confirm downstream readers are unaffected:
- `WorkersTab` and other runtime-ops views still read through runtime authority snapshot/readers.
- No new query-cache direct reads added outside authority/store modules.

Acceptance:
- Runtime ops propagation wiring tests stay green.

## File-Level Plan

Expected touched files (minimum set):
- `tools/gui-react/src/pages/indexing/IndexingPage.tsx`
- `tools/gui-react/src/stores/runtimeSettingsAuthority.ts` (only if adapter hooks are added)
- new runtime domain helper file(s) under `tools/gui-react/src/stores/`

Potentially touched for typing/support:
- `tools/gui-react/src/stores/settingsManifest.ts` (only if type exports are needed)
- `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx` (prop typing alignment only)

## Regression Guard Requirements

## Existing tests that must remain green
- `test/runtimeSettingsAuthorityWiring.test.js`
- `test/runtimeSettingsHydrationBindingWiring.test.js`
- `test/runtimeSettingsKeyCoverageMatrix.test.js`
- `test/runtimeRunPayloadBaselineWiring.test.js`
- `test/runtimeAutosavePayloadBaselineWiring.test.js`
- `test/runtimeSettingsAutosaveFlushOnUnmount.test.js`
- `test/settingsEndpointAuthorityOwnershipMatrix.test.js`
- `test/settingsCacheReadAuthorityOwnership.test.js`

## New tests to add in this phase
1. `test/runtimeSettingsDomainExtractionWiring.test.js`
- Asserts `IndexingPage` consumes extracted runtime domain helpers.
- Guards against reintroducing local per-key hydration branches.

2. `test/runtimeSettingsSerializerParity.test.js`
- Asserts extracted serializer outputs same key set/shape as previous logic.

3. `test/runtimeSettingsEditorAdapterParity.test.js`
- Asserts dirty/save/hydration behavior parity for the new adapter hook.

## Migration Sequencing (Within Phase 02)
1. Add domain helper modules first (no consumers changed).
2. Add parity tests for new modules.
3. Switch `IndexingPage` to module consumers incrementally.
4. Re-run key coverage + run payload tests.
5. Remove dead local runtime helper code from `IndexingPage`.

## Risks and Mitigations
- Risk: silent key omission during serializer extraction.
  - Mitigation: enforce `runtimeSettingsKeyCoverageMatrix` + serializer parity tests.

- Risk: token clamp behavior drift per model role.
  - Mitigation: keep existing clamp tests and wire extracted helper under same assertions.

- Risk: autosave edge-case regressions on unmount.
  - Mitigation: preserve `useRuntimeSettingsAuthority` lifecycle and run flush tests unchanged.

## Deliverables
1. Extracted runtime settings domain module(s).
2. Refactored `IndexingPage` consuming extracted module(s).
3. New parity tests for extraction.
4. Evidence note with command list and pass counts.

## Exit Criteria (Definition of Done)
- Runtime domain logic is no longer page-local in `IndexingPage`.
- Runtime payload and run payload key coverage are unchanged.
- Targeted runtime/settings suites are green.
- No ownership-contract regressions introduced.

## Test Command Template
Run at phase completion:

```bash
node --test --test-concurrency=1 \
  test/runtimeSettingsAuthorityWiring.test.js \
  test/runtimeSettingsHydrationBindingWiring.test.js \
  test/runtimeSettingsKeyCoverageMatrix.test.js \
  test/runtimeRunPayloadBaselineWiring.test.js \
  test/runtimeAutosavePayloadBaselineWiring.test.js \
  test/runtimeSettingsAutosaveFlushOnUnmount.test.js \
  test/settingsEndpointAuthorityOwnershipMatrix.test.js \
  test/settingsCacheReadAuthorityOwnership.test.js \
  test/runtimeSettingsDomainExtractionWiring.test.js \
  test/runtimeSettingsSerializerParity.test.js \
  test/runtimeSettingsEditorAdapterParity.test.js
```

---

## Phase 02 Checklist
- [ ] Runtime domain helpers extracted from page-local code.
- [ ] Runtime editor adapter implemented and wired.
- [ ] `IndexingPage` migrated to extracted domain utilities.
- [ ] Key coverage and run payload parity confirmed.
- [ ] New extraction parity tests added and green.

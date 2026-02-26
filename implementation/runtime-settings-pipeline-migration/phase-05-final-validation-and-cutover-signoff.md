# Phase 05 - Final Validation and Cutover Signoff

## Objective
Close the runtime-settings migration with a formal validation and signoff phase that proves:
- `Pipeline Settings` is the single runtime settings editor,
- user/session persistence behavior is stable,
- propagation and save-state truth contracts remain correct,
- and the migration is safe to build future phases on.

This phase is documentation + verification orchestration. It is not intended for new feature expansion.

## Why This Phase Exists
After the UI migration and overlap decommissioning, final risk shifts from implementation to release confidence:
- hidden overlap regressions may reappear,
- autosave/manual save truth can drift across surfaces,
- runtime key coverage can regress silently,
- and session behavior can break under category/reload/cross-tab changes.

Phase 05 creates a final audit gate so these regressions are blocked before follow-on work.

## Scope
1. Validate ownership and no-overlap contracts across runtime/convergence/source-strategy.
2. Validate persistence durability and hydration behavior for runtime flow controls.
3. Validate propagation/update reactivity across settings surfaces.
4. Validate UX contract requirements (tooltips, disable gray-out, ordered sidebar phases, reset defaults confirm).
5. Capture release evidence and unresolved debt list.

## Out of Scope
- Net-new runtime controls.
- New backend schema keys.
- Re-designing page layout/theming.
- Large refactors unrelated to runtime settings authority and migration closure.

## Canonical Source Map (Final Ownership)

### Runtime Settings
- Canonical writer surface: `Pipeline Settings` runtime flow card.
- Frontend writer authority: `useRuntimeSettingsAuthority`.
- Persistence target: canonical `user-settings.json` runtime section.
- Indexing Runtime panel role: read-only migration notice + telemetry context.

### Convergence Settings
- Canonical writer surface: `Pipeline Settings`.
- Frontend writer authority: `useConvergenceSettingsAuthority`.
- Indexing role: non-writer in migration-complete state.

### Source Strategy
- Canonical writer surface: `Pipeline Settings` (category-scoped only).
- Frontend writer authority: `useSourceStrategyAuthority`.

## Validation Matrix

### A) Ownership/No-overlap Contract
- Verify page surfaces do not directly call settings endpoints.
- Verify authority modules own route access.
- Verify Indexing Runtime panel cannot act as runtime settings editor.

Expected checks:
- settings endpoint ownership matrix tests
- phase-4 no-overlap wiring test

### B) Runtime Key Coverage and Payload Integrity
- Verify runtime payload includes all canonical keys.
- Verify no key loss across save/reload/rehydration.
- Verify run-start payload behavior remains stable against hydrated baseline.

Expected checks:
- runtime key coverage matrix
- runtime payload baseline wiring
- runtime authority wiring

### C) Persistence and Save-State Truth
- Verify save status precedence remains:
  - saving/loading
  - error/partial
  - dirty
  - clean
- Verify autosave debounce contract remains canonical.
- Verify manual save behavior still works when autosave is off.

Expected checks:
- save status parity/truth matrix tests
- autosave debounce contract tests

### D) UX Contract Compliance
- Verify runtime flow sidebar order maps to pipeline start-to-finish.
- Verify enabled-dot semantics:
  - green = enabled by master toggle
  - gray = disabled by dependency
- Verify disabled groups are grayed out and blocked.
- Verify every control label path has tooltip wiring.
- Verify reset defaults always requires explicit confirmation.

Expected checks:
- runtime flow wiring test
- targeted manual QA pass (desktop + mobile viewport)

### E) Session Persistence and Propagation
- Verify active runtime flow step persists for session.
- Verify saved changes survive reload and category swaps.
- Verify cross-surface updates use shared authority propagation paths.

Expected checks:
- runtime flow wiring + existing settings propagation suites

## Required Test Bundle (Phase Exit Gate)
Run this bundle before marking complete:

```bash
node --test --test-concurrency=1 \
  test/runtimeSettingsPipelineFlowWiring.test.js \
  test/runtimeSettingsIndexingNoOverlapPhase4Wiring.test.js \
  test/runtimeSettingsAuthorityWiring.test.js \
  test/runtimeSettingsKeyCoverageMatrix.test.js \
  test/runtimeRunPayloadBaselineWiring.test.js \
  test/runtimeAutosavePayloadBaselineWiring.test.js \
  test/settingsAuthorityMatrixWiring.test.js \
  test/settingsEndpointAuthorityOwnershipMatrix.test.js \
  test/settingsCacheReadAuthorityOwnership.test.js \
  test/settingsSaveStatusParityWiring.test.js \
  test/settingsSaveStatusTruthMatrixWiring.test.js \
  test/settingsPropagationContractWiring.test.js
```

And perform GUI compile check:

```bash
npm --prefix tools/gui-react run build
```

## Evidence Capture Requirements
Capture all of the following in closure notes:
1. Command list executed.
2. Pass/fail counts.
3. Files changed.
4. Any non-blocking warnings observed during build/tests.
5. Deferred items explicitly tagged for post-migration backlog.

## Risk Register and Mitigations

### Risk 1: Hidden runtime writer reintroduced in Indexing
- Mitigation: no-overlap wiring tests + endpoint ownership matrix.

### Risk 2: Runtime key drift in future edits
- Mitigation: key-coverage matrix test in phase-exit bundle.

### Risk 3: Save-state UI lying about persistence outcomes
- Mitigation: save-status truth tests enforced before signoff.

### Risk 4: Session behavior regression in active step persistence
- Mitigation: persisted-tab wiring assertions + manual reload/category QA.

## Deliverables
1. This phase document.
2. Final test/build evidence capture.
3. Final migration closure note (ownership confirmed + no-overlap confirmed).
4. Post-migration debt list (if any) separated from blocking criteria.

## Definition of Done
- All phase-exit tests pass.
- GUI build succeeds.
- Ownership matrix confirms single runtime writer surface.
- Indexing runtime editor overlap is decommissioned.
- UX contract for runtime flow is validated (tooltips, ordering, gray-out, reset confirm).
- Evidence package is recorded and phase marked complete.

---

## Phase 05 Checklist
- [ ] Ownership/no-overlap validation complete.
- [ ] Runtime key coverage and payload parity validated.
- [ ] Save-state truth and autosave contracts validated.
- [ ] Runtime flow UX contract validated.
- [ ] Session persistence + propagation validation complete.
- [ ] Evidence capture completed and archived.
- [ ] Migration signoff recorded.

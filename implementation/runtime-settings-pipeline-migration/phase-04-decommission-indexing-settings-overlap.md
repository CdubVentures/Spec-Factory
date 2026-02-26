# Phase 04 - Decommission Indexing Settings Overlap

## Objective
Remove runtime/convergence settings overlap from Indexing Lab by hard-locking the Indexing Runtime panel to read-only mode and keeping `Pipeline Settings` as the single editing surface.

## User-Facing Contract
- Indexing Runtime panel remains visible for run-context orientation and runtime telemetry.
- Indexing Runtime panel no longer acts as a settings editor.
- Runtime/convergence settings editing is done in `Pipeline Settings` only.
- Migration notice is shown directly in Indexing Runtime panel so ownership is clear.

## Scope
- Lock Runtime panel editor path in:
  - `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx`
- Preserve existing run control and run payload wiring in:
  - `tools/gui-react/src/pages/indexing/IndexingPage.tsx`
- Add wiring regression for phase-4 overlap guard:
  - `test/runtimeSettingsIndexingNoOverlapPhase4Wiring.test.js`

## Detailed Implementation
1. Add a phase-4 guard (`runtimeSettingsEditorMovedToPipeline`) in `RuntimePanel`.
2. Early-return a read-only panel shell with:
  - panel header/toggle
  - runtime activity gauge
  - explicit migration no-overlap notice
3. Keep the underlying runtime authority/run payload plumbing in `IndexingPage` untouched to avoid run-start regressions in this phase.
4. Ensure Pipeline Settings continues to render `RuntimeSettingsFlowCard` as canonical editor.

## Exit Criteria
- Indexing no longer provides active runtime/convergence settings editing controls.
- Pipeline Settings remains canonical editor for runtime settings.
- No-overlap guard is regression-covered by test.
- Existing authority ownership/wiring suites remain green.

## Evidence Capture
- Files changed
- Test commands and pass counts
- Follow-up debt for full dead-code removal (Phase 05)

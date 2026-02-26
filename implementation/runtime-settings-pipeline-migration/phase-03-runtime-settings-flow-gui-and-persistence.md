# Phase 03 - Runtime Settings Flow GUI in Pipeline Settings

## Objective
Implement the runtime settings editor in `Pipeline Settings` as a pipeline-ordered flow UI that is fully wired to canonical runtime settings authority, autosave/manual-save behavior, and session-persisted UI state.

## User-Facing Contract
- Runtime settings are editable in a dedicated flow card under `Pipeline Settings`.
- Step navigation follows execution order from run start to fallback routing.
- Sidebar dot semantics:
  - Green dot = step enabled by current master toggles.
  - Gray dot = step disabled by master toggle dependency.
- Disabled step controls are visibly grayed out and non-interactive.
- Every setting control has tooltip help text.
- Runtime flow card does **not** include:
  - search/filter input,
  - tracker/progress widgets,
  - concept-only config header widgets.
- Includes `Reset All Defaults` with explicit confirmation prompt.

## Scope
- Add new runtime flow component:
  - `tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx`
- Wire it into:
  - `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx`
- Reuse existing authority + persistence contracts:
  - `useRuntimeSettingsAuthority`
  - `readRuntimeSettingsBootstrap`
  - `useUiStore` runtime autosave toggle
  - `useSettingsAuthorityStore` readiness gating
  - `usePersistedTab` for per-session active step retention

## Detailed Work Breakdown

### 1. Runtime Flow UI Structure
- Build a two-pane layout:
  - Left: step list (phase labels, status dots, tooltips).
  - Right: active step controls.
- Steps:
  1. Run Setup
  2. Fetch and Render
  3. OCR
  4. Planner and Triage
  5. Role Routing
  6. Fallback Routing

### 2. Settings Authority and Persistence Wiring
- Initialize state from runtime bootstrap snapshot.
- Normalize all loaded values against runtime defaults + allowed enums/bounds.
- Build canonical runtime payload from local draft.
- Persist only through `useRuntimeSettingsAuthority` (`/runtime-settings` via authority).
- Keep save status truth precedence:
  - saving -> loading -> error/partial -> dirty -> clean.

### 3. Master Toggle Dependency Rules
- Discovery off disables:
  - search provider
  - planner and triage controls
- Dynamic Crawlee off disables dynamic fetch sub-controls.
- OCR off disables OCR sub-controls.
- Fallback off disables fallback route controls.
- Re-extract off disables re-extract age threshold.

### 4. Session and Autosave Behavior
- Persist active runtime flow step in session storage (`usePersistedTab`).
- Expose autosave toggle (`runtimeAutoSaveEnabled`) and respect global debounce contract.
- Keep manual save button visible only when autosave is off.

### 5. Reset Defaults Contract
- Add `Reset All Defaults` action.
- Require confirm prompt before applying defaults.
- Reset applies canonical runtime default manifest values.
- Mark draft dirty so save/autosave propagates through authority.

## Exit Criteria
- Runtime flow UI is rendered in `Pipeline Settings`.
- All runtime controls are authority-wired and persist to canonical store.
- Session restores the last active runtime step.
- Master-toggle disabling and gray-out behavior is correct.
- Tooltips are present for every control.
- Reset defaults prompt and behavior are working.

## Evidence Capture
- Files changed
- Test commands run
- Test pass/fail counts
- Any deferred runtime-control de-duplication work assigned to Phase 04

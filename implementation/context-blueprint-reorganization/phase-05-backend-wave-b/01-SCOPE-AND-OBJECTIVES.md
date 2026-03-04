# Phase 05 Scope and Objectives

## Phase Objective

Decompose high-coupling backend orchestration paths (especially pipeline/runtime hotspots) into bounded feature and app-layer seams without behavioral drift.

## In Scope

- `runProduct`/runtime orchestration seam mapping and extraction planning for bounded modules.
- Settings-authority internal relocation seam from Wave A (`WA-A-SET-02`) under feature ownership with compatibility facades.
- Residual composition-root backend seam cleanup planning for `src/cli/spec.js` and `src/api/guiServer.js`.
- Wave B seam registry, characterization test plan, and risk controls for these hotspots.

## Out of Scope

- Frontend feature slicing work (`phase-06-frontend-feature-slicing`).
- Hard architecture enforcement cutover (`phase-07-enforcement-and-cutover`).
- Uncharacterized API or payload behavior changes outside explicit Wave B slices.

## Success Conditions

1. Wave B hotspot inventory and seam ownership are explicitly documented.
2. Incremental extraction slices preserve behavior through focused characterization suites.
3. Legacy compatibility facades are retained where consumers still depend on legacy paths.
4. Full repository regression (`npm test`) remains green before progress/completion reporting.

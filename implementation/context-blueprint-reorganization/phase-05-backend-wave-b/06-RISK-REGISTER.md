# Phase 05 Risk Register

## R1 - runProduct Decomposition Drift

- Risk: extraction mixes behavior changes with structural moves in `src/pipeline/runProduct.js`.
- Impact: runtime regressions with broad blast radius.
- Mitigation: keep slices bounded, preserve behavior, and gate each move with runtime characterization suites.

## R2 - Settings Facade Breakage During Internal Relocation

- Risk: relocating settings internals breaks legacy import paths still used by downstream consumers.
- Impact: runtime import failures and settings persistence regressions.
- Mitigation: preserve legacy facades until downstream migration completion; track seam ownership in adapter registry.

## R3 - Residual Composition Coupling Persists

- Risk: `src/cli/spec.js` and `src/api/guiServer.js` retain deep cross-context imports after Wave B moves.
- Impact: phase progression stalls and boundary rules remain unenforced.
- Mitigation: enforce adapter-first rewires and add wiring assertions for composition root consumers.

## R4 - Characterization Coverage Gaps on Hotspot Slices

- Risk: hotspot extraction lands without targeted parity evidence.
- Impact: regressions discovered late in Phase 06/07.
- Mitigation: maintain per-slice focused test matrix in `05-CHARACTERIZATION-TEST-PLAN.md` plus mandatory full `npm test` before report.

## Exception Log

Use this format:

- Date:
- Seam or rule exception:
- Owner:
- Legacy path:
- Replacement contract:
- Expiry phase:
- Tests run:
- Rollback or cleanup task:

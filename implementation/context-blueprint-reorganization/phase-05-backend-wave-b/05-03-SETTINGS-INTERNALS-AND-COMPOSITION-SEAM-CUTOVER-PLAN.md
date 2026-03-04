# 05-03 Settings Internals and Composition Seam Cutover Plan

## Status

- Task ID: `05-03`
- State: `PENDING`
- Owner: `Architecture Reorganization Track`

## Objective

Land Wave B relocation of settings-authority internals and close remaining backend composition-root deep-import seams through feature/app adapters.

## Planned Outputs

1. Settings internals relocation under `src/features/settings-authority/*` with legacy facade safety.
2. Residual backend composition seam rewires for `src/cli/spec.js` and `src/api/guiServer.js`.
3. Characterization updates covering settings/runtime and composition wiring parity.

## Entry Preconditions

- `05-02` completed.

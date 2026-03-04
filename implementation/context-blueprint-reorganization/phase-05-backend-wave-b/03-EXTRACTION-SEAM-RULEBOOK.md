# Phase 05 Extraction Seam Rulebook

## Rule 1 - Hotspot Decomposition Must Stay Bounded

- Slice only one seam family at a time from hotspot files.
- Every extracted seam must have explicit owner and expiry metadata in `04-ADAPTER-REGISTRY.md`.

## Rule 2 - Behavior-First Preservation

- Wave B focuses on ownership and decomposition, not semantic changes.
- Any runtime payload, API, or command behavior changes require explicit characterization coverage.

## Rule 3 - Compatibility Facades Are Required During Relocation

- Legacy module paths remain stable while internals are moved.
- Facades are removed only in an explicitly tracked cleanup slice.

## Rule 4 - Composition Roots Continue to Thin

- `src/cli/spec.js` and `src/api/guiServer.js` may only gain adapter wiring, not new deep domain dependencies.
- New backend consumer imports should target feature entrypoints or app-layer adapters.

## Rule 5 - Test Gating Per Slice

- Run focused suites for each landed slice before proceeding.
- Run full repository regression (`npm test`) before reporting progress/completion.

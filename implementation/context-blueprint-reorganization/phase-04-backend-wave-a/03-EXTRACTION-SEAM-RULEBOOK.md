# Phase 04 Extraction Seam Rulebook

## Rule 1 - Contract-First Consumer Cutover

- Route/composition consumers move to feature entrypoints first.
- Legacy service modules remain active as compatibility sources until full relocation is complete.

## Rule 2 - No Behavioral Drift in Wave A

- Wave A slices are wiring and ownership moves only.
- Any payload shape or route semantics change is deferred unless explicitly scoped and characterized.

## Rule 3 - Compatibility Facades Are Mandatory

- If internals are relocated, legacy import paths must retain stable exports until cleanup phase.
- Facades must be traceable in `04-ADAPTER-REGISTRY.md` with owner and expiry phase.

## Rule 4 - Test Gating per Slice

- Every landed slice requires focused characterization runs tied to affected contexts.
- Before reporting progress, run full repository regression (`npm test`) per reporting quality gate.

## Rule 5 - Import Direction

- Import direction remains:
  - `app/api` and route modules -> `src/features/*/index.js` contracts
  - no new direct cross-feature deep imports.

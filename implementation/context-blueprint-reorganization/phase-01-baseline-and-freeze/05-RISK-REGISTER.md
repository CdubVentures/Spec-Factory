# Phase 01 Risk Register

## R1 - Freeze Erosion

- Risk: feature pressure bypasses freeze.
- Impact: baseline invalidated before contract phase.
- Mitigation: enforce exception template and test evidence requirement.

## R2 - Hidden Cross-Feature Coupling

- Risk: implicit imports remain undiscovered.
- Impact: Phase 02 contracts miss real dependencies.
- Mitigation: run coupling scans and maintain hotspot backlog.

## R3 - Monolith-to-Monolith Migration

- Risk: decomposition creates new large modules under new names.
- Impact: no real maintainability gain.
- Mitigation: set size and fan-out thresholds per extracted module.

## R4 - Test Blind Spots

- Risk: extraction occurs without characterization coverage.
- Impact: silent behavior drift.
- Mitigation: enforce RED-first characterization tests before moves.

## R5 - Settings/Data Authority Regression

- Risk: authority and propagation behavior regresses during file movement.
- Impact: stale UI state, persistence mismatches, propagation failures.
- Mitigation: run targeted authority/propagation suites at each boundary move.

## R6 - Frontend UX Drift During Re-slicing

- Risk: tab/grouping/state UX becomes inconsistent.
- Impact: operator friction and trust loss.
- Mitigation: add wiring tests for nav order/grouping and persistence behavior.

## Exception Log

Use this format:

- Date:
- Change:
- Justification:
- Scope:
- Tests run:
- Follow-up cleanup task:

## Exception Workflow Dry-Run (Phase 01)

Dry-run date: 2026-02-26

- Scenario: urgent nav grouping correction while freeze is active.
- Requested change: reorder header tabs to enforce `Overview + Selected Product`, then `Categories + Catalog`, with dividers.
- Assessment:
  - Feature scope: UI navigation structure only.
  - Contract impact: none (route paths unchanged).
  - Coupling risk: low.
- Evidence captured:
  - Wiring test added: `test/tabNavGroupingWiring.test.js`
  - Validation run: `node --test test/tabNavGroupingWiring.test.js` passing.
- Decision: allowed as freeze-compatible corrective change.
- Follow-up: keep nav grouping reflected in target hierarchy docs and AGENTS active plan notes.

# Phase 02 Risk Register

## R1 - Ambiguous Ownership Persistence

- Risk: legacy modules remain unassigned to a context.
- Impact: extraction work reintroduces mixed-responsibility modules.
- Mitigation: enforce ownership assignment in `02-CONTEXT-OWNERSHIP-MATRIX.md` before extraction.

## R2 - Adapter Sprawl

- Risk: temporary adapters become permanent architecture debt.
- Impact: hidden coupling remains after migration.
- Mitigation: every adapter carries expiry phase and replacement contract path.

## R3 - Boundary Guard False Positives

- Risk: warn-mode tests produce noisy output and get ignored.
- Impact: real violations are missed.
- Mitigation: maintain explicit allowlist/exception registry with owner and expiry.

## R4 - Runtime-Intelligence Boundary Drift

- Risk: `indexing-lab` and `runtime-ops` duplicate or cross-wire logic without shared contract.
- Impact: inconsistent runtime behavior and duplicated fixes.
- Mitigation: keep shared logic in `runtime-intelligence/shared` and consume via feature contract only.

## R5 - Settings Contract Cross-Surface Regression

- Risk: settings consumers bypass `settings-authority` contract during extraction.
- Impact: persistence/propagation inconsistencies across tabs.
- Mitigation: enforce settings-authority contract path and run targeted settings matrix suites.

## R6 - Over-Broad Public Contracts

- Risk: feature contracts expose raw internals or too many unstable methods.
- Impact: downstream coupling increases and refactor cost rises.
- Mitigation: capability-based contract design and boundary test assertions on contract imports.

## Exception Log

Use this format:

- Date:
- Rule exception:
- Context owner:
- Legacy path:
- Replacement contract:
- Expiry phase:
- Tests run:
- Rollback or cleanup task:

## Active Adapter Exceptions (Phase 02)

No approved boundary-rule exceptions yet.

Baseline transitional adapter seams are tracked as planned seams in:

- `02-02-BOUNDARY-RULE-CODIFICATION-AND-DEPENDENCY-DIRECTION-MAP.md`
- `03-BOUNDARY-RULEBOOK.md`

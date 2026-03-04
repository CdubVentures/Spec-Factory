# Context Blueprint Reorganization

## Purpose

Pause net-new feature work and reorganize the app around clear vertical feature boundaries, shared core contracts, and infrastructure adapters.

## Phase Map

1. `phase-01-baseline-and-freeze`
2. `phase-02-context-contracts`
3. `phase-03-composition-root-split`
4. `phase-04-backend-wave-a`
5. `phase-05-backend-wave-b`
6. `phase-06-frontend-feature-slicing`
7. `phase-07-enforcement-and-cutover`

## Phase Gate Policy

- Phase 01 is a hard prerequisite for the full track.
- No execution in Phases 02-07 is considered valid unless Phase 01 exit gates are complete and documented in:
  - `phase-01-baseline-and-freeze/07-EXIT-GATES-AND-HANDOFF.md`
  - `phase-01-baseline-and-freeze/AUDIT-SIGNOFF.md`
- Full sequential policy is defined in:
  - `SEQUENTIAL-EXECUTION-POLICY.md`
- Audit approvals in this track are internal engineering checkpoints.
- Any emergency exception must be logged in:
  - `phase-01-baseline-and-freeze/05-RISK-REGISTER.md`

## Global Success Criteria

- Clear feature ownership boundaries across backend and frontend.
- No direct cross-feature internal imports.
- Shared code isolated to `shared-core` and `infrastructure`.
- Existing behavior preserved through incremental, test-gated migration.

## Current Track Status

- `phase-01-baseline-and-freeze`: `COMPLETED` (internal audit checkpoint approved)
- `phase-02-context-contracts`: `COMPLETED` (internal audit checkpoint approved)
- `phase-03-composition-root-split`: `COMPLETED` (internal audit checkpoint approved on 2026-03-02; Phase 04 handoff packet active)
- `phase-04-backend-wave-a`: `COMPLETED` (internal audit checkpoint approved on 2026-03-02; Phase 05 handoff packet active)
- `phase-05-backend-wave-b`: `STARTED` (entered on 2026-03-02; `05-01` and `05-02` completed, `05-03` next)

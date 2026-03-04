# Phase 01 Scope and Objectives

## Scope

- Backend structure baseline under `src/`.
- Frontend structure baseline under `tools/gui-react/src/`.
- Test-suite baseline under `test/`.
- Architecture coupling and hotspot detection for:
  - CLI and API composition roots
  - Pipeline orchestration
  - Frontend page/store boundaries
  - Data/settings authority boundaries

## Out of Scope

- Functional behavior changes.
- Route contract changes.
- New feature development.
- UI redesign unrelated to hierarchy grouping.

## Objectives

1. Freeze high-risk architecture surfaces from net-new feature expansion.
2. Capture reproducible baseline metrics for code volume and coupling.
3. Define prioritized extraction backlog with objective criteria.
4. Define migration safety constraints and rollback path.
5. Produce Phase 02 handoff package with clear entry conditions.

## Deliverables

- Baseline snapshot with reproducibility commands.
- Freeze policy with allowed and blocked change types.
- Hotspot backlog ranked by coupling and size.
- Risk register with mitigation and fallback.
- Exit gates and handoff checklist.

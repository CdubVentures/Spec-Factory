# Phase 03 - Composition Root Split

## Goal

Separate bootstrapping/orchestration entrypoints from domain logic.

## Entry Gate

- Phase 02 contracts and boundary rules must be published.
- Phase 01 baseline remains the measurement reference.
- `phase-02-context-contracts/AUDIT-SIGNOFF.md` must be marked approved (internal audit checkpoint).

## Summary

- Split CLI and API server composition roots from feature implementations.
- Keep route/command signatures stable while moving wiring logic.
- Introduce adapter layers so existing flows continue to run unchanged.
- Preserve behavior with characterization tests around entrypoints.

## Exit Criteria

- Composition roots are thin and focused on wiring.
- Domain behavior is delegated to feature modules.
- Existing CLI/API flows pass regression tests.

## Status

- `COMPLETED` (internal audit checkpoint approved on 2026-03-02)
- Implementation progress: `CLI-S1`, `API-S1`, `API-S2`, continued `API-S3` extraction, `API-S4`, and `API-S5` websocket/watcher extraction landed; Phase 04 handoff unblocked.

## Full Plan Package

- `00-INDEX.md`
- `01-SCOPE-AND-OBJECTIVES.md`
- `03-01-COMPOSITION-ROOT-INVENTORY-AND-SPLIT-SEAM-MAP.md`
- `03-02-CLI-COMPOSITION-ROOT-THINNING-PLAN.md`
- `03-03-API-COMPOSITION-ROOT-THINNING-PLAN.md`
- `03-04-CHARACTERIZATION-GUARDRAIL-AND-PHASE-04-HANDOFF.md`
- `02-COMPOSITION-ROOT-INVENTORY.md`
- `03-DELEGATION-SEAM-RULEBOOK.md`
- `04-ADAPTER-REGISTRY.md`
- `05-ENTRYPOINT-CHARACTERIZATION-TEST-PLAN.md`
- `06-RISK-REGISTER.md`
- `07-EXECUTION-CHECKLIST.md`
- `08-EXIT-GATES-AND-HANDOFF.md`
- `AUDIT-SIGNOFF.md`

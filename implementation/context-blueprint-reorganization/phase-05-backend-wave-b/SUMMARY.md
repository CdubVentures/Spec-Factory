# Phase 05 - Backend Migration Wave B

## Goal

Decompose high-coupling orchestration and pipeline hotspots.

## Entry Gate

- Phase 04 backend wave A must be complete.
- `phase-04-backend-wave-a/AUDIT-SIGNOFF.md` must be marked approved (internal audit checkpoint).
- Phase 01 freeze policy and exception controls remain active.

## Summary

- Extract `runProduct` and related pipeline helpers into bounded modules.
- Isolate retrieval, extraction, scoring, and runtime policy concerns.
- Move shared primitives to `shared-core` only when truly cross-context.
- Execute incremental extraction with test gates after each move.

## Exit Criteria

- Major backend hotspot files are reduced in scope and fan-out.
- Pipeline behavior parity is confirmed by regression coverage.
- Context boundaries hold for migrated orchestration paths.

## Status

- `STARTED` (entry gate satisfied by Phase 04 audit approval on 2026-03-02; `05-01` and `05-02` completed on 2026-03-02)
- Latest landed slice: first runProduct orchestration seam extraction (`src/pipeline/helpers/runProductOrchestrationHelpers.js`).
- Latest full quality gate: `npm test` (`3354/3354` passing; `210` suites).
- Next in-order action: `05-03` settings internals and composition seam cutover plan.

## Full Plan Package

- `SUMMARY.md`
- `00-INDEX.md`
- `01-SCOPE-AND-OBJECTIVES.md`
- `05-01-BACKEND-WAVE-B-KICKOFF-AND-HOTSPOT-SEAM-SEED.md`
- `05-02-RUNPRODUCT-ORCHESTRATION-SEAM-EXTRACTION-PLAN.md`
- `05-03-SETTINGS-INTERNALS-AND-COMPOSITION-SEAM-CUTOVER-PLAN.md`
- `05-04-WAVE-B-GUARDRAIL-AND-PHASE-06-HANDOFF.md`
- `02-BACKEND-HOTSPOT-INVENTORY.md`
- `03-EXTRACTION-SEAM-RULEBOOK.md`
- `04-ADAPTER-REGISTRY.md`
- `05-CHARACTERIZATION-TEST-PLAN.md`
- `06-RISK-REGISTER.md`
- `07-EXECUTION-CHECKLIST.md`
- `08-EXIT-GATES-AND-HANDOFF.md`
- `AUDIT-SIGNOFF.md`

# Phase 02 - Context Contracts

## Goal

Publish explicit bounded-context ownership, dependency boundaries, and public contract seams before structural extraction starts.

## Entry Gate

- Phase 01 exit gates must be complete and signed off before starting.
- `phase-01-baseline-and-freeze/AUDIT-SIGNOFF.md` must be marked approved (internal audit checkpoint).

## Summary

- Lock ownership for backend and frontend feature contexts.
- Codify boundary rules (`allowed`, `forbidden`, `requires-adapter`) with dependency direction.
- Define public contract entrypoints for each context (`index.js` / `index.ts`).
- Map architecture boundary tests (warn mode in Phase 02; blocking later in Phase 07).
- Deliver a handoff packet that unblocks Phase 03 composition-root split.

## Exit Criteria

- Context ownership matrix is approved and linked.
- Boundary rulebook is published and cross-referenced by work items.
- Contract entrypoint inventory exists for all contexts.
- Architecture test plan is defined for backend and frontend import guards.
- Risk register and execution checklist are complete.
- `AUDIT-SIGNOFF.md` is marked `APPROVED` (internal audit checkpoint).

## Status

- `COMPLETED` (internal audit checkpoint approved on 2026-02-26)

## Full Plan Package

- `00-INDEX.md`
- `01-SCOPE-AND-OBJECTIVES.md`
- `02-01-CONTEXT-OWNERSHIP-MATRIX-AND-CONTRACT-BOUNDARY-SEED.md`
- `02-02-BOUNDARY-RULE-CODIFICATION-AND-DEPENDENCY-DIRECTION-MAP.md`
- `02-03-PUBLIC-CONTRACT-ENTRYPOINT-SPEC-AND-ADAPTER-PLAN.md`
- `02-04-ARCHITECTURE-GUARDRAIL-SPEC-AND-PHASE-03-HANDOFF-PACKET.md`
- `02-CONTEXT-OWNERSHIP-MATRIX.md`
- `03-BOUNDARY-RULEBOOK.md`
- `04-CONTRACT-ENTRYPOINT-INVENTORY.md`
- `05-ARCHITECTURE-TEST-PLAN.md`
- `06-RISK-REGISTER.md`
- `07-EXECUTION-CHECKLIST.md`
- `08-EXIT-GATES-AND-HANDOFF.md`
- `AUDIT-SIGNOFF.md`

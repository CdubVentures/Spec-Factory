# Pipeline — Orchestration

## Purpose

Thin sequential orchestrator wiring all 8 pipeline phases with checkpoint validation. Owns sequencing only — no business logic.

## Public API (The Contract)

Exports from `index.js`:

- `runDiscoverySeedPlan(ctx)` — full pipeline entry point, wires all 8 phases sequentially
- `buildDiscoverySeedPlanContext(options)` — constructs the initial pipeline context object
- `validatePipelineCheckpoint(ctx, checkpoint)` — Zod validation at checkpoint boundaries

## Dependencies

- **Allowed:** All pipeline phase folders (imports stage functions as DI defaults), `pipeline/shared/`, `src/indexlab/`, `src/utils/`, `src/shared/`, `src/features/indexing/search/`
- **Forbidden:** Other feature folders

## Domain Invariants

- Orchestrator owns sequencing only — zero business logic in this module.
- NeedSet + Brand Resolver run in parallel via `Promise.all`.
- Schema validation via Zod at every checkpoint boundary (enforcement mode governed by `pipelineSchemaEnforcementMode` registry setting).
- Phase functions are injected as DI defaults — testable in isolation.
- Orchestrator must never mutate phase outputs — fresh merge only.

# Pipeline

## Purpose

8-phase discovery pipeline for product research. Each phase is a vertical domain slice with named responsibilities, orchestrated sequentially with parallel entry points (NeedSet + Brand Resolver).

## Public API (The Contract)

Exports from `pipeline/index.js`:

- `runDiscoverySeedPlan(ctx)` — full pipeline orchestration entry point
- `buildDiscoverySeedPlanContext(options)` — constructs the initial pipeline context
- All shared utility re-exports from `pipeline/shared/`

## Dependencies

- **Allowed:** `src/core/`, `src/shared/`, `src/indexlab/`, `src/research/`, `src/features/indexing/search/`, `src/categories/`, `src/utils/`, `src/planner/`, `src/s3/`, `src/intel/`
- **Forbidden:** Other feature folders

## Domain Invariants

- Phases are self-contained vertical slices — each phase owns its own logic, adapters, and transforms.
- Cross-phase access goes through `pipeline/shared/` only.
- No circular dependencies between phases.
- Orchestrator owns sequencing; phases own domain logic.
- Pipeline context is validated via Zod at checkpoint boundaries.

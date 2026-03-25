# Pipeline — Shared

## Purpose

Cross-phase pure utilities shared by two or more pipeline phases. Provides host parsing, source registry, core/deep gates, query index, and prompt index.

## Public API (The Contract)

Re-exports from `shared/index.js`:

- Host parsing utilities (domain extraction, normalization)
- Source registry (approved domain lookups, source type classification)
- Core/deep gate functions (tier-aware filtering)
- Query index (deduplication, ranking helpers)
- Prompt index (LLM prompt templates for pipeline phases)
- `createPhaseCallLlm` — generic factory for pipeline phase LLM call adapters (used by 4 phases)

## Dependencies

- **Allowed:** `src/utils/`, `src/categories/`, `src/s3/`, `zod`
- **Forbidden:** Pipeline phase folders, `src/features/`

## Domain Invariants

- All functions must be pure — zero module state, no side effects.
- Identity utilities (host parsing, normalization) have zero internal imports.
- Shared must never import from any pipeline phase folder.
- Adding a utility here requires proof it is used by 2+ phases.

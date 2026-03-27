# Pipeline — Search Profile

## Purpose

Deterministic query generation from focus groups and brand resolution. Convergence point requiring both NeedSet and Brand Resolver outputs before proceeding.

## Public API (The Contract)

Exports from `index.js`:

- `runSearchProfile(ctx)` — generates query rows from focus groups + brand domain

## Dependencies

- **Allowed:** `pipeline/shared/`, `src/features/indexing/pipeline/searchProfile/queryBuilder.js`, `src/shared/settingsAccessor.js`
- **Forbidden:** Other pipeline phase folders

## Domain Invariants

- Fully deterministic — zero LLM calls.
- First phase requiring both NeedSet and Brand Resolver outputs (convergence point).
- Source-first design: queries are organized by source type, not by field.
- Registry settings act as hints, not hard gates.

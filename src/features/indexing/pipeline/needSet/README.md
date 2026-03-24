# Pipeline — NeedSet

## Purpose

Computes field assessment and search planning context via LLM. First pipeline phase, running in parallel with Brand Resolver.

## Public API (The Contract)

Exports from `index.js`:

- `runNeedSet(ctx)` — executes field assessment LLM call, returns `needset_assessment` and `search_plan` scopes

## Dependencies

- **Allowed:** `pipeline/shared/`, `src/indexlab/` (NeedSet engine, search plan builder)
- **Forbidden:** Other pipeline phase folders

## Domain Invariants

- NeedSet runs in parallel with Brand Resolver — must never depend on brand output.
- Emits `needset_computed` event with `needset_assessment` and `search_plan` scopes.
- LLM failure must not crash the pipeline — fallback to GROUP_DEFAULTS until upstream category contract provides the data.

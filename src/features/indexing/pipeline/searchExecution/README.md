# Pipeline — Search Execution

## Purpose

Execute approved queries against search providers (Google, SearXNG, internal corpus). Strict sequential execution with drain timeout.

## Public API (The Contract)

Exports from `index.js`:

- `executeSearchQueries(ctx)` — runs approved queries sequentially against configured providers

## Dependencies

- **Allowed:** `pipeline/shared/`, `src/features/indexing/search/searchProviders.js`, `src/intel/sourceCorpus.js`, `src/core/config/`
- **Forbidden:** Other pipeline phase folders

## Domain Invariants

- Strict sequential execution — `queryConcurrency` is 1.
- Respects `fetchDrainTimeoutMs` registry setting (default 120s).
- Timeout emits `fetch_drain_timeout` event with URL accounting.
- Provider selection is config-driven, not hardcoded.

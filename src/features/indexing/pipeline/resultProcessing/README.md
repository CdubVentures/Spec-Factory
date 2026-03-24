# Pipeline — Result Processing

## Purpose

Post-search SERP triage — classify, select, and enrich candidate URLs from search results.

## Public API (The Contract)

Exports from `index.js`:

- `processDiscoveryResults(ctx)` — main entry point for SERP triage
- `buildDiscoveryResultTrace(results)` — trace builder for debugging
- `classifyDiscoveryResults(results)` — URL classifier
- `buildDiscoveryResultPayload(results)` — payload builder
- `selectSerpResults(results)` — LLM-based SERP selector
- `applyHardDropFilter(results)` — hard-drop URL filter
- `auditRejections(results)` — reject auditor

## Dependencies

- **Allowed:** `pipeline/shared/`, `src/core/llm/`, `src/categories/`, `src/s3/`, `src/shared/`
- **Forbidden:** Other pipeline phase folders

## Domain Invariants

- LLM selector is the ONLY triage path — no deterministic fallback for selection.
- Domain classification runs AFTER SERP selector, not before.
- `candidates[]` refers to the selected set, not all survivors.
- Stage has limited rejects — code and tests are truth over docs.

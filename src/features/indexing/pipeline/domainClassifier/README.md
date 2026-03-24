# Pipeline — Domain Classifier

## Purpose

Enqueue approved URLs into the source planner for downstream crawling. Final classification step before handoff to the crawl pipeline.

## Public API (The Contract)

Exports from `index.js`:

- `runDomainClassifier(ctx)` — classifies and enqueues approved URLs into source planner

## Dependencies

- **Allowed:** `pipeline/shared/`, `src/planner/sourcePlannerUrlUtils.js`, `src/shared/settingsAccessor.js`
- **Forbidden:** Other pipeline phase folders

## Domain Invariants

- Must not mutate `discoveryResult` — reads only.
- Classification is deterministic — no LLM calls.
- URL enqueue respects source planner constraints and approved domain lists.

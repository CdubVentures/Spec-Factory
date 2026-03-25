# Pipeline — Result Processing

## Purpose

Post-search SERP triage — classify, select, and enrich candidate URLs from search results.

## Public API (The Contract)

Exports from `index.js`:

- `processDiscoveryResults(ctx)` — main entry point for SERP triage
- `createCandidateTraceMap()`, `enrichCandidateTraces()` — trace lifecycle
- `classifyAndDeduplicateCandidates()`, `classifyDomains()` — URL classification
- `buildSerpExplorer()`, `writeDiscoveryPayloads()` — payload assembly
- `buildSerpSelectorInput()`, `validateSelectorOutput()`, `adaptSerpSelectorOutput()` — SERP selector
- `createSerpSelectorCallLlm()` — LLM call factory
- `applyHardDropFilter()` — hard-drop URL filter
- `sampleRejectAudit()`, `buildAuditTrail()` — reject auditor

## Dependencies

- **Allowed:** `pipeline/shared/`, `src/core/llm/`, `src/categories/`, `src/s3/`, `src/shared/`
- **Forbidden:** Other pipeline phase folders

## Domain Invariants

- LLM selector is the primary triage path; passthrough fallback activates on LLM failure.
- Domain classification runs AFTER SERP selector, not before.
- `candidates[]` refers to the selected set, not all survivors.
- Stage has limited rejects — code and tests are truth over docs.

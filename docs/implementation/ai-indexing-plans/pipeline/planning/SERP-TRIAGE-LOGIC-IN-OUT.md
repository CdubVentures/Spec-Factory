# SERP Triage Logic In And Out

Validated against live code on 2026-03-23. P3 decomposition complete — orchestrator split into 4 files. P6 re-audit: discoveryResult field names corrected (selectedUrls, allCandidateUrls).

## What this phase is

Result Processing is the Result Processing phase post-search selection boundary inside `processDiscoveryResults()`. It turns raw result rows into selected discovery candidates, approved/candidate URL lists, the executed `search_profile`, and the persisted discovery payloads.

Primary owners:

- `src/features/indexing/pipeline/resultProcessing/processDiscoveryResults.js` — orchestrator (344 LOC, sequencing only)
- `src/features/indexing/pipeline/resultProcessing/resultTraceBuilder.js` — trace lifecycle (creation + enrichment)
- `src/features/indexing/pipeline/resultProcessing/resultClassifier.js` — URL classification + domain heuristics
- `src/features/indexing/pipeline/resultProcessing/resultPayloadBuilder.js` — SERP explorer + storage payloads
- `src/features/indexing/discovery/triageHardDropFilter.js`
- `src/features/indexing/discovery/triageRejectAuditor.js`
- `src/features/indexing/pipeline/resultProcessing/serpSelector.js`
- `src/features/indexing/pipeline/resultProcessing/serpSelectorLlmAdapter.js`

## Schema files in this folder

There is no dedicated numbered JSON schema file just for Result Processing.

Coverage is split across:

- `05-execution-and-journey-contract.json`
- the executed `search_profile` artifact
- `_discovery/{category}/{runId}.json`
- `_sources/candidates/{category}/{runId}.json`

## Inputs in

`processDiscoveryResults()` consumes:

- `rawResults`
- `searchAttempts`
- `searchJournal`
- `internalSatisfied`
- `externalSearchReason`
- `variables`, `identityLock`, `brandResolution`
- `missingFields`
- `learning`
- `searchProfileBase`
- `searchProfilePlanned`
- `searchProfileKeys`
- `providerState`
- `queryConcurrency`
- `discoveryCap`
- optional SERP selector DI seams

## Live logic

The live triage flow is:

1. Create candidate trace map via `createCandidateTraceMap()` (in `resultTraceBuilder.js`).
2. Apply hard drops with `applyHardDropFilter()`.
3. Classify and deduplicate surviving URLs via `classifyAndDeduplicateCandidates()` (in `resultClassifier.js`).
4. Build selector input with `buildSerpSelectorInput()`.
5. Call the routed selector LLM — validate with `validateSelectorOutput()`, adapt with `adaptSerpSelectorOutput()`. On failure, treat as all-reject (no deterministic fallback path).
6. Build deterministic domain safety results via `classifyDomains()` (in `resultClassifier.js`) — runs AFTER the SERP selector (pipeline contract: SERP Selector then Domain Classifier).
7. Build reject-audit samples and audit trail.
8. Emit observability events (`serp_selector_completed` with full candidate funnel).
9. Enrich candidate traces with reason codes via `enrichCandidateTraces()` (in `resultTraceBuilder.js`).
10. Build SERP explorer via `buildSerpExplorer()` (in `resultPayloadBuilder.js`).
11. Rewrite `search_profile` from `planned` to `executed`.
12. Write discovery and candidate payloads via `writeDiscoveryPayloads()` (in `resultPayloadBuilder.js`).

## Important invariants

- Domain safety is built deterministically via `classifyDomains()` — no separate LLM domain classifier.
- Borderline relevance problems are soft-label decisions, not automatic hard drops.
- The LLM selector is the only triage path. There is no deterministic lane/quota/rerank fallback — if the selector fails, the run continues with zero selected URLs.
- Executed `search_profile` rewrites the same keys used by the planned artifact.
- `serp_selector_completed` event is emitted on every run with full candidate funnel metrics.

## Outputs out

`processDiscoveryResults()` writes:

- executed `search_profile`
- `_discovery/{category}/{runId}.json`
- `_sources/candidates/{category}/{runId}.json`

It returns:

- `enabled`
- `discoveryKey`
- `candidatesKey`
- `candidates` — all triage-annotated candidate rows (approved + not-selected + overflow)
- `selectedUrls` — URLs selected by SERP selector LLM
- `allCandidateUrls` — all candidate URLs (selected + not-selected)
- `queries`
- `llm_queries`
- `search_profile`
- `search_profile_key`
- `search_profile_run_key`
- `search_profile_latest_key`
- `provider_state`
- `query_concurrency`
- `internal_satisfied`
- `external_search_reason`
- `search_attempts`
- `search_journal`
- `serp_explorer`

Important detail:

- returned `candidates` contains ALL triage-annotated rows (approved + not-selected + overflow), not only the selected subset. `selectedUrls` is the filtered list of URLs the LLM picked. `allCandidateUrls` includes everything.

`serp_explorer` now also records selector-specific state:

- `llm_selector_enabled`
- `llm_selector_applied`

## Side effects and persistence

- rewrites Search Profile from `planned` to `executed`
- writes discovery payload and candidate payload JSON
- writes optional runtime traces for selected URLs
- emits observability logs for dedupe, domain classification, triage, and selected URLs

## What it feeds next

After `processDiscoveryResults()` returns, `runDomainClassifier()` uses triage output to:

- `planner.enqueue(url, "discovery_approved", ...)` for approved URLs
- `planner.seedCandidates(...)` for candidate URLs when candidate fetching is enabled

This is the queue handoff boundary from discovery into the planner frontier.

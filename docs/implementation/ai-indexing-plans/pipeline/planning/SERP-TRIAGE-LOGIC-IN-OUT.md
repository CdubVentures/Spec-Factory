# SERP Triage Logic In And Out

Validated against live code on 2026-03-18.

## What this stage is

SERP Triage is the Stage 07 post-search selection boundary inside `processDiscoveryResults()`. It turns raw result rows into selected discovery candidates, approved/candidate URL lists, the executed `search_profile`, and the persisted discovery payloads.

Primary owners:

- `src/features/indexing/discovery/discoveryResultProcessor.js`
- `src/features/indexing/discovery/triageHardDropFilter.js`
- `src/features/indexing/discovery/triageSoftLabeler.js`
- `src/features/indexing/discovery/triageLaneRouter.js`
- `src/features/indexing/discovery/triageSurfaceScorer.js`
- `src/features/indexing/discovery/triageRejectAuditor.js`
- `src/features/indexing/discovery/serpSelector.js`
- `src/features/indexing/discovery/serpSelectorLlmAdapter.js`
- `src/research/serpReranker.js`

## Schema files in this folder

There is no dedicated numbered JSON schema file just for SERP Triage.

Coverage is split across:

- `04-query-journey-output.json`
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
- optional `effectiveHostPlan`
- optional `focusGroups`
- optional SERP selector DI seams

## Live logic

The live triage flow is:

1. Deduplicate search results with `dedupeSerpResults()`.
2. Apply hard drops with `applyHardDropFilter()`.
3. Classify surviving URLs with `classifyUrlCandidate()`.
4. Build deterministic `domainClassificationRows` and `domainSafetyResults`.
5. Choose a selection branch:
   - selector path when `serpSelectorEnabled=true`, a triage route is available, and there are candidates
   - deterministic path otherwise
6. Selector path:
   - build selector input with `buildSerpSelectorInput()`
   - call the routed selector LLM with reason `serp_url_selector`
   - validate output with `validateSelectorOutput()`
   - adapt output with `adaptSerpSelectorOutput()`
   - fall back to deterministic triage if validation fails or the call errors
7. Deterministic path:
   - apply soft labels
   - assign lanes
   - score rows
   - compute lane quotas
   - select by lane quota
   - optionally call `rerankSerpResults()` when deterministic quality is weak enough
8. Build reject-audit samples and audit trail.
9. Build per-query candidate traces and `serp_explorer`.
10. Rewrite `search_profile` from `planned` to `executed`.
11. Write discovery and candidate payload artifacts.

## Important invariants

- There is no separate LLM domain-classifier stage in the live code. Domain safety is built deterministically inside `processDiscoveryResults()`.
- Borderline relevance problems are soft-label decisions, not automatic hard drops.
- Selector mode bypasses deterministic lane/quota/rerank logic for the selected set.
- If selector output is invalid or the selector call fails, the code falls back to deterministic triage.
- The optional SERP reranker is currently additive/annotative in this integration:
  - it can attach `llm_rerank_score` and `llm_rerank_reason`
  - it does not replace the already-selected lane set
  - it does not add new URLs
- Executed `search_profile` rewrites the same keys used by the planned artifact.
- `serp_triage_completed` is not guaranteed on every run. It is emitted on the reranker path, not on selector-only runs.

## Outputs out

`processDiscoveryResults()` writes:

- executed `search_profile`
- `_discovery/{category}/{runId}.json`
- `_sources/candidates/{category}/{runId}.json`

It returns:

- `enabled`
- `discoveryKey`
- `candidatesKey`
- `candidates`
- `approvedUrls`
- `candidateUrls`
- `queries`
- `llm_queries`
- `search_profile`
- `search_profile_key`
- `search_profile_run_key`
- `search_profile_latest_key`
- `provider_state`
- `query_concurrency`
- `uber_search_plan`
- `internal_satisfied`
- `external_search_reason`
- `search_attempts`
- `search_journal`
- `serp_explorer`

Important detail:

- returned `candidates` is the selected discovery set (`approved + candidate`), not only the candidate-only subset

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

# Audit: pipeline-data-flow.html

Date: 2026-03-30 (full re-audit)

Scope: validated against the current repo inventory (`2394` paths from `rg --files`), current indexing/runtimeOps builders, current event names found in source, and current pipeline/orchestration modules. HTML was not modified.

## Verdict

The broad phase narrative is still recognizable, but the event vocabulary, frontier table names, and RuntimeOps data-source table are materially stale.

## Changes since previous audit

- This re-audit supersedes the interim frontier-elimination note. Current source has a newer crawl-ledger adapter path, but the live workspace still retains `frontier.db`.
- No refreshed source evidence restores the older event names used in the HTML.
- `buildRuntimeOpsPanels.js` remains the central runtime panel builder and confirms that panel assembly is event/meta/artifact driven.

## Confirmed true

- The high-level phase order is still broadly right: needset/planning, search, fetch, parse, extraction/indexing, and run completion.
- RuntimeOps still exposes prefetch, queue, workers, documents, lifecycle, and LLM-oriented views through current builder functions.
- `readRunSummaryEvents()` is still the main event reader used by runtime routes.

## Wrong or stale

- Several documented event names do not match current source:
  - `needset_generated` -> current source emits `needset_computed`
  - `search_slot_started` / `search_slot_finished` -> current source uses `search_started` / `search_finished`
  - `search_results_received` -> current source uses `search_results_collected`
  - `serp_selection_completed` -> current source uses `serp_selector_completed`
  - `domain_classification` -> current source uses `domains_classified`
  - `source_fetch_finished` -> current source uses `fetch_finished`
- The later-stage events `extraction_completed` and `candidates_generated` were not found as current bridge event names. Current downstream flow is split across events such as `parse_finished`, `source_processed`, `index_finished`, and `run_completed`.
- The `frontier_queries` / `frontier_urls` table references are stale as current source vocabulary. Current source uses a `frontierDb` abstraction at some callsites, while newer code also introduces a `crawlLedgerAdapter` backed by SpecDb.
- The RuntimeOps panel source table is materially stale. Current panels are built from runtime events, metadata, and artifacts, not by directly reading tables like `llm_calls`, `llm_token_usage`, `product_queue`, `evidence_documents`, or `crawl_sources`.
- `llm_calls` and `llm_token_usage` are not live SQLite tables in the current workspace. The LLM dashboard is event-derived.

## Missing from the document

- The current source transition around `crawlLedgerAdapter`, `query_cooldowns`, and the runtime crawl-ledger route.
- The newer structured prefetch event surface now used by RuntimeOps, including `search_results_collected`, `serp_selector_completed`, `domains_classified`, `source_processed`, and `index_finished`.
- The current `cooldown_skip` / frontier-cache transition behavior exposed in runtime event payloads.

## Evidence

- `src/pipeline/runProduct.js`
- `src/features/indexing/pipeline/needSet/runNeedSet.js`
- `src/features/indexing/pipeline/searchExecution/executeSearchQueries.js`
- `src/features/indexing/pipeline/resultProcessing/processDiscoveryResults.js`
- `src/features/indexing/api/runtimeOpsRoutes.js`
- `src/features/indexing/api/builders/buildRuntimeOpsPanels.js`
- `src/features/indexing/api/builders/runtimeOpsPreFetchBuilders.js`
- `src/features/indexing/api/builders/runtimeOpsLlmDashboardBuilders.js`
- `src/features/indexing/api/builders/runtimeOpsDataBuilders.js`
- `src/features/indexing/api/builders/indexlabDataBuilders.js`
- `src/features/indexing/orchestration/shared/crawlLedgerAdapter.js`
- `src/indexlab/runtimeBridgeArtifacts.js`

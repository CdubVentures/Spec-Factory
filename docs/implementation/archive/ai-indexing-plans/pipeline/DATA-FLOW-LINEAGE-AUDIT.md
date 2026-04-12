# Data Flow Lineage Audit

> Updated: 2026-03-24 (post pipeline rework — old stages 09–13 removed).
> Previous audit: 2026-03-18 (full 13-stage lineage, now historical).

## Authority

- Planning/discovery contracts: `docs/implementation/ai-indexing-plans/pipeline/planning/*` (stages 01–08, unchanged)
- Crawl pipeline docs: `docs/implementation/ai-indexing-plans/pipeline/parsing/CRAWL-PIPELINE-OVERVIEW.md`
- Live runtime source: `src/pipeline/runProduct.js`, `src/features/crawl/`, `src/features/indexing/discovery/`

## Current Pipeline (2 phases)

### Phase A: Discovery (stages 01–08) — unchanged

| Stage | Producer | Input | Output |
|-------|----------|-------|--------|
| B0 | Bootstrap | config, job, storage | categoryConfig, planner, frontierDb, llmContext, needSet |
| 01 | NeedSet | job, categoryConfig, fieldRules | fields[], blockers, identity context |
| 02 | Brand Resolver | job identity, categoryConfig | brandResolution, variables, identityLock |
| 03 | Search Profile | needSet, identity, categoryConfig | searchProfileBase (queries[], templates) |
| 04 | Search Planner | profile queries | enhancedRows (augmented queries) |
| 05 | Query Journey | enhanced queries, config | selected queries, execution plan |
| 06 | Search Execution | queries | rawResults[] (SERP hits) |
| 07 | Result Processor | rawResults | candidates[], selectedUrls[] |
| 08 | Domain Classifier | selectedUrls, planner | planner queue seeded with approved URLs |

### Phase B: Crawl — new (replaces old stages 09–13)

| Step | Producer | Input | Output |
|------|----------|-------|--------|
| Batch drain | `runCrawlProcessingLifecycle` | planner queue | URL batches |
| Crawl | `crawlSession.processBatch` | URL batch | page HTML, screenshots, status per URL |
| Block classify | `classifyBlockStatus` | status, HTML | blocked flag, blockReason |
| Record | `frontierDb.recordFetch` | URL, status | cooldown updated |
| Events | logger | worker_id, URL, status | `fetch_started` / `fetch_finished` for GUI |

### Cross-phase data handoff

```
Bootstrap → planner (SourcePlanner instance, seeded by discovery)
         → frontierDb (URL history, shared)
         → config (settings, shared)

Discovery → planner.enqueue() (approved URLs from Stage 08)
         → search_results_collected events (URL→search-slot linkage for GUI)

Crawl → planner.next() (dequeue URLs)
     → frontierDb.shouldSkipUrl() (cooldown check)
     → frontierDb.recordFetch() (record result)
     → fetch_started / fetch_finished events (GUI worker tab)
     → return { crawlResults } to caller
```

## Removed data flows (historical)

These no longer exist in live code. Old contracts in `pipeline/parsing/` were deleted.

- `phase08FieldContexts`, `phase08PrimeRows`, `phase08BatchRows` — extraction state
- `sourceResults[]` with `fieldCandidates`, `identityCandidates`, `anchorCheck` — per-source extraction
- `evidencePack` with `snippets[]`, `references[]` — evidence for LLM extraction
- `consensus.fields`, `consensus.provenance`, `consensus.candidates` — cross-source scoring
- `normalized`, `provenance`, `candidates`, `fieldsBelowPassTarget` — finalization state
- `needSet` (post-finalization), `trafficLight`, `fieldReasoning` — validation derivatives
- `learningProfile`, `learningGateResult` — cross-run learning
- Schema packets (`sourceCollection`, `itemPacket`, `runMetaPacket`) — indexing artifacts
- `run_completed` event (old 62-field payload) — replaced with simplified crawl summary

## Notes

- Discovery LLM calls (brand resolver, search profile) still use `llmContext` from bootstrap.
- The planner is seeded by discovery Stage 08 (`domainClassifier.js`). If discovery finds no URLs, the crawl loop exits immediately.
- `run_completed` event now carries: `{ runId, category, productId, urls_crawled, urls_successful, urls_blocked, duration_ms }`.
- Frontier DB cooldowns are the only cross-run persistence. Learning stores still exist but are not written to.

# runtimeOpsDataBuilders.test.js Audit

Scope: `src/features/indexing/api/builders/tests/runtimeOpsDataBuilders.test.js`

Policy:
- Preserve unique runtime-ops summary, document-list, document-detail, metrics-rail, and generic fetch/parse/llm worker contracts.
- Collapse default and closely related worker/meta micro-tests into focused family files.
- Retire the duplicate search-worker row assertion because the dedicated search-pool and bridge-integration suites already cover it more directly.

## Summary Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `buildRuntimeOpsSummary: empty events returns baseline shape with zeroed counters` | KEEP | Baseline summary shape is a real public contract. | `src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js` | Preserved |
| `buildRuntimeOpsSummary: extracts status and round from meta` | COLLAPSE | Same summary-meta family as phase-cursor handling. | `src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js` | Merged into meta forwarding contract |
| `buildRuntimeOpsSummary: forwards phase_cursor from meta` | COLLAPSE | Same summary-meta family as status/round forwarding. | `src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js` | Merged into meta forwarding contract |
| `buildRuntimeOpsSummary: phase_cursor defaults to empty string when absent` | COLLAPSE | Same summary-meta family as explicit phase-cursor forwarding. | `src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js` | Merged into meta forwarding contract |
| `buildRuntimeOpsSummary: mixed fetch events produce correct counters and error_rate` | COLLAPSE | Same real-work counting family as stage-scope marker exclusion. | `src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js` | Merged into real-work counting contract |
| `buildRuntimeOpsSummary: fetch_finished status payload emitted by runtime bridge counts as a real fetch result` | COLLAPSE | Same real-work counting family as mixed fetch counters and error-rate calculation. | `src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js` | Merged into real-work counting contract |
| `buildRuntimeOpsSummary: llm_started/finished events increment total_llm_calls` | COLLAPSE | Same rate-metric family as indexed field throughput. | `src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js` | Merged into rate-metric contract |
| `buildRuntimeOpsSummary: ignores stage-scope fetch/parse lifecycle markers when counting real work` | COLLAPSE | Same real-work counting family as mixed fetch counters and bridge status payload support. | `src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js` | Merged into real-work counting contract |
| `buildRuntimeOpsSummary: fields_per_min uses indexed field counts when index_finished events are present` | COLLAPSE | Same rate-metric family as llm call counting. | `src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js` | Merged into rate-metric contract |
| `buildRuntimeOpsSummary: top_blockers populated from error events` | KEEP | Distinct blocker-grouping contract for summary output. | `src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js` | Preserved |

## Worker Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `buildRuntimeOpsWorkers: empty events returns empty array` | KEEP | Baseline worker-list shape is a real public contract. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Preserved |
| `buildRuntimeOpsWorkers: paired fetch_started/finished produces idle worker` | COLLAPSE | Same fetch lifecycle family as bridge status-code handling. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into fetch lifecycle contract |
| `buildRuntimeOpsWorkers: fetch_finished status payload emitted by runtime bridge does not collapse to HTTP 0` | COLLAPSE | Same fetch lifecycle family as idle-state completion. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into fetch lifecycle contract |
| `buildRuntimeOpsWorkers: unmatched fetch_started beyond threshold marks worker stuck` | COLLAPSE | Same threshold family as unmatched-running detection. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into threshold contract |
| `buildRuntimeOpsWorkers: unmatched fetch_started within threshold marks worker running` | COLLAPSE | Same threshold family as unmatched-stuck detection. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into threshold contract |
| `buildRuntimeOpsWorkers: search_started events produce worker with search pool` | RETIRE | Duplicate of the dedicated search-pool and bridge-integration coverage. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineIntegration.test.js` | Retired with file deletion |
| `buildRuntimeOpsWorkers: llm_started events produce worker with llm pool` | COLLAPSE | Same worker-family mapping family as parse/fetch stage derivation. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into worker-family contract |
| `buildRuntimeOpsWorkers: parse_started events produce worker with parse pool` | COLLAPSE | Same worker-family mapping family as llm/fetch stage derivation. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into worker-family contract |
| `buildRuntimeOpsWorkers: stage is set correctly per event type` | COLLAPSE | Same worker-family mapping family as parse/llm pool derivation. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into worker-family contract |
| `buildRuntimeOpsWorkers: docs_processed increments on fetch_finished` | COLLAPSE | Same completed-document counting family as dedupe-on-later-stages. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into docs-processed contract |
| `buildRuntimeOpsWorkers: docs_processed counts a completed url once even when parse/index events also arrive` | COLLAPSE | Same completed-document counting family as fetch-finished incrementing. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into docs-processed contract |
| `buildRuntimeOpsWorkers: fields_extracted increments on source_processed candidates` | COLLAPSE | Same extraction backfill family as index-finished and source-packet fallback. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into extraction backfill contract |
| `buildRuntimeOpsWorkers: fields_extracted backfills from index_finished filled_fields when runtime parse events omit inline candidates` | COLLAPSE | Same extraction backfill family as inline candidates and source packets. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into extraction backfill contract |
| `buildRuntimeOpsWorkers: source indexing packets backfill extraction-ready field counts for matched fetch workers` | COLLAPSE | Same extraction backfill family as inline candidates and index-finished fallback. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js` | Merged into extraction backfill contract |

## Document List Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `buildRuntimeOpsDocuments: empty events returns empty array` | KEEP | Baseline document-list shape is a real public contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentListContracts.test.js` | Preserved |
| `buildRuntimeOpsDocuments: aggregates fetch+parse events into document rows keyed by URL` | KEEP | Core document-list aggregation contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentListContracts.test.js` | Preserved |
| `buildRuntimeOpsDocuments: fetch_finished status payload emitted by runtime bridge sets document status and code` | KEEP | Distinct bridge payload compatibility contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentListContracts.test.js` | Preserved |
| `buildRuntimeOpsDocuments: source_processed backfills parsed document bytes and content hash` | KEEP | Distinct source-processed metadata backfill contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentListContracts.test.js` | Preserved |
| `buildRuntimeOpsDocuments: empty parse_finished payload does not erase parse method already learned from source_processed` | KEEP | Distinct parse-method preservation contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentListContracts.test.js` | Preserved |
| `buildRuntimeOpsDocuments: newest-first ordering` | COLLAPSE | Same document-list ordering family as aggregate list behavior and limit trimming. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentListContracts.test.js` | Merged into aggregate/limit contracts |
| `buildRuntimeOpsDocuments: limit param is respected` | KEEP | Distinct list trimming contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentListContracts.test.js` | Preserved |

## Document Detail Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `buildRuntimeOpsDocumentDetail: returns null for unknown URL` | KEEP | Distinct missing-detail guard contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentDetailContracts.test.js` | Preserved |
| `buildRuntimeOpsDocumentDetail: returns full lifecycle timeline for known URL` | KEEP | Core detail timeline contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentDetailContracts.test.js` | Preserved |
| `buildRuntimeOpsDocumentDetail: fetch_finished status payload emitted by runtime bridge populates status_code` | KEEP | Distinct bridge payload compatibility contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentDetailContracts.test.js` | Preserved |
| `buildRuntimeOpsDocumentDetail: source_processed backfills bytes and parse method when fetch_finished is thin` | KEEP | Distinct source-processed backfill contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentDetailContracts.test.js` | Preserved |
| `buildRuntimeOpsDocumentDetail: empty parse_finished payload does not erase parse method already learned from source_processed` | KEEP | Distinct parse-method preservation contract. | `src/features/indexing/api/builders/tests/runtimeOpsDocumentDetailContracts.test.js` | Preserved |

## Metrics Rail Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `buildRuntimeOpsMetricsRail: empty events returns baseline shape` | KEEP | Baseline metrics-rail shape is a real public contract. | `src/features/indexing/api/builders/tests/runtimeOpsMetricsRailContracts.test.js` | Preserved |
| `buildRuntimeOpsMetricsRail: pool metrics from worker events` | KEEP | Distinct worker-pool metrics contract. | `src/features/indexing/api/builders/tests/runtimeOpsMetricsRailContracts.test.js` | Preserved |
| `buildRuntimeOpsMetricsRail: quality metrics from needset_computed event` | KEEP | Distinct quality-metrics contract. | `src/features/indexing/api/builders/tests/runtimeOpsMetricsRailContracts.test.js` | Preserved |
| `buildRuntimeOpsMetricsRail: failure metrics from fallback events` | COLLAPSE | Same failure-metrics family as scheduler fallback and blocked-host aggregation. | `src/features/indexing/api/builders/tests/runtimeOpsMetricsRailContracts.test.js` | Merged into failure metrics contract |
| `buildRuntimeOpsMetricsRail: scheduler fallback events count toward fallback metrics and blocked hosts` | COLLAPSE | Same failure-metrics family as fallback fetch events. | `src/features/indexing/api/builders/tests/runtimeOpsMetricsRailContracts.test.js` | Merged into failure metrics contract |

## Proof

- Targeted replacement tests: `node --test src/features/indexing/api/builders/tests/runtimeOpsSummaryContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsDocumentListContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsDocumentDetailContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsMetricsRailContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsWorkerContracts.test.js`
- Surrounding indexing API builder tests: `node --test src/features/indexing/api/builders/tests/*.test.js`
- Full suite: `npm test`

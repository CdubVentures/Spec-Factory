# runtimeOpsWorkerPipelineIntegration.test.js Audit

Scope: `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineIntegration.test.js`

Policy:
- Preserve the cross-boundary contracts that only exist when the runtime bridge emits events and the runtime-ops builders consume them together.
- Retire pool-shape, fetch-detail, and legacy-tolerance duplicates that are already covered more directly in the dedicated search-pool, LLM-pool, worker-detail, route-shape, and bridge telemetry suites.
- Split surviving contracts by bridge-to-builder concern so search, LLM, and finalize-state behavior can schedule independently.

## Search Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `integration: mixed run produces workers from all 3 pools` | RETIRE | Weak smoke coverage only; dedicated worker-pool and route-shape suites already prove each pool family directly. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersLlmPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js` | Retired |
| `integration: sequential queries keep one visible worker per query` | KEEP | Distinct bridge slot-allocation contract across repeated query lifecycles. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineSearchContracts.test.js` | Preserved |
| `integration: search worker detail reflects the query owned by that slot` | KEEP | Distinct bridge-to-detail ownership contract for per-slot search history. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineSearchContracts.test.js` | Preserved |
| `integration: search KPI rows preserve totals across per-query workers` | KEEP | Distinct aggregation contract across bridge-emitted per-query workers. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineSearchContracts.test.js` | Preserved |

## LLM Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `integration: LLM worker carries call telemetry through bridge to builders` | COLLAPSE | Same bridge-to-builder LLM roundtrip family as the worker-detail contract. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineLlmContracts.test.js` | Merged into one bridge roundtrip contract |
| `integration: LLM worker detail returns llm_detail with full telemetry` | COLLAPSE | Same bridge-to-builder LLM roundtrip family as the worker-row contract. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineLlmContracts.test.js` | Merged into one bridge roundtrip contract |
| `integration: LLM aggregate state tracks calls by type and model` | KEEP | Distinct mixed-type aggregate contract for bridge-side reason normalization and failure accounting. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineLlmContracts.test.js` | Preserved |

## Retired Duplicates

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `integration: fetch worker shape unchanged — direct event injection` | RETIRE | Fetch worker shape and pool-specific field absence are already covered directly in the fetch worker and route-shape suites. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerDetail.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js` | Retired |
| `integration: fetch worker detail returns documents, no search_history or llm_detail` | RETIRE | Duplicate of existing worker-detail fetch contracts. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersLlmPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js` | Retired |
| `integration: legacy search event without slot metadata does not crash` | RETIRE | Duplicate of the dedicated legacy search-pool compatibility contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired |
| `integration: legacy LLM event without call_type does not crash` | RETIRE | Duplicate of the dedicated legacy LLM-pool compatibility contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersLlmPool.test.js` | Retired |

## Bridge State Contract

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `integration: finalize clears search slots, LLM tracking, and resets counters` | KEEP | Distinct runtime bridge cleanup contract; no other builder or bridge suite proves this exact post-finalize state. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineStateContracts.test.js` | Preserved |

## Proof

- Targeted replacement tests: `node --test src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineSearchContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineLlmContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineStateContracts.test.js`
- Surrounding indexing API builder tests: `node --test src/features/indexing/api/builders/tests/*.test.js`
- Full suite: `npm test`

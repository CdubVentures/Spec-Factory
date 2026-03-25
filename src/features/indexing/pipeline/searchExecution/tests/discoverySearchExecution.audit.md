# discoverySearchExecution.test.js Audit

Scope: `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecution.test.js`

Policy:
- Preserve the public search-execution contracts for plan-only fallback, internal-first satisfaction/escalation, provider-backed internet search, frontier-cache reuse, and emitted telemetry.
- Collapse repeated wrappers that only proved the same branch family through slightly different fixtures.
- Retire obsolete fallback assertions when the implementation no longer exposes that fallback behavior as a distinct contract.

## Shape and Plan Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `executeSearchQueries: returns correct result shape` | COLLAPSE | Shape is better proven by the stronger no-query diagnostics contract that also checks empty outputs. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionTelemetryContracts.test.js` | Merged into empty-query diagnostics contract |
| `executeSearchQueries: plan-only produces planned URLs from source hosts` | KEEP | Distinct plan-only search fallback contract. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionPlanContracts.test.js` | Preserved |
| `executeSearchQueries: plan-only emits discovery_query lifecycle events` | COLLAPSE | Same plan-only family as the planned-URL contract. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionPlanContracts.test.js` | Merged into plan-only contract |

## Internal-First Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `executeSearchQueries: internal-first accumulates corpus results` | KEEP | Distinct contract for internal corpus accumulation and recorded attempts. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionInternalContracts.test.js` | Preserved |
| `executeSearchQueries: internalSatisfied when corpus exceeds threshold` | COLLAPSE | Same satisfaction/escalation family as the skip-external and under-target wrappers. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionInternalContracts.test.js` | Merged into table-driven satisfaction contract |
| `executeSearchQueries: skips internet search when internal satisfied` | COLLAPSE | Same satisfaction/escalation family as the threshold wrapper. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionInternalContracts.test.js` | Merged into table-driven satisfaction contract |
| `executeSearchQueries: externalSearchReason when internal under target` | COLLAPSE | Same satisfaction/escalation family as the threshold wrapper. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionInternalContracts.test.js` | Merged into table-driven satisfaction contract |

## Internet Search Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `executeSearchQueries: internet search runs provider and accumulates results` | KEEP | Distinct provider-backed internet search contract. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionInternetContracts.test.js` | Preserved |
| `executeSearchQueries: internet search applies zero-result fallback` | RETIRE | Weak wrapper with an outdated fallback comment; it no longer proves a distinct public branch beyond the stronger frontier-reuse contract. | None | Deleted |
| `executeSearchQueries: falls back to frontier cache when provider returns zero results` | KEEP | Distinct frontier-cache reuse contract for zero-result provider calls. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionInternetContracts.test.js` | Preserved |

## Telemetry Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `executeSearchQueries: logs search_provider_diagnostics` | COLLAPSE | Same no-query/telemetry family as the empty-query shape contract. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionTelemetryContracts.test.js` | Merged into empty-query diagnostics contract |
| `executeSearchQueries: internet search populates searchJournal` | COLLAPSE | Same telemetry family as the runtime-trace contract. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionTelemetryContracts.test.js` | Merged into telemetry contract |
| `executeSearchQueries: empty queries with available provider produces empty results` | COLLAPSE | Same no-query/telemetry family as the diagnostics wrapper. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionTelemetryContracts.test.js` | Merged into empty-query diagnostics contract |
| `executeSearchQueries: writes runtime traces when writer provided` | COLLAPSE | Same telemetry family as the journal wrapper. | `src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecutionTelemetryContracts.test.js` | Merged into telemetry contract |

## Proof

- Targeted replacement tests: `node --test src/features/indexing/pipeline/searchExecution/tests/discoverySearchExecution*.test.js`
- Surrounding search-execution tests: `node --test src/features/indexing/pipeline/searchExecution/tests/*.test.js`
- Full suite: `npm test`

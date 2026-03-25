# searchWorkerPanelDataFlow.test.js Audit

Scope: `src/features/indexing/api/builders/tests/searchWorkerPanelDataFlow.test.js`

Policy:
- Preserve search-worker row, search-history, bridge-field, and route-shape contracts already covered by stronger builder-level and bridge-integration tests.
- Retire panel-level micro-assertions that only restate those existing contracts one field at a time.
- Prefer the existing canonical coverage in `runtimeOpsDataBuildersSearchPool.test.js`, `runtimeOpsRouteResponseShape.test.js`, `runtimeOpsWorkerPipelineIntegration.test.js`, and `runtimeOpsDataBuilders.test.js` over keeping a second overlapping file.

## Worker Row Micro-Assertions

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `search panel data: pool is "search" for search_started events` | RETIRE | Duplicate of the existing search-pool worker identity contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuilders.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel data: slot is populated from bridge payload` | RETIRE | Duplicate of the existing slot/task-field search worker contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel data: tasks_started from bridge payload` | RETIRE | Duplicate of the existing slot/task-field search worker contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel data: tasks_completed increments per search_finished` | RETIRE | Duplicate of existing KPI aggregation coverage for completed search attempts. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineIntegration.test.js` | Retired with file deletion |
| `search panel data: current_query set from bridge "query" field while running` | RETIRE | Duplicate of the bridge-field mapping contract for `query -> current_query`. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel data: current_provider set from bridge "provider" field while running` | RETIRE | Duplicate of the bridge-field mapping contract for `provider -> current_provider`. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel data: current_query and current_provider cleared after search_finished` | RETIRE | Duplicate of the existing finished-search clearing contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel data: current_query and current_provider repopulate on next search_started` | RETIRE | Covered by the existing ordered search-history and bridge-field contracts; does not add a unique public contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel data: zero_result_count increments when result_count is 0` | RETIRE | Duplicate of existing KPI aggregation coverage. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineIntegration.test.js` | Retired with file deletion |
| `search panel data: avg_result_count is correct rolling average` | RETIRE | Duplicate of existing KPI aggregation coverage. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel data: avg_duration_ms is correct rolling average` | RETIRE | Duplicate of existing KPI aggregation coverage. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel data: last_result_count and last_duration_ms from most recent finish` | RETIRE | Duplicate of existing KPI aggregation coverage. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineIntegration.test.js` | Retired with file deletion |
| `search panel data: state is "running" while search is active` | RETIRE | Duplicate of the existing running-state worker contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel data: state is "idle" after search_finished` | RETIRE | Duplicate of the existing idle-state worker contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuilders.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |

## Search History Micro-Assertions

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `search panel detail: search_history populated from bridge events` | RETIRE | Duplicate of the canonical search-history existence contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js` | Retired with file deletion |
| `search panel detail: attempt.query from bridge "query" field` | RETIRE | Duplicate of the existing bridge-field history contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel detail: attempt.provider from bridge "provider" field` | RETIRE | Duplicate of the existing bridge-field history contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel detail: attempt status is "running" while active` | RETIRE | Covered by the existing search-history contract and response-shape contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js` | Retired with file deletion |
| `search panel detail: attempt status is "done" when result_count > 0` | RETIRE | Covered by the existing search-history contract and response-shape contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js` | Retired with file deletion |
| `search panel detail: attempt status is "zero" when result_count === 0` | RETIRE | Covered by the existing search-history contract and KPI integration coverage. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineIntegration.test.js` | Retired with file deletion |
| `search panel detail: attempt result_count and duration_ms from finished event` | RETIRE | Duplicate of existing search-history value propagation coverage. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineIntegration.test.js` | Retired with file deletion |
| `search panel detail: attempt started_ts from search_started event` | RETIRE | Only restates field presence already covered by response-shape and history ordering contracts. | `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel detail: attempt finished_ts is null while running` | RETIRE | Only restates field presence and running-attempt behavior already covered elsewhere. | `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel detail: attempt finished_ts populated after search_finished` | RETIRE | Only restates field presence and finished-attempt behavior already covered elsewhere. | `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |
| `search panel detail: attempts ordered by attempt_no descending (most recent first)` | RETIRE | Duplicate of the canonical history-ordering contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js` | Retired with file deletion |

## Scenario and Route Assertions

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `search panel data: full mockup scenario — 12 attempts with mixed providers and states` | RETIRE | Large characterization scenario only replays contracts already covered individually: KPI aggregation, ordering, bridge-field mapping, running attempt state, zero-result handling, and provider variety. It adds runtime cost without adding a new public contract. | `src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineIntegration.test.js`; `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js` | Retired with file deletion |
| `search panel data: multi-slot workers are independent` | RETIRE | Duplicate of the bridge-integration contract that proves one worker row per query slot and slot-owned history. | `src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineIntegration.test.js` | Retired with file deletion |
| `search panel route shape: workers list includes all search-pool fields` | RETIRE | Duplicate of the dedicated route-shape contract for search worker rows. | `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js` | Retired with file deletion |
| `search panel route shape: worker detail includes search_history with all attempt fields` | RETIRE | Duplicate of the dedicated route-shape contract for search-history attempts. | `src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js` | Retired with file deletion |

## Proof

- Targeted replacement coverage: `node --test src/features/indexing/api/builders/tests/runtimeOpsDataBuilders.test.js src/features/indexing/api/builders/tests/runtimeOpsDataBuildersSearchPool.test.js src/features/indexing/api/builders/tests/runtimeOpsRouteResponseShape.test.js src/features/indexing/api/builders/tests/runtimeOpsWorkerPipelineIntegration.test.js`
- Surrounding indexing API builder tests: `node --test src/features/indexing/api/builders/tests/*.test.js`
- Full suite: `npm test`

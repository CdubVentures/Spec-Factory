# runtimeOpsPreFetchEvents.test.js Audit

Scope: `src/features/indexing/api/builders/tests/runtimeOpsPreFetchEvents.test.js`

Policy:
- Preserve real `buildPreFetchPhases` contracts for structured prefetch payload sections: brand resolution, search-plan enrichment, search-result details, SERP triage, domain-health rows, and compatibility with the older needset/llm/search result surface.
- Collapse repeated default-empty and status-by-status micro-tests into smaller family files with table-driven coverage.
- Retire nothing that was the sole protection for a runtime-visible prefetch payload branch.

## Brand Resolution Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `brand_resolved event populates brand_resolution structured data` | COLLAPSE | Same brand-resolution payload family as status and reasoning coverage. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js` | Merged into status/reasoning contract |
| `brand_resolution defaults to null when no brand_resolved event` | COLLAPSE | Same structured-defaults family as search-plan/search-result/triage/domain-health empty-state coverage. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js` | Merged into structured-defaults contract |
| `brand_resolved with status skipped populates brand_resolution` | COLLAPSE | Same status-family payload contract as failed and resolved states. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js` | Merged into status-family contract |
| `brand_resolved with status failed populates brand_resolution` | COLLAPSE | Same status-family payload contract as skipped and resolved states. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js` | Merged into status-family contract |
| `brand_resolved with status resolved populates brand_resolution` | COLLAPSE | Same status-family payload contract as skipped and failed states. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js` | Merged into status-family contract |
| `brand_resolution falls back to artifact when no event` | KEEP | Distinct artifact-fallback contract for the prefetch payload. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js` | Preserved |
| `brand_resolved event passes through reasoning array` | COLLAPSE | Same reasoning/defaults family as missing-optional-field handling. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js` | Merged into reasoning/defaults contract |
| `brand_resolved event defaults reasoning to empty array when absent` | COLLAPSE | Same reasoning/defaults family as pass-through and optional-field handling. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js` | Merged into reasoning/defaults contract |
| `brand_resolved event handles missing optional fields gracefully` | COLLAPSE | Same reasoning/defaults family as reasoning pass-through/default behavior. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js` | Merged into reasoning/defaults contract |

## Search Plan Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `search_plan_generated events populate search_plans array` | COLLAPSE | Same search-plan projection family as enriched multi-pass coverage. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSearchPlanContracts.test.js` | Merged into enriched plan contract |
| `search_plans defaults to empty array when no events` | COLLAPSE | Same structured-defaults family as other absent-section checks. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js` | Merged into structured-defaults contract |
| `search_plan_generated with enriched fields preserves query_target_map, missing_critical_fields, mode` | COLLAPSE | Same enriched search-plan family as multi-pass coverage. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSearchPlanContracts.test.js` | Merged into enriched plan contract |
| `search_plan_generated backward compat: missing enrichment fields default gracefully` | KEEP | Distinct backward-compatibility contract for older search-plan events. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSearchPlanContracts.test.js` | Preserved |
| `search_plan_generated multi-pass with enriched fields` | KEEP | Distinct multi-pass enriched plan contract. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSearchPlanContracts.test.js` | Preserved |

## Search Result Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `search_results_collected events populate search_result_details array` | COLLAPSE | Same detail-envelope family as empty-result handling. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSearchResultContracts.test.js` | Merged into detail-envelope contract |
| `search_result_details defaults to empty array when no events` | COLLAPSE | Same structured-defaults family as other absent-section checks. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js` | Merged into structured-defaults contract |
| `search stage boundary events do not create blank query failure rows` | KEEP | Distinct regression for runtime stage markers versus query-scoped search rows. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSearchResultContracts.test.js` | Preserved |
| `search_results_collected handles empty results array` | COLLAPSE | Same detail-envelope family as populated search-result details. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSearchResultContracts.test.js` | Merged into detail-envelope contract |

## SERP Triage Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `serp_selector_completed events populate serp_selector array` | COLLAPSE | Same triage-envelope family as missing-score-component handling. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSerpContracts.test.js` | Merged into triage-shape contract |
| `serp_selector defaults to empty array when no events` | COLLAPSE | Same structured-defaults family as other absent-section checks. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js` | Merged into structured-defaults contract |
| `serp_selector_completed handles candidates with missing score_components` | KEEP | Distinct compatibility contract for partially populated triage rows. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchSerpContracts.test.js` | Preserved |

## Domain Health Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `domains_classified events populate domain_health array` | COLLAPSE | Same domain-health projection family as multi-event merge coverage. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchDomainHealthContracts.test.js` | Merged into merged-domain-health contract |
| `domain_health defaults to empty array when no events` | COLLAPSE | Same structured-defaults family as other absent-section checks. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js` | Merged into structured-defaults contract |
| `multiple domains_classified events merge into single domain_health array` | KEEP | Distinct multi-event aggregation contract. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchDomainHealthContracts.test.js` | Preserved |

## Compatibility Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `new structured fields coexist with existing fields in buildPreFetchPhases` | KEEP | Distinct compatibility contract between the newer structured sections and the older needset/llm/search outputs. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js` | Preserved |
| `needset artifact identity conflict breakdown is preserved in runtime-ops prefetch payload` | KEEP | Distinct artifact-needset compatibility contract for the GUI prefetch payload. | `src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js` | Preserved |

## Proof

- Targeted replacement tests: `node --test src/features/indexing/api/builders/tests/runtimeOpsPreFetchBrandResolutionContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsPreFetchSearchPlanContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsPreFetchSearchResultContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsPreFetchSerpContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsPreFetchDomainHealthContracts.test.js src/features/indexing/api/builders/tests/runtimeOpsPreFetchCompatibilityContracts.test.js`
- Surrounding indexing API builder tests: `node --test src/features/indexing/api/builders/tests/*.test.js`
- Full suite: `npm test`

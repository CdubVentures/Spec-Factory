# automationQueueHelpers.test.js Audit

Scope: `src/features/indexing/api/builders/tests/automationQueueHelpers.test.js`

Policy:
- Preserve helper contracts that affect automation priority, queue identity, status/query normalization, and search-profile map derivation.
- Collapse repeated one-value-per-test mapping cases into table-driven tests by helper family.
- Retire no behavior; this pass is reduction by consolidation rather than deletion of live contracts.

## Priority Helpers

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `clampAutomationPriority passes through a value within range` | COLLAPSE | Same clamp family as below-minimum and above-maximum numeric handling. | `automationQueueHelpers.priorityContracts.test.js` | Merged into numeric clamp test |
| `clampAutomationPriority clamps below minimum to 1` | COLLAPSE | Same clamp family as in-range and above-maximum numeric handling. | `automationQueueHelpers.priorityContracts.test.js` | Merged into numeric clamp test |
| `clampAutomationPriority clamps above maximum to 100` | COLLAPSE | Same clamp family as in-range and below-minimum numeric handling. | `automationQueueHelpers.priorityContracts.test.js` | Merged into numeric clamp test |
| `clampAutomationPriority returns fallback for NaN` | COLLAPSE | Same fallback family as null/undefined input handling. | `automationQueueHelpers.priorityContracts.test.js` | Merged into fallback test |
| `clampAutomationPriority returns fallback for null/undefined` | COLLAPSE | Same fallback family as NaN/non-numeric input handling. | `automationQueueHelpers.priorityContracts.test.js` | Merged into fallback test |
| `automationPriorityForRequiredLevel maps identity to 10` | COLLAPSE | Same canonical required-level mapping family as critical/required/expected/optional. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven required-level mapping test |
| `automationPriorityForRequiredLevel maps critical to 20` | COLLAPSE | Same canonical required-level mapping family as identity/required/expected/optional. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven required-level mapping test |
| `automationPriorityForRequiredLevel maps required to 35` | COLLAPSE | Same canonical required-level mapping family as identity/critical/expected/optional. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven required-level mapping test |
| `automationPriorityForRequiredLevel maps expected to 60` | COLLAPSE | Same canonical required-level mapping family as identity/critical/required/optional. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven required-level mapping test |
| `automationPriorityForRequiredLevel maps optional to 80` | COLLAPSE | Same canonical required-level mapping family as identity/critical/required/expected. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven required-level mapping test |
| `automationPriorityForRequiredLevel returns 50 for unknown levels` | COLLAPSE | Same fallback family as empty-string handling. | `automationQueueHelpers.priorityContracts.test.js` | Merged into fallback test |
| `automationPriorityForRequiredLevel returns 50 for empty string` | COLLAPSE | Same fallback family as unknown-level handling. | `automationQueueHelpers.priorityContracts.test.js` | Merged into fallback test |
| `automationPriorityForRequiredLevel is case-insensitive` | KEEP | Distinct normalization contract for required-level mapping. | `automationQueueHelpers.priorityContracts.test.js` | Preserved |
| `automationPriorityForJobType maps repair_search to 20` | COLLAPSE | Same job-type mapping family as deficit/staleness/domain_backoff. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven job-type mapping test |
| `automationPriorityForJobType maps deficit_rediscovery to 35` | COLLAPSE | Same job-type mapping family as repair/staleness/domain_backoff. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven job-type mapping test |
| `automationPriorityForJobType maps staleness_refresh to 55` | COLLAPSE | Same job-type mapping family as repair/deficit/domain_backoff. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven job-type mapping test |
| `automationPriorityForJobType maps domain_backoff to 65` | COLLAPSE | Same job-type mapping family as repair/deficit/staleness. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven job-type mapping test |
| `automationPriorityForJobType returns 50 for unknown` | COLLAPSE | Same fallback family as empty job type. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven job-type mapping test |
| `automationPriorityForJobType returns 50 for empty` | COLLAPSE | Same fallback family as unknown job type. | `automationQueueHelpers.priorityContracts.test.js` | Merged into table-driven job-type mapping test |

## List and Identity Helpers

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `toStringList returns trimmed strings from array` | COLLAPSE | Same list-normalization family as filtering and limit enforcement. | `automationQueueHelpers.listContracts.test.js` | Merged into list normalization test |
| `toStringList filters non-strings and empty strings` | COLLAPSE | Same list-normalization family as trimming and limit enforcement. | `automationQueueHelpers.listContracts.test.js` | Merged into list normalization test |
| `toStringList applies limit` | COLLAPSE | Same list-normalization family as trimming and filtering. | `automationQueueHelpers.listContracts.test.js` | Merged into list normalization test |
| `toStringList returns empty array for non-array input` | KEEP | Distinct non-array guard contract. | `automationQueueHelpers.listContracts.test.js` | Preserved |
| `addUniqueStrings merges and deduplicates` | COLLAPSE | Same merge family as limit enforcement. | `automationQueueHelpers.listContracts.test.js` | Merged into merge-and-limit test |
| `addUniqueStrings respects limit` | COLLAPSE | Same merge family as dedupe behavior. | `automationQueueHelpers.listContracts.test.js` | Merged into merge-and-limit test |
| `addUniqueStrings handles non-array inputs gracefully` | COLLAPSE | Same invalid-input family as empty-array handling. | `automationQueueHelpers.listContracts.test.js` | Merged into invalid/empty-input test |
| `addUniqueStrings handles empty inputs` | COLLAPSE | Same invalid-input family as non-array handling. | `automationQueueHelpers.listContracts.test.js` | Merged into invalid/empty-input test |
| `buildAutomationJobId produces deterministic hash` | COLLAPSE | Same job-id contract family as different-key uniqueness. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into deterministic/unique-id test |
| `buildAutomationJobId returns prefix:na when dedupeKey is empty` | COLLAPSE | Same fallback-id family as empty-prefix handling. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into fallback-id test |
| `buildAutomationJobId uses "job" fallback when prefix is empty` | COLLAPSE | Same fallback-id family as empty-dedupe handling. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into fallback-id test |
| `buildAutomationJobId different keys produce different ids` | COLLAPSE | Same job-id contract family as deterministic hashing. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into deterministic/unique-id test |

## Normalization and Search Profile Helpers

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `normalizeAutomationStatus returns 'queued' for 'queued'` | COLLAPSE | Same canonical-status mapping family as running/done/failed/cooldown. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into status normalization test |
| `normalizeAutomationStatus returns 'running' for 'running'` | COLLAPSE | Same canonical-status mapping family as queued/done/failed/cooldown. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into status normalization test |
| `normalizeAutomationStatus returns 'done' for 'done'` | COLLAPSE | Same canonical-status mapping family as queued/running/failed/cooldown. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into status normalization test |
| `normalizeAutomationStatus returns 'failed' for 'failed'` | COLLAPSE | Same canonical-status mapping family as queued/running/done/cooldown. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into status normalization test |
| `normalizeAutomationStatus returns 'cooldown' for 'cooldown'` | COLLAPSE | Same canonical-status mapping family as queued/running/done/failed. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into status normalization test |
| `normalizeAutomationStatus is case-insensitive` | KEEP | Distinct case-normalization contract. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Preserved |
| `normalizeAutomationStatus returns queued for unknown` | COLLAPSE | Same fallback family as empty-string handling. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into status normalization test |
| `normalizeAutomationStatus returns queued for empty` | COLLAPSE | Same fallback family as unknown-status handling. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into status normalization test |
| `normalizeAutomationQuery trims and lowercases` | COLLAPSE | Same query-normalization family as whitespace collapse and empty fallback. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into query normalization test |
| `normalizeAutomationQuery collapses whitespace` | COLLAPSE | Same query-normalization family as trim/lowercase and empty fallback. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into query normalization test |
| `normalizeAutomationQuery returns empty string for empty input` | COLLAPSE | Same query-normalization family as trim/lowercase and whitespace collapse. | `automationQueueHelpers.idAndNormalizationContracts.test.js` | Merged into query normalization test |
| `buildSearchProfileQueryMaps returns empty maps for empty input` | COLLAPSE | Same empty-input family as no-argument behavior. | `automationQueueHelpers.searchProfileContracts.test.js` | Merged into empty-input test |
| `buildSearchProfileQueryMaps returns empty maps for no argument` | COLLAPSE | Same empty-input family as empty-object behavior. | `automationQueueHelpers.searchProfileContracts.test.js` | Merged into empty-input test |
| `buildSearchProfileQueryMaps builds queryToFields from query_rows` | COLLAPSE | Same query-to-fields derivation family as `field_target_queries` merge. | `automationQueueHelpers.searchProfileContracts.test.js` | Merged into query-mapping test |
| `buildSearchProfileQueryMaps merges field_target_queries into queryToFields` | COLLAPSE | Same query-to-fields derivation family as `query_rows` mapping. | `automationQueueHelpers.searchProfileContracts.test.js` | Merged into query-mapping test |
| `buildSearchProfileQueryMaps accumulates fieldStats from query_rows` | KEEP | Distinct field-stat accumulation contract. | `automationQueueHelpers.searchProfileContracts.test.js` | Preserved |
| `buildSearchProfileQueryMaps uses query_stats when available` | KEEP | Distinct query-stats override contract. | `automationQueueHelpers.searchProfileContracts.test.js` | Preserved |

## Proof

- Targeted replacement tests: `node --test src/features/indexing/api/builders/tests/automationQueueHelpers.priorityContracts.test.js src/features/indexing/api/builders/tests/automationQueueHelpers.listContracts.test.js src/features/indexing/api/builders/tests/automationQueueHelpers.idAndNormalizationContracts.test.js src/features/indexing/api/builders/tests/automationQueueHelpers.searchProfileContracts.test.js`
- Surrounding indexing API builder tests: `node --test src/features/indexing/api/builders/tests/*.test.js`
- Full suite: `npm test`

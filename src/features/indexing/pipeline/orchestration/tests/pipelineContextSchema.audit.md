# pipelineContextSchema.test.js Audit

Scope: `src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.test.js`

Policy:
- Preserve checkpoint acceptance/rejection contracts and validator enforcement behavior.
- Collapse repeated "missing required key" cases into table-driven tests at the checkpoint or sub-schema boundary.
- Retire tests that only re-prove already-covered valid-path behavior for an alternate enforcement mode.

## Checkpoint Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `pipelineContextSeed — accepts valid seed data` | KEEP | Canonical seed checkpoint acceptance contract. | `pipelineContextSchema.seedContracts.test.js` | Preserved |
| `pipelineContextSeed — rejects missing config` | COLLAPSE | Same required-seed-key failure family as missing `job` and `category`. | `pipelineContextSchema.seedContracts.test.js` | Merged into table-driven required-key test |
| `pipelineContextSeed — rejects missing job` | COLLAPSE | Same required-seed-key failure family as missing `config` and `category`. | `pipelineContextSchema.seedContracts.test.js` | Merged into table-driven required-key test |
| `pipelineContextSeed — rejects missing category` | COLLAPSE | Same required-seed-key failure family as missing `config` and `job`. | `pipelineContextSchema.seedContracts.test.js` | Merged into table-driven required-key test |
| `pipelineContextAfterBootstrap — accepts full Stage 01+02 merge` | KEEP | Primary bootstrap checkpoint acceptance contract. | `pipelineContextSchema.bootstrapContracts.test.js` | Preserved |
| `pipelineContextAfterBootstrap — accepts null brandResolution` | COLLAPSE | Variant of the same bootstrap acceptance family. | `pipelineContextSchema.bootstrapContracts.test.js` | Merged into bootstrap-variant acceptance test |
| `pipelineContextAfterBootstrap — rejects missing focusGroups` | COLLAPSE | Same missing-bootstrap-collection failure family as `missingFields`. | `pipelineContextSchema.bootstrapContracts.test.js` | Merged into table-driven required-key test |
| `pipelineContextAfterBootstrap — rejects missing missingFields` | COLLAPSE | Same missing-bootstrap-collection failure family as `focusGroups`. | `pipelineContextSchema.bootstrapContracts.test.js` | Merged into table-driven required-key test |
| `pipelineContextAfterProfile — accepts bootstrap + profile fields` | KEEP | Checkpoint acceptance contract for profile stage output. | `pipelineContextSchema.progressionContracts.test.js` | Preserved |
| `pipelineContextAfterProfile — rejects missing searchProfileBase` | KEEP | Distinct required profile payload boundary. | `pipelineContextSchema.progressionContracts.test.js` | Preserved |
| `pipelineContextAfterPlanner — accepts profile + enhancedRows` | KEEP | Planner checkpoint acceptance contract. | `pipelineContextSchema.progressionContracts.test.js` | Preserved |
| `pipelineContextAfterPlanner — rejects missing enhancedRows` | KEEP | Distinct planner-output requirement. | `pipelineContextSchema.progressionContracts.test.js` | Preserved |
| `pipelineContextAfterJourney — accepts planner + journey outputs` | KEEP | Journey checkpoint acceptance contract. | `pipelineContextSchema.progressionContracts.test.js` | Preserved |
| `pipelineContextAfterJourney — rejects missing queries` | COLLAPSE | Same missing-journey-key failure family as `executionQueryLimit`. | `pipelineContextSchema.progressionContracts.test.js` | Merged into table-driven required-key test |
| `pipelineContextAfterJourney — rejects missing executionQueryLimit` | COLLAPSE | Same missing-journey-key failure family as `queries`. | `pipelineContextSchema.progressionContracts.test.js` | Merged into table-driven required-key test |
| `pipelineContextAfterExecution — accepts journey + execution outputs` | KEEP | Execution checkpoint acceptance contract. | `pipelineContextSchema.executionContracts.test.js` | Preserved |
| `pipelineContextAfterExecution — rejects missing rawResults` | KEEP | Distinct execution-output requirement. | `pipelineContextSchema.executionContracts.test.js` | Preserved |
| `pipelineContextAfterExecution — rejects malformed rawResults element` | KEEP | Protects typed element wiring from execution checkpoint to raw-result schema. | `pipelineContextSchema.executionContracts.test.js` | Preserved |
| `pipelineContextAfterExecution — rejects malformed searchAttempts element` | KEEP | Protects typed element wiring from execution checkpoint to search-attempt schema. | `pipelineContextSchema.executionContracts.test.js` | Preserved |
| `pipelineContextAfterExecution — accepts null externalSearchReason` | KEEP | Nullability contract for execution search-reason state. | `pipelineContextSchema.executionContracts.test.js` | Preserved |
| `pipelineContextAfterResults — accepts execution + discoveryResult` | KEEP | Results checkpoint acceptance contract. | `pipelineContextSchema.discoveryContracts.test.js` | Preserved |
| `pipelineContextAfterResults — rejects missing discoveryResult` | KEEP | Distinct required-results payload boundary. | `pipelineContextSchema.discoveryContracts.test.js` | Preserved |
| `pipelineContextAfterResults — rejects discoveryResult without candidates` | KEEP | Protects nested discovery result wiring at the results checkpoint. | `pipelineContextSchema.discoveryContracts.test.js` | Preserved |
| `pipelineContextFinal — is identical to AfterResults` | KEEP | Final checkpoint should continue accepting the results payload shape unchanged. | `pipelineContextSchema.discoveryContracts.test.js` | Preserved |

## Sub-schema Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `rawResultElementSchema — requires url, provider, query` | KEEP | Distinct search-execution raw-result shape contract. | `pipelineContextSchema.executionContracts.test.js` | Preserved |
| `searchAttemptElementSchema — requires query, provider, result_count, reason_code` | KEEP | Distinct search-attempt shape contract. | `pipelineContextSchema.executionContracts.test.js` | Preserved |
| `searchJournalElementSchema — requires ts, query, provider, result_count` | KEEP | Distinct search-journal shape contract. | `pipelineContextSchema.executionContracts.test.js` | Preserved |
| `focusGroupElementSchema — rejects missing key` | COLLAPSE | Same focus-group required-key failure family as missing `field_keys`. | `pipelineContextSchema.bootstrapContracts.test.js` | Merged into required-key test |
| `focusGroupElementSchema — rejects missing field_keys` | COLLAPSE | Same focus-group required-key failure family as missing `key`. | `pipelineContextSchema.bootstrapContracts.test.js` | Merged into required-key test |
| `seedStatusSchema — rejects missing specs_seed` | COLLAPSE | Same nested seed-status requirement family as missing `specs_seed.is_needed`. | `pipelineContextSchema.bootstrapContracts.test.js` | Merged into nested seed-status test |
| `seedStatusSchema — rejects specs_seed without is_needed` | COLLAPSE | Same nested seed-status requirement family as missing `specs_seed`. | `pipelineContextSchema.bootstrapContracts.test.js` | Merged into nested seed-status test |
| `seedSearchPlanSchema — validates schema_version + planner + handoff` | KEEP | Canonical NeedSet search-plan acceptance contract. | `pipelineContextSchema.bootstrapContracts.test.js` | Preserved |
| `seedSearchPlanSchema — rejects missing planner` | COLLAPSE | Same seed-search-plan planner requirement family as missing `planner.mode`. | `pipelineContextSchema.bootstrapContracts.test.js` | Merged into planner requirement test |
| `seedSearchPlanSchema — rejects planner without mode` | COLLAPSE | Same seed-search-plan planner requirement family as missing `planner`. | `pipelineContextSchema.bootstrapContracts.test.js` | Merged into planner requirement test |
| `pipelineContextAfterBootstrap — accepts non-null seedSearchPlan` | COLLAPSE | Variant of the same bootstrap acceptance family. | `pipelineContextSchema.bootstrapContracts.test.js` | Merged into bootstrap-variant acceptance test |
| `queryRowSchema — requires query, hint_source, tier, target_fields` | KEEP | Distinct query-row shape contract for search profile data. | `pipelineContextSchema.progressionContracts.test.js` | Preserved |
| `searchProfileBaseSchema — rejects missing query_rows` | COLLAPSE | Same search-profile required-key failure family as missing `category`. | `pipelineContextSchema.progressionContracts.test.js` | Merged into required-key test |
| `searchProfileBaseSchema — rejects missing category` | COLLAPSE | Same search-profile required-key failure family as missing `query_rows`. | `pipelineContextSchema.progressionContracts.test.js` | Merged into required-key test |
| `candidateRowSchema — rejects missing url` | COLLAPSE | Same candidate required-key failure family as missing `provider`. | `pipelineContextSchema.discoveryContracts.test.js` | Merged into candidate-row contract test |
| `candidateRowSchema — rejects missing provider` | COLLAPSE | Same candidate required-key failure family as missing `url`. | `pipelineContextSchema.discoveryContracts.test.js` | Merged into candidate-row contract test |
| `candidateRowSchema — accepts null tier` | KEEP | Distinct nullable tier contract for candidate rows. | `pipelineContextSchema.discoveryContracts.test.js` | Preserved |
| `serpExplorerSchema — validates query_count + queries array` | KEEP | Canonical serp-explorer acceptance contract. | `pipelineContextSchema.discoveryContracts.test.js` | Preserved |
| `serpExplorerSchema — rejects missing queries array` | KEEP | Distinct required serp-explorer collection boundary. | `pipelineContextSchema.discoveryContracts.test.js` | Preserved |
| `discoveryResultSchema — rejects missing discoveryKey` | COLLAPSE | Same discovery-result top-level requirement family as missing `serp_explorer`. | `pipelineContextSchema.discoveryContracts.test.js` | Merged into top-level key test |
| `discoveryResultSchema — rejects missing serp_explorer` | COLLAPSE | Same discovery-result top-level requirement family as missing `discoveryKey`. | `pipelineContextSchema.discoveryContracts.test.js` | Merged into top-level key test |
| `discoveryResultSchema — rejects candidate without url` | KEEP | Distinct nested candidate validation contract inside discovery results. | `pipelineContextSchema.discoveryContracts.test.js` | Preserved |

## Cross-checkpoint and Validator Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `progressive extension — later checkpoints accept earlier data` | KEEP | Guards the monotonic-extension promise across checkpoints. | `pipelineContextSchema.progressionContracts.test.js` | Preserved |
| `passthrough — unknown fields do not cause validation failure` | COLLAPSE | Same passthrough family as preserving extra fields in parsed output. | `pipelineContextSchema.seedContracts.test.js` | Merged into passthrough contract test |
| `passthrough — extra fields preserved in parsed output` | COLLAPSE | Same passthrough family as accepting unknown fields. | `pipelineContextSchema.seedContracts.test.js` | Merged into passthrough contract test |
| `validatePipelineCheckpoint — returns valid for correct data` | COLLAPSE | Same success-path family as "does not log on success". | `pipelineContextSchema.validationContracts.test.js` | Merged into success-path validator test |
| `validatePipelineCheckpoint — returns errors for invalid data` | COLLAPSE | Same warn-path family as "logs warning on failure". | `pipelineContextSchema.validationContracts.test.js` | Merged into warn-path validator test |
| `validatePipelineCheckpoint — returns error for unknown checkpoint` | KEEP | Distinct unknown-checkpoint failure contract. | `pipelineContextSchema.validationContracts.test.js` | Preserved |
| `validatePipelineCheckpoint — logs warning on failure` | COLLAPSE | Same warn-path family as invalid-data return contract. | `pipelineContextSchema.validationContracts.test.js` | Merged into warn-path validator test |
| `validatePipelineCheckpoint — does not log on success` | COLLAPSE | Same success-path family as valid-data return contract. | `pipelineContextSchema.validationContracts.test.js` | Merged into success-path validator test |
| `enforce mode — throws on invalid data` | KEEP | Distinct enforcement-mode escalation contract. | `pipelineContextSchema.validationContracts.test.js` | Preserved |
| `enforce mode — does not throw on valid data` | RETIRE | Duplicate of the generic valid-path contract; enforce mode only changes failure behavior. | None | Deleted |
| `warn mode — does not throw on invalid data` | RETIRE | Default warn-path behavior is already protected by the invalid-data logger contract. | None | Deleted |
| `off mode — skips validation entirely` | KEEP | Distinct validation-bypass contract. | `pipelineContextSchema.validationContracts.test.js` | Preserved |

## Proof

- Targeted replacement tests: `node --test src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.seedContracts.test.js src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.bootstrapContracts.test.js src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.progressionContracts.test.js src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.executionContracts.test.js src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.discoveryContracts.test.js src/features/indexing/pipeline/orchestration/tests/pipelineContextSchema.validationContracts.test.js`
- Surrounding orchestration tests: `node --test src/features/indexing/pipeline/orchestration/tests/*.test.js`
- Full suite: `npm test`

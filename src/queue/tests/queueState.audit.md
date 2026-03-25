# queueState.test.js Audit

Scope: `src/queue/tests/queueState.test.js`

Policy:
- Preserve queue-state contracts that protect retry/backoff behavior, stale detection, corrupt-state recovery, identity-gated input sync, SpecDb migration, queue ordering, and SpecDb facade/lifecycle behavior.
- Collapse backend-duplicate JSON and SpecDb cases into single stronger contract files where both adapters must honor the same public queue-state rule.
- Retire wrapper-only SpecDb delegation checks when the real removal or selection behavior is already protected by `src/queue/tests/queueStorageAdapter.test.js`.

## Ordering Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `selectNextQueueProduct skips paused and future-retry rows` | KEEP | Distinct in-memory queue ordering contract for paused and delayed rows. | `src/queue/tests/queueStateOrderingContracts.test.js` | Preserved |
| `listQueueProducts via specDb returns sorted rows` | KEEP | Public queue listing contract still needs read-side ordering and filtering coverage. | `src/queue/tests/queueStateOrderingContracts.test.js` | Preserved |
| `selectNextQueueProduct via specDb delegates to SQL selection` | RETIRE | Wrapper-only duplication of adapter-backed top-row selection already covered by `src/queue/tests/queueStorageAdapter.test.js`. | None | Deleted |

## Retry and Stale Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `recordQueueFailure applies exponential retry and then hard-fails at max attempts` | COLLAPSE | Same public retry rule as the SpecDb path. | `src/queue/tests/queueStateRetryContracts.test.js` | Merged into cross-adapter retry contract |
| `recordQueueFailure via specDb applies retry backoff` | COLLAPSE | Same public retry rule as the JSON path. | `src/queue/tests/queueStateRetryContracts.test.js` | Merged into cross-adapter retry contract |
| `markStaleQueueProducts marks old complete rows as stale` | COLLAPSE | Same public stale-marking rule as the SpecDb path. | `src/queue/tests/queueStateStaleContracts.test.js` | Merged into cross-adapter stale contract |
| `markStaleQueueProducts via specDb patches stale rows` | COLLAPSE | Same public stale-marking rule as the JSON path. | `src/queue/tests/queueStateStaleContracts.test.js` | Merged into cross-adapter stale contract |

## Storage and Sync Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `loadQueueState recovers from corrupt queue state json and allows rewrite on upsert` | KEEP | Unique JSON recovery contract for corrupt queue-state files. | `src/queue/tests/queueStateStorageRecoveryContracts.test.js` | Preserved |
| `syncQueueFromInputs applies identity gate and skips conflicting variant files` | KEEP | Unique queue-ingest contract for identity-gated input sync. | `src/queue/tests/queueStateInputSyncContracts.test.js` | Preserved |

## SpecDb Facade and Lifecycle Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `migrateQueueEntry removes old sqlite queue row when specDb is present` | KEEP | Unique migration contract for renamed SpecDb-backed queue rows. | `src/queue/tests/queueStateMigrationContracts.test.js` | Preserved |
| `loadQueueState via specDb returns normalized products` | COLLAPSE | Read normalization belongs with the matching SpecDb write-through facade contract. | `src/queue/tests/queueStateSpecDbFacadeContracts.test.js` | Merged into facade contract |
| `upsertQueueProduct via specDb reads, merges, and writes back` | COLLAPSE | Write-merge behavior belongs with the matching SpecDb read facade contract. | `src/queue/tests/queueStateSpecDbFacadeContracts.test.js` | Merged into facade contract |
| `recordQueueRunResult via specDb accumulates cost and updates status` | COLLAPSE | Run-result accumulation is part of the same public lifecycle as marking a row running. | `src/queue/tests/queueStateSpecDbLifecycleContracts.test.js` | Merged into lifecycle contract |
| `markQueueRunning via specDb sets running status and timestamps` | COLLAPSE | Running-state stamping is part of the same public lifecycle as recording a run result. | `src/queue/tests/queueStateSpecDbLifecycleContracts.test.js` | Merged into lifecycle contract |
| `clearQueueByStatus via specDb removes matching rows` | RETIRE | Wrapper-only duplication of adapter deletion semantics already covered by `src/queue/tests/queueStorageAdapter.test.js`. | None | Deleted |

## Proof

- Targeted replacement tests: `node --test src/queue/tests/queueState*.test.js`
- Surrounding queue tests: `node --test src/queue/tests/*.test.js`
- Full suite: `npm test`

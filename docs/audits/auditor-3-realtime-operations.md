# Auditor 3 - Realtime, WebSocket, Operations, Runtime Transport

Date: 2026-04-28

## Ownership

Auditor 3 owns realtime and operations transport:

- WebSocket receive-side validation.
- Operations store and operation lifecycle UI.
- Realtime bridge cache lifecycle.
- Process-status payload normalization.
- Connection status and heartbeat behavior.
- LLM stream chunk handling.

Do not edit persistence/rebuild contracts owned by Auditor 1 or broad frontend page UX owned by Auditor 2 unless the work is directly required by realtime transport.

## Current Audit Snapshot

Verification refreshed again on 2026-04-28 during the performance audit:

| Command | Result |
|---|---|
| `node --test --test-force-exit --experimental-test-module-mocks tools/gui-react/src/pages/layout/hooks/__tests__/wsEventPayloadValidation.test.js tools/gui-react/src/pages/layout/hooks/__tests__/useWsEventBridgeContracts.test.js tools/gui-react/src/api/__tests__/wsIdleWatchdog.test.ts tools/gui-react/src/pages/layout/__tests__/wsConnectionStatus.test.ts tools/gui-react/src/pages/overview/__tests__/bulkDispatch.test.ts tools/gui-react/src/pages/overview/__tests__/pipelineController.test.ts src/app/api/tests/apiRealtimeBridgeWiring.test.js src/app/api/tests/apiRealtimeBridgeHeartbeat.test.js` | PASS: 70 tests, 0 failed. |
| `node --test --test-isolation=none src/app/api/tests/catalogHelpersSqlPath.test.js src/app/api/tests/catalogHelpersLastRun.test.js src/core/finder/tests/finderSqlStore.test.js src/db/tests/variantStore.test.js src/db/stores/tests/pifVariantProgressStore.test.js src/db/tests/pooledEvidenceStatements.test.js` | PASS: 80 tests, 0 failed. |
| `npm test` | CURRENTLY RED: 12,699 tests, 12,691 passed, 8 failed. Current unrelated failures are keyboard/monitor runtime contract assertions, category-audit contract schema catalog, and Studio docs controller contracts. |
| `npm run gui:check` | PASS. |
| M9 focused direct-import proof | PASS: operation status contract tests, operations registry queued-retention regression, frontend operations selectors/store/hooks, and `npm run gui:check`. Normal `npm test -- <files>` was blocked by sandbox `spawn EPERM` before module load. |
| M10 focused direct-import proof | PASS: fire-and-forget terminal data-change correlation, manual publisher/PIF terminal emitters, and WS bridge suppression tests; broader WS validation/status-contract direct imports pass; `npm run gui:check` passes. Normal `node --test <files>` remains blocked by sandbox `spawn EPERM` before module load. |
| L8 focused direct-import proof | PASS: `useFireAndForget` POST rejection keeps a terminal error stub; Overview bulk dispatch retains failed optimistic stubs; adjacent operations store/hook/pipeline checks pass; targeted TypeScript check for changed files passes. |

The earlier high-priority realtime findings are code/test closed. Remaining Auditor 3 work is now low cleanup and proof polish; do not redo H7/H8/H9/H10/H13/H17/M9/M10/M36/M37/L8 unless new regressions appear.

## Performance Optimization Audit

Full read-only audit completed on 2026-04-28 after the realtime pass. Scope widened from pure realtime transport to real runtime/UI scaling risks because the next work request is optimization-focused.

### Closed Optimization

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| P1 | Overview/catalog SQL builder performed product-scoped reads inside the per-product render loop | `src/app/api/catalogHelpers.js` | DONE: full catalog builds now batch category projections once for candidates, variants, PIF progress, CEF run counts, resolved key fields, and concrete-evidence bucket counts. Single-row catalog reads still use product-scoped reads. |
| P2 | Key Finder duplicates global data-change invalidation when mounted | `tools/gui-react/src/features/key-finder/components/KeyFinderPanel.tsx` | DONE: removed the panel-level data-change subscription; the AppShell/global WS bridge remains the single broad cache invalidation owner. |
| P4 | Storage run detail pagination is backend-wired but UI does not request or reveal pages | storage manager UI | DONE: expanded run detail now requests bounded source pages and shows a load-more control from `sources_page` metadata. |
| P5 | Product update/delete still scan `getAllProducts().find(...)` | `src/features/catalog/products/productCatalog.js` | DONE: update/remove existence checks now use `specDb.getProduct(productId)` with a fallback only for older mocks. |
| P6 | Authority snapshot has both 10s polling and data-change invalidation | `tools/gui-react/src/hooks/useAuthoritySnapshot.js` | DONE: data-change remains the freshness path; background polling is now a 60s fallback with an explicit override hook option. |
| P7 | `reviewLayoutByCategory` appears to be delete-only production state | review/studio API context | DONE: production source no longer creates, passes, or deletes this dead cache handle. |

Evidence:

- `buildCatalogFromSql` previously iterated all products, then `buildCatalogRowFromSql` called product-scoped readers for candidates, CEF runs, PIF variants, SKU/RDF variants, and key-tier progress.
- `buildKeyTierProgress` previously looped compiled fields per product and used product-field point lookups for resolved/concrete evidence.
- Overview table rendering already uses virtualization, so the strongest confirmed bottleneck is backend projection, not DOM row count.
- Key Finder summary projection was also tightened during follow-up work: summary reads use lean run rows and batch top-candidate lookups per product instead of per-field point lookups.
- Focused proof after this pass: 88 GUI realtime/data-change/Authority/Key Finder tests, GUI `tsc -b`, 76 catalog/process/Studio/Review tests, 183 Key Finder/backend tests, 29 Catalog/Overview tests, and 66 Storage/UI/data-change route tests all passed.

### Medium Priority Optimization

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| P3 | Runtime Ops mixes push invalidation with short polling intervals | `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx` | Deferred per user priority; runtime is not actively used much. |

### Low Priority Optimization / Cleanup

No active non-deferred low-priority optimization items remain from the performance pass.

### Explicit Non-Targets

- Do not prioritize reconnect-wide `queryClient.invalidateQueries()` in `App.tsx`; it is broad but rare and useful as recovery behavior.
- Do not virtualize Publisher before measuring; it pages at 100 rows and supports expanded rows.
- Do not chase BrandManager/ProductManager table virtualization until row counts show visible UI cost.
- Do not add sandbox-only Vite/build tooling for `spawn EPERM` or unrelated syntax failures.

## Critical Priority

No active critical realtime/operations transport findings remain after this audit.

## High Priority

No active high-priority realtime/operations transport findings remain after this audit.

## Closed Since Last Audit

| ID | Issue | Primary Area | Work Shape | Proof |
|---|---|---|---|---|
| H7 | Malformed WS payloads need adversarial store-safety tests | WS validation / UI store safety | DONE: malformed operations, data-change, and stream payloads are rejected before store/cache mutation. | Focused realtime suite passes. |
| H8 | Operations WS messages lack runtime shape validation | WS operations channel | DONE: `resolveOperationsWsMessage` guards upsert/remove/call messages. | Validator tests cover valid and invalid payloads. |
| H9 | Receive-side WS validation is inconsistent across channels | WS channel validation | DONE for state-mutating channels: events, process, process-status, indexlab-event, operations, llm-stream, and data-change. | Positive/negative validation coverage passes. |
| H10 | Screencast frame cache is unbounded | Realtime bridge cache lifecycle | DONE: bridge has a configurable frame cache limit and oldest-entry eviction. | Realtime bridge cache tests pass in full suite. |
| H13 | WS disconnect/reconnect state is silent | WS connection UX | DONE by code/test: connection status snapshot, status subscribers, AppShell badge, idle watchdog, reconnect callbacks. | Unit proof passes; capture GUI screenshots before phase-close if strict GUI proof is required. |
| H17 | Run-All fan-out is not visually synchronous | Operations queue UX | DONE by code/test: bulk dispatch pre-inserts optimistic operation stubs before first request resolves. | `bulkDispatch.test.ts` focused proof passes; GUI screenshot is proof-only follow-up if needed. |
| L8 | Optimistic operation stub can vanish silently on POST failure | Operations optimistic UI | DONE: failed single-action and bulk optimistic dispatch stubs become terminal `error` operations with inline error text instead of being removed silently; terminal failed stubs are excluded from active counts. | Focused hook and bulk dispatch regressions pass; targeted TypeScript check for changed files passes. |
| M9 | Process-status and operations state have semantic drift | Operations / process status | DONE: named operation status contracts define UI-active `queued + running`, resource-running `running`, terminal `done/error/cancelled`; process status remains a separate child-process contract. | Focused status contract tests pass; operations registry regression proves queued ops are retained during terminal eviction; frontend selector/store/hook checks and `npm run gui:check` pass. |
| M10 | Data-change does not suppress completed operations | Operations / data-change correlation | DONE: terminal `fireAndForget` data-change payloads and manual publisher/PIF terminal emitters stamp `meta.operationId` + terminal `meta.operationStatus`; the WS bridge removes only locally still-active correlated operations and ignores uncorrelated, non-terminal, or already-terminal messages. | Focused fire-and-forget, route, and WS bridge contract tests pass; `npm run gui:check` passes. |
| M36 | Process-status payload naming is mixed snake/camel | WS process-status schema | DONE: WS process-status payloads normalize aliases at receive boundary and reject conflicting alias values. | Validator and bridge contract tests pass. |
| M37 | WS channel handlers need local try/catch isolation | WS handler robustness | DONE: `WsManager` isolates each `onMessage` subscriber and logs handler failures without blocking later subscribers. | Idle watchdog/message dispatch tests pass. |

## Medium Priority

No active medium-priority realtime/operations transport findings remain after this audit.

## Low Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| L9 | LLM stream chunks are lost on WS drop | Operations stream preview | Accept unless stream continuity becomes a requirement. |
| L40 | Runtime event interface is loose | Runtime event typing | Tighten when touching runtime event consumers. |
| L42 | Test-progress WS channels are unused or partially wired | WS channel cleanup | Remove unused channel types/subscriptions or document owner. |
| L44 | Realtime GUI proof screenshots were not captured in this audit | WS/operations UX proof | If this phase needs formal GUI proof, capture connected/reconnecting/offline status and bulk optimistic preinsert screenshots without changing code. |

## Coordination Rules

- Auditor 3 owns WS payload validation and operation state. If a fix requires backend payload changes, coordinate the contract with Auditor 1.
- If a fix requires new visible UI surfaces beyond connection/operation status, coordinate layout and primitives with Auditor 2.
- Do not change storage/rebuild/finder persistence code unless a realtime contract requires it and Auditor 1 agrees.

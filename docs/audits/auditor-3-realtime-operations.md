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

Verification refreshed on 2026-04-28:

| Command | Result |
|---|---|
| `npm test -- tools/gui-react/src/pages/layout/hooks/__tests__/wsEventPayloadValidation.test.js tools/gui-react/src/pages/layout/hooks/__tests__/useWsEventBridgeContracts.test.js tools/gui-react/src/api/__tests__/wsIdleWatchdog.test.ts tools/gui-react/src/pages/layout/__tests__/wsConnectionStatus.test.ts tools/gui-react/src/pages/overview/__tests__/bulkDispatch.test.ts src/app/api/tests/apiRealtimeBridgeHeartbeat.test.js` | PASS: 58 tests, 0 failed. |
| `npm test` | RED overall, but no remaining Auditor 3-owned failures were found in the refreshed failure list. |
| `npm run gui:check` | PASS. |

The earlier high-priority realtime findings are code/test closed. Remaining Auditor 3 work is now medium/low cleanup and proof polish; do not redo H7/H8/H9/H10/H13/H17 unless new regressions appear.

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

## Medium Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| M9 | Process-status and operations state have semantic drift | Operations / process status | Define one ownership contract for running/completed/error/queue counts. |
| M10 | Data-change does not suppress completed operations | Operations / data-change correlation | Only after repro, correlate operation ids or targets to terminal data-change events. |
| M36 | Process-status payload naming is mixed snake/camel | WS process-status schema | Normalize at the WS boundary and keep internal shape consistent. |
| M37 | WS channel handlers need local try/catch isolation | WS handler robustness | Wrap per-channel handling and log rejects without state mutation. |

## Low Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| L8 | Optimistic operation stub can vanish silently on POST failure | Operations optimistic UI | Keep failed stub briefly and show toast or inline error. Coordinate toast surface with Auditor 2. |
| L9 | LLM stream chunks are lost on WS drop | Operations stream preview | Accept unless stream continuity becomes a requirement. |
| L40 | Runtime event interface is loose | Runtime event typing | Tighten when touching runtime event consumers. |
| L42 | Test-progress WS channels are unused or partially wired | WS channel cleanup | Remove unused channel types/subscriptions or document owner. |
| L44 | Realtime GUI proof screenshots were not captured in this audit | WS/operations UX proof | If this phase needs formal GUI proof, capture connected/reconnecting/offline status and bulk optimistic preinsert screenshots without changing code. |

## Coordination Rules

- Auditor 3 owns WS payload validation and operation state. If a fix requires backend payload changes, coordinate the contract with Auditor 1.
- If a fix requires new visible UI surfaces beyond connection/operation status, coordinate layout and primitives with Auditor 2.
- Do not change storage/rebuild/finder persistence code unless a realtime contract requires it and Auditor 1 agrees.

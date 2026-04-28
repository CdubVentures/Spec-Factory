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

## High Priority

| ID | Issue | Primary Area | Work Shape | Proof |
|---|---|---|---|---|
| H7 | Malformed WS payloads need adversarial store-safety tests | WS validation / UI store safety | Add malformed fixtures for operations, data-change, and stream payloads; assert Zustand/query cache state is not corrupted. | Adversarial tests pass. |
| H8 | Operations WS messages lack runtime shape validation | WS operations channel | Add runtime guards for operation upsert/remove messages. | Validator tests cover valid and invalid payloads. |
| H9 | Receive-side WS validation is inconsistent across channels | WS channel validation | Add small validators for externally received channels, starting with state-mutating channels. | Each changed channel has positive and negative validation coverage. |
| H10 | Screencast frame cache is unbounded | Realtime bridge cache lifecycle | Add LRU, TTL, or lifecycle cleanup while preserving latest active frame behavior. | Unit test or characterization proves eviction/cleanup. |
| H13 | WS disconnect/reconnect state is silent | WS connection UX | Add connection status state and expose it for UI display. Coordinate visual placement with Auditor 2. | GUI proof for connected/reconnecting/offline states. |
| H17 | Run-All fan-out is not visually synchronous | Operations queue UX | Pre-insert expected optimistic operation stubs before dispatching requests. | GUI proof that selected rows show queued/running immediately. |

## Medium Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| M9 | Process-status and operations state have semantic drift | Operations / process status | Define one ownership contract for running/completed/error/queue counts. |
| M10 | Data-change does not suppress completed operations | Operations / data-change correlation | Only after repro, correlate operation ids or targets to terminal data-change events. |
| M36 | Process-status payload naming is mixed snake/camel | WS process-status schema | Normalize at the WS boundary and keep internal shape consistent. |
| M37 | WS channel handlers need local try/catch isolation | WS handler robustness | Wrap per-channel handling and log rejects without state mutation. |
| M38 | LLM stream chunks need stronger validation | WS LLM stream schema | Validate chunk shape and size before append. |

## Low Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| L8 | Optimistic operation stub can vanish silently on POST failure | Operations optimistic UI | Keep failed stub briefly and show toast or inline error. Coordinate toast surface with Auditor 2. |
| L9 | LLM stream chunks are lost on WS drop | Operations stream preview | Accept unless stream continuity becomes a requirement. |
| L40 | Runtime event interface is loose | Runtime event typing | Tighten when touching runtime event consumers. |
| L41 | Data-change validation is stronger server-side than UI-side | Data-change UI guard | Add defensive UI-side guard. |
| L42 | Test-progress WS channels are unused or partially wired | WS channel cleanup | Remove unused channel types/subscriptions or document owner. |
| L43 | Heartbeat handling is implicit | WS heartbeat state | Pair heartbeat state with connection status work. |

## Coordination Rules

- Auditor 3 owns WS payload validation and operation state. If a fix requires backend payload changes, coordinate the contract with Auditor 1.
- If a fix requires new visible UI surfaces beyond connection/operation status, coordinate layout and primitives with Auditor 2.
- Do not change storage/rebuild/finder persistence code unless a realtime contract requires it and Auditor 1 agrees.

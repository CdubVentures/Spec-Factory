# WebSocket Channel + Schema Audit

Date: 2026-04-27
Worst severity: **HIGH** — every WS channel except `data-change` is consumed without runtime shape validation; one bad message can corrupt the operations Zustand store silently.

## Channel inventory

| Channel | Backend emitter | Frontend handler | Backend validates? | Frontend validates? |
|---|---|---|---|---|
| `events` | `realtimeBridge.js` | `useWsEventBridge.ts:113` | ✗ | only `Array.isArray` |
| `process` | `processRuntime.js` | `useWsEventBridge.ts` | ✗ | `Array.isArray` |
| `process-status` | `processRuntime.js` | `useWsEventBridge.ts:108–112` | ✗ | `typeof === 'object'` |
| `indexlab-event` | `realtimeBridge.js` | `useWsEventBridge.ts:113` | ✗ | `Array.isArray` |
| `operations` | `core/operations/operationsRegistry.js:113–131` | `useWsEventBridge.ts:116–129` | ✗ | only `isFullLlmCallRecord` for one branch |
| `llm-stream` | `core/llm/streamBatcher.js` | `useWsEventBridge.ts:130–149` | ✗ | `operationId && text` only |
| `data-change` | many | `useWsEventBridge.ts:150–174` | ✓ `isDataChangePayload` | ✗ (cast only) |
| `heartbeat` | `realtimeBridge.js:234` | implicit (resets idle timer in `ws.ts`) | n/a | n/a |
| `screencast-*` (dynamic) | `realtimeBridge.js:137–144` | base64 frame consumer | ✗ | basic frame check |

### Orphaned channels (declared but never emitted)
- `test-import-progress`
- `test-run-progress`
- `test-repair-progress`

Declared in `tools/gui-react/src/api/ws.ts` Channel type; subscribed in `useWsEventBridge.ts:178`; backend emits zero. Dead code from an old feature.

## Identified gaps

### G1. Operations channel has no shape validation — **HIGH**
**Files:** `src/core/operations/operationsRegistry.js:113–131`, `tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts:116–129`
Frontend casts the message and calls `store.upsert(operation)` with whatever shape arrives. A corrupted/spoofed message with `stages: null`, `currentStageIndex: 'invalid'`, `status: 'invalid_status'` lands in the Zustand store and breaks every consumer.

**Fix shape:** define a zod (or ajv) schema for each `action` (`upsert`, `remove`, `llm-call-append`, `llm-call-update`); validate before any store call; log+drop on failure.

### G2. No receive-side validation on any channel — HIGH
**File:** `tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts`
Backend validates `data-change` only. All other channels rely on TypeScript `as` casts (zero runtime enforcement). Silent corruption is possible across `events`, `process-status`, `indexlab-event`, `llm-stream`.

**Fix shape:** add per-channel zod schemas (or hand-rolled type guards) that mirror the frontend types; route every handler through the validator; emit a single `wsRejected` telemetry counter.

### G3. Process-status field naming dual snake/camel — MEDIUM
**Files:** `tools/gui-react/src/types/events.ts:12–30`, `useWsEventBridge.ts:108–112`
Type allows both `run_id`/`runId`, `product_id`/`productId`, etc. Backend emits whichever the source uses; consumers must read both forms (`status?.runId || status?.run_id`). Code that reads only one form silently misses values.

**Fix shape:** normalize to camelCase on receive; collapse the type to a single field set; keep server-side conversion in one bridge function.

### G4. Screencast frame cache unbounded — HIGH
**File:** `src/app/api/realtimeBridge.js:137–144`
`lastScreencastFrames` Map keyed by `${runId}::${workerId}` keeps base64 frames forever. Long runs × many workers × many pages = potential GB-scale RAM growth.

**Fix shape:** LRU with hard cap (e.g. 1 000 entries) or TTL eviction (e.g. 60 s). Add a metric.

### G5. No try/catch around per-channel handlers — MEDIUM
**File:** `useWsEventBridge.ts:101–175`
Each `if (channel === ...)` branch directly calls a Zustand store method. If one throws (memory cap, bad schema in already-stored data), the rest of `handleWsMessage` exits and other channels in the same WS frame are dropped.

**Fix shape:** wrap each branch in a `try { ... } catch (e) { logRejected(channel, e); }` block. Continue.

### G6. LLM-stream chunks accumulated without validation — MEDIUM
**File:** `useWsEventBridge.ts:130–149`
Only checks `operationId && text`; everything else (`callId`, `lane`, `label`, `channel`) is accepted. Corrupted chunks pollute `callStreamBufRef`.

**Fix shape:** add `isLlmCallStreamChunk` validator before append.

### G7. Loose `RuntimeEvent` interface — LOW
**File:** `tools/gui-react/src/types/events.ts:1–10`
`[key: string]: unknown` open-record. No required-field guard. Acceptable for log lines; risky if business logic ever conditions on a field.

**Fix shape:** add narrow guards in any handler that branches on a specific event field.

### G8. Data-change validation is one-sided — LOW
Backend validates before broadcast; frontend trusts. Defense-in-depth would re-validate on receive.

**Fix shape:** export `isDataChangePayload` to frontend (or copy the predicate) and run it as the receive guard. Cheap and removes a class of bug.

### G9. Three orphaned channels still subscribed — LOW
`test-import-progress`, `test-run-progress`, `test-repair-progress` — dead code.

**Fix shape:** drop from the Channel type union and subscription list.

### G10. No explicit heartbeat handler — LOW
`heartbeat` resets the idle timer implicitly via `onmessage`. No observability for missed heartbeats.

**Fix shape:** explicit handler in `useWsEventBridge` that increments a counter; warn after N missed.

## Confirmed-good patterns

- Single subscription model (`{ subscribe: [], category, productId }`); resent on reconnect.
- Heartbeat ping bypasses the channel filter (correct).
- WS reconnect runs all reconnect handlers and re-subscribes channels.
- 75 ms data-change scheduler + 150 ms llm-stream coalescer prevent thundering-herd UI updates.
- JSON.parse error guard in `ws.ts:115` keeps the socket alive on bad frames.

## Subscription / reconnect model

- Client subscribes once: `{ subscribe: [...channels], category?, productId? }`.
- Server stores `_channels` per client; broadcasts filtered.
- On reconnect, ws.ts:95–105 re-runs subscription + resets handlers. Caches invalidate via the reconnect handler list.

## Recommended fix order

1. **G1** — operations message validator (highest user-impact channel).
2. **G5** — try/catch around channel handlers (one bad branch shouldn't kill others).
3. **G4** — bound screencast cache.
4. **G2** — wider receive-side validators.
5. **G3** — normalize process-status field naming.
6. **G6** — llm-stream chunk validator.
7. **G9** — drop orphaned channels.
8. **G7, G8, G10** — defense-in-depth + cleanup.

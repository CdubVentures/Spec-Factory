# WebSocket Channel + Schema Audit

Date: 2026-04-28
Current severity: **HIGH**

## Scope

Reconnect behavior has improved, but receive-side runtime validation remains thin. Bad WS payloads can still corrupt local UI state or break handlers.

## Active Findings

### G1. Operations channel lacks runtime shape validation - HIGH

Operation upsert/remove payloads are trusted too early at the UI boundary.

**Fix shape:** Add runtime guards for operation upsert/remove messages before mutating Zustand.

### G2. Receive-side validation is inconsistent across channels - HIGH

Many channel handlers rely on TypeScript casts rather than runtime checks.

**Fix shape:** Add small validators per externally received channel, starting with high-write channels.

### G3. Screencast frame cache is unbounded - HIGH
**File:** `src/app/api/realtimeBridge.js`

`lastScreencastFrames` can grow during long runs.

**Fix shape:** Cap with LRU or TTL and clear by run/session lifecycle.

### G4. Process-status payload naming is dual snake/camel - MEDIUM

Payloads carry or consume mixed naming conventions.

**Fix shape:** Normalize at the boundary and keep internal shape consistent.

### G5. Channel handlers need local try/catch isolation - MEDIUM

One bad handler branch can disrupt other message handling.

**Fix shape:** Wrap per-channel handling and log rejected messages without mutating state.

### G6. LLM stream chunks are accumulated without enough validation - MEDIUM

Stream text/chunk messages can be malformed.

**Fix shape:** Validate chunk shape and size before append.

### G7. Runtime event interface is loose - LOW

Generic runtime event typing reduces confidence in consumers.

**Fix shape:** Tighten types only when touching runtime event consumers.

### G8. Data-change validation is stronger server-side than UI-side - LOW

The UI still benefits from a small guard before resolving invalidation keys.

**Fix shape:** Add a defensive UI-side data-change guard.

### G9. Test-progress channels are unused or partially wired - LOW

Frontend types include `test-import-progress`, `test-run-progress`, and `test-repair-progress`; active backend emitters were not found in this audit pass.

**Fix shape:** Remove unused channel types/subscriptions or document their owner.

### G10. Heartbeat handling is implicit - LOW

Connection health is not modeled as explicit UI state.

**Fix shape:** Pair heartbeat handling with the Loading/Error UX connection status work.

## Recommended Fix Order

1. **G1** - Operations message validator.
2. **G3** - Bound screencast cache.
3. **G2/G5** - Wider validators and handler isolation.
4. **G4/G6** - Normalize process status and stream chunks.
5. **G7/G8/G9/G10** - Cleanup and defense-in-depth.

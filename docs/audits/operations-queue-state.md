# Operations / Queue / Process-Status State Audit

Date: 2026-04-28
Current severity: **MEDIUM-HIGH**

## Scope

Reconnect now rehydrates operations. Remaining issues are visual batch feedback, state ownership semantics, and clearer failure handling.

## Active Findings

### G1. Run-All fan-out is not visually synchronous - MEDIUM-HIGH
**File:** `tools/gui-react/src/pages/overview/CommandConsole.tsx`

Bulk dispatch posts sequentially/staggered, so selected rows appear as active one at a time. Users can interpret the lag as missed dispatches.

**Fix shape:** Pre-insert all expected optimistic operation stubs before dispatching network requests.

### G2. Process-status vs operations state has semantic drift - MEDIUM

Running/completed/error state is spread across operation records, process status, and module-specific UI selectors.

**Fix shape:** Document the ownership contract or extend the process-status shape so queue counts and terminal status have one clear owner.

### G3. Data-change does not suppress completed operations - MEDIUM

A completed data-change can prove the underlying field/product changed, but operations remain visible until their own terminal message arrives.

**Fix shape:** Only after a concrete UX repro, correlate operation ids or product/module targets to terminal data-change events.

### G4. Optimistic operation stub can vanish silently on POST failure - LOW-MEDIUM

If the POST fails after creating an optimistic stub, the user can lose the visible operation without a clear error state.

**Fix shape:** Keep a failed stub briefly and show a toast or inline error.

### G5. LLM stream chunks are lost on WS drop - LOW

In-flight stream preview chunks are transient. A reconnect restores operation summaries, not necessarily partial stream text.

**Fix shape:** Accept unless stream continuity becomes a user-facing requirement.

## Recommended Fix Order

1. **G1** - Pre-insert bulk operation stubs.
2. **G2** - Define process-status vs operations ownership.
3. **G4** - Show failed optimistic stubs.
4. **G3** - Only if terminal-operation lag is reproduced.
5. **G5** - Defer.

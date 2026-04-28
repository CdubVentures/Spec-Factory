# Operations / Queue / Process-Status State Audit

Date: 2026-04-27
Worst severity: **MEDIUM** — bulk Run-All fan-out reveals visual lag; WS reconnect doesn't re-sync the operations store.

## State architecture

Hybrid push + pull:
- Frontend SSOT: `useOperationsStore` (Zustand, immutable Map keyed by op id).
- Backend authority: `src/core/operations/operationsRegistry.js` (in-memory).
- Transport: WS `operations` channel for live mutations + initial `GET /api/operations` hydration on mount.
- `process-status` is a **separate** signal (CLI process running/idle), independent from operations.

## Selectors

| Selector | File | Use |
|---|---|---|
| `selectRunningProductIds` | `features/operations/hooks/useFinderOperations.ts:162–174` | Visual spinners (running only) |
| `selectActiveModulesByProduct` | same:240–268 | Collision detection (running + queued) |
| `useIsModuleRunning` | same | Sidebar widget, badges |

Splitting "running only" (visual) from "running+queued" (logic) is intentional and correct.

## Identified gaps

### G1. Process-status vs operations semantic drift — MEDIUM
**Files:** `src/app/api/routes/infra/processRoutes.js:106–113`, `tools/gui-react/src/hooks/useProcessStatusQuery.ts`, `useWsEventBridge.ts:108–112`
`processStatus.running` is binary CLI-process state. Operations can be queued while no CLI process exists. Two parallel sources (5 s poll + WS push) can disagree mid-cycle.

**Fix shape:** add `queued_operation_count` to the process-status shape, or document the semantic split in the UI; keep one as authoritative.

### G2. Run-All fan-out not visually synchronous — MEDIUM-HIGH
**Files:** `pages/overview/bulkDispatch.ts:80+`, `features/operations/hooks/useFinderOperations.ts:197–225`
"Run All N products" stagger-POSTs at ~50 ms intervals; spinners light up serially. New users expect synchronous lighting.

**Fix shape:** in `bulkDispatch`, optimistically insert all N stubs before the first POST, or display a "queued" pending state for not-yet-dispatched ids.

### G3. `data-change` doesn't suppress completed operations — MEDIUM
**Files:** `useWsEventBridge.ts:150–174`, `operationsStore.ts:342–351`
When a field is published via manual override, the corresponding finder operation can stay in the store as "running" until its own server completion message arrives. No data-change → operation correlation.

**Fix shape:** in the data-change handler, find operations matching `(productId, finder)` and clear them when the field is resolved by a manual override.

### G4. Optimistic stub vanishes silently on POST failure — LOW-MEDIUM
**File:** `bulkDispatch.ts:59–99`
On network failure, the temp stub is removed → spinner disappears with no UI distinction from "completed". User reads it as cancelled.

**Fix shape:** surface a toast on stub removal due to error, or show a "failed" state briefly before removing.

### G5. WS reconnect doesn't re-sync operations store — MEDIUM
**Files:** `api/ws.ts:80–107`, `useWsEventBridge.ts:177–181`, `useOperationsHydration.ts`
Reconnect handlers invalidate React Query caches but don't refetch operations or clear the store. If an op completed during a 10-second drop, the store keeps it as running.

**Fix shape:** add `useOperationsHydration` refetch (or an explicit clear) to the reconnect handler list.

### G6. LLM stream chunks lost on WS drop — LOW
**File:** `useWsEventBridge.ts:44–76`
150 ms stream buffer is lost on disconnect. Run artifacts have full text, so this is a UI-only loss.

**Fix shape:** acceptable trade-off; document it.

## Confirmed-good patterns

- Single Zustand SSOT consumed by all visual surfaces (no duplicate polling).
- Optimistic dispatch with temp ids and server-id reconciliation (`bulkDispatch.ts:59–99`).
- Memoized selectors (sorted-pipe-string equality) prevent cross-product re-renders.
- Stream coalescing at 150 ms keeps streaming UI smooth.
- WS heartbeat (30 s ping) detects half-open TCP and re-establishes.
- Collision detection uses the wider "running + queued" selector (correct for blocking double-dispatch).

## Recommended fix order

1. **G5** — add operations refetch to WS reconnect. ~10 min.
2. **G2** — pre-insert all N stubs in `bulkDispatch`. ~15 min.
3. **G3** — clear ops when data-change resolves the field. ~30 min.
4. **G1** — extend process-status shape with queued count, or document.
5. **G4** — toast on stub removal due to error.

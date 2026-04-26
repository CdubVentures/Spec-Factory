## Purpose

In-memory registry for tracking ephemeral long-running operations (LLM calls, validation, publishing). Any module registers operations; the registry broadcasts state changes via WebSocket so the frontend sidebar tracker stays in sync.

## Public API (The Contract)

```js
import { initOperationsRegistry, registerOperation, updateStage, updateProgressText, completeOperation, failOperation, countRunningOperations, listOperationSummaries, getOperation, listOperations } from 'src/core/operations';
```

| Function | Purpose |
|----------|---------|
| `initOperationsRegistry({ broadcastWs })` | One-time boot wiring (called from `guiServerRuntime.js`) |
| `registerOperation({ type, subType?, category, productId, productLabel, stages })` | Start tracking → returns `{ id }` |
| `updateStage({ id, stageIndex?, stageName? })` | Advance current stage |
| `updateProgressText({ id, text })` | Set free-form progress text on running op |
| `completeOperation({ id })` | Mark done (auto-evicts after 60s) |
| `failOperation({ id, error })` | Mark error (auto-evicts after 60s) |
| `countRunningOperations()` | Count currently running operations for resource policy decisions |
| `listOperationSummaries()` | Lightweight tracked ops, newest-first; omits full LLM prompt/response bodies |
| `getOperation(id)` | Full operation detail for an explicitly selected operation |
| `listOperations()` | Full tracked ops, newest-first; core/internal use only |
| `fireAndForget({ res, jsonRes, op, ... })` | Return 202 immediately, then run async work under the active-operation gate |

## Dependencies

None. `broadcastWs` is injected at init — no direct imports from other modules.

## Domain Invariants

- Operations are **ephemeral runtime state** — not persisted to JSON or DB
- Status transitions are terminal: `queued → running → done | error | cancelled`
- At most 100 top-level `fireAndForget` operations may run at once; overflow operations stay `queued` until a slot opens
- The active-operation cap does not limit internal parallel work inside a single operation
- IDs are UUIDs — globally unique
- `currentStageIndex` is always within `[0, stages.length)`
- `subType` defaults to `''` — optional variant label (e.g. `'view'`, `'hero'`, `'loop'`, `'process'`)
- `progressText` defaults to `''` — free-form progress string, only settable on running ops
- Active-operation list/API/WS surfaces stay summary-only; full `llmCalls` are fetched by explicit operation id
- Completed/failed ops auto-evict from the Map after 60 seconds
- The registry retains up to 250 operations for UI/history; running ops are never evicted by retention

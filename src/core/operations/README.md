## Purpose

In-memory registry for tracking ephemeral long-running operations (LLM calls, validation, publishing). Any module registers operations; the registry broadcasts state changes via WebSocket so the frontend sidebar tracker stays in sync.

## Public API (The Contract)

```js
import { initOperationsRegistry, registerOperation, updateStage, updateProgressText, completeOperation, failOperation, listOperations } from 'src/core/operations';
```

| Function | Purpose |
|----------|---------|
| `initOperationsRegistry({ broadcastWs })` | One-time boot wiring (called from `guiServerRuntime.js`) |
| `registerOperation({ type, subType?, category, productId, productLabel, stages })` | Start tracking → returns `{ id }` |
| `updateStage({ id, stageIndex?, stageName? })` | Advance current stage |
| `updateProgressText({ id, text })` | Set free-form progress text on running op |
| `completeOperation({ id })` | Mark done (auto-evicts after 60s) |
| `failOperation({ id, error })` | Mark error (auto-evicts after 60s) |
| `listOperations()` | All tracked ops, newest-first |
| `fireAndForget({ res, jsonRes, op, ... })` | Return 202 immediately, run async work detached |

## Dependencies

None. `broadcastWs` is injected at init — no direct imports from other modules.

## Domain Invariants

- Operations are **ephemeral runtime state** — not persisted to JSON or DB
- Status transitions are terminal: `running → done` or `running → error`
- IDs are UUIDs — globally unique
- `currentStageIndex` is always within `[0, stages.length)`
- `subType` defaults to `''` — optional variant label (e.g. `'view'`, `'hero'`, `'loop'`, `'process'`)
- `progressText` defaults to `''` — free-form progress string, only settable on running ops
- Completed/failed ops auto-evict from the Map after 60 seconds

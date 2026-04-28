## Purpose

Frontend sidebar widget that displays all active long-running operations (LLM calls, validation, publishing) across all modules and categories. Persists across navigation via Zustand store, hydrated by WebSocket push + initial GET.

## Public API (The Contract)

- `OperationsTracker` - React component, renders in Sidebar below category selector
- `useOperationsStore` - Zustand store: `{ operations, streamTexts, upsert, remove, clear, appendStreamText, batchAppendStreamText }`
- `useOperationsHydration` - Hook: fetches GET /api/operations on mount, seeds store
- `OPERATION_STATUS_CONTRACT` + status helpers - canonical UI-active and terminal status buckets

## Dependencies

Allowed: `src/stores/collapseStore`, `src/api/client`, `src/api/ws`

## Domain Invariants

- Store survives navigation and category changes (Zustand singleton)
- Process status is owned outside this store; operation counts never imply child-process status
- UI-active operation count is `queued + running`; terminal count is `done + error + cancelled`
- Failed optimistic dispatch stubs become terminal `error` operations with inline error text instead of disappearing
- Completed ops auto-remove from UI after 10 seconds
- Error ops persist until backend eviction (60s)
- Widget returns null when 0 operations (zero layout cost)
- Cards are sorted: running (newest-first) -> error -> done

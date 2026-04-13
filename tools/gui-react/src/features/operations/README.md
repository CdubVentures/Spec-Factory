## Purpose

Frontend sidebar widget that displays all active long-running operations (LLM calls, validation, publishing) across all modules and categories. Persists across navigation via Zustand store, hydrated by WebSocket push + initial GET.

## Public API (The Contract)

- `OperationsTracker` — React component, renders in Sidebar below category selector
- `useOperationsStore` — Zustand store: `{ operations, streamTexts, upsert, remove, clear, appendStreamText, batchAppendStreamText }`
- `useOperationsHydration` — Hook: fetches GET /api/operations on mount, seeds store

## Dependencies

Allowed: `src/stores/collapseStore`, `src/api/client`, `src/api/ws`

## Domain Invariants

- Store survives navigation and category changes (Zustand singleton)
- Completed ops auto-remove from UI after 10 seconds
- Error ops persist until backend eviction (60s)
- Widget returns null when 0 operations (zero layout cost)
- Cards are sorted: running (newest-first) → error → done

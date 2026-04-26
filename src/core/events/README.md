## Purpose
Own the repo-wide data-change event contract used to propagate backend mutations into live GUI cache invalidation.
This boundary is infrastructure only; feature code emits typed events and the registry maps those events to affected domains.

## Public API (The Contract)
- `eventRegistry.js`: `EVENT_REGISTRY`, `DOMAIN_QUERY_TEMPLATES`, `KNOWN_DATA_CHANGE_EVENTS`, `KNOWN_DATA_CHANGE_DOMAINS`, `CATEGORY_TOKEN`.
- `dataChangeContract.js`: `createDataChangePayload`, `emitDataChange`, `isDataChangePayload`, `dataChangeMatchesCategory`, `DATA_CHANGE_EVENT_DOMAIN_MAP`, `DATA_CHANGE_EVENT_NAMES`.
- `dataPropagationCounters.js`: broadcast and queue-cleanup counters for observability.
- `settingsPersistenceCounters.js`: settings persistence counters for observability.

## Dependencies
- Allowed: Node built-ins and `src/core/finder/finderModuleRegistry.js` for finder-derived event/domain expansion.
- Forbidden: feature internals, GUI state, React Query clients, and route-specific mutation logic.

## Domain Invariants
- Every production `emitDataChange` event must be registered in `EVENT_REGISTRY`.
- Every registered domain must have at least one query-key template in `DOMAIN_QUERY_TEMPLATES`.
- Finder event names are derived from `FINDER_MODULES`; per-finder entries declare only extra affected domains beyond the finder domain.
- Explicit `domains` in emitted payloads override fallback registry domains, so route-level explicit domains must stay complete.
- Event registry changes are contract changes and require boundary tests for backend registration and frontend invalidation materialization.

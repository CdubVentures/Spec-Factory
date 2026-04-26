---
name: cache invalidation map files (SSOT)
description: Pointers to the event→domain→query-key SSOT files for live-update / cache invalidation. Edit these to fix stale-UI bugs.
type: reference
---

App's live-update path: server `emitDataChange({ event, domains })` → WS `data-change` channel → global `useWsEventBridge` (mounted at app shell) → `invalidateDataChangeQueries` → React Query refetch.

**Map files (must stay in sync):**

- **`tools/gui-react/src/features/data-change/invalidationResolver.js`** — client SSOT. `DOMAIN_QUERY_TEMPLATES` (domain → query-key templates) + `DATA_CHANGE_EVENT_DOMAIN_FALLBACK` (event name → domains).
- **`src/core/events/dataChangeContract.js`** — server mirror. `DATA_CHANGE_EVENT_DOMAIN_MAP` (must match the client's `DATA_CHANGE_EVENT_DOMAIN_FALLBACK`).
- **`src/core/finder/finderModuleRegistry.js`** — per-finder `dataChangeEvents: { suffix → extra domains }` field. Derived into `FINDER_DATA_CHANGE_EVENTS` and spread into BOTH client + server event maps. **This is the O(1) scaling lever** — adding a new event suffix here propagates to both sides automatically.

**Subscriber inventory:**
- `tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts` — global, always mounted at app shell. Use this for all real-time UI; per-component subscriptions are redundant.
- `tools/gui-react/src/hooks/useDataChangeSubscription.js` — per-component subscription hook (used by KeyFinderPanel — redundant given the global bridge).

**Test files:**
- `tools/gui-react/src/features/data-change/__tests__/dataChangeInvalidationMap.test.js` — asserts event→domains→query-key resolution. Extend here when adding new events.
- `tools/gui-react/src/features/data-change/__tests__/dataChangeInvalidationFeatureContract.test.js` — feature-level contract tests.

**Diagnostic flow when UI doesn't update live:**
1. What query key does the consumer use? (`useQuery({ queryKey: [...] })`)
2. What event does the mutating server route emit? (`emitDataChange({ event })`)
3. Does that event's domains include the consumer's query-key template? Trace through `DATA_CHANGE_EVENT_DOMAIN_MAP` (server) and `DATA_CHANGE_EVENT_DOMAIN_FALLBACK` (client) → `DOMAIN_QUERY_TEMPLATES`.
4. If gap found, edit the THREE files above (registry preferred for finder events, fallback maps for non-finder events).

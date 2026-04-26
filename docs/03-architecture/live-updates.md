# Live Updates

Spec Factory uses a single data-change contract to keep GUI caches synchronized after backend mutations.

## Flow

1. A mutating route or async operation calls `emitDataChange()`.
2. `emitDataChange()` builds a `data-change` payload, records broadcast counters, and sends it through `broadcastWs`.
3. `useWsEventBridge()` receives the WebSocket message in the GUI shell.
4. `createDataChangeInvalidationScheduler()` debounces rapid messages for 75 ms.
5. `resolveDataChangeInvalidationQueryKeys()` maps the event to affected domains, then domains to React Query key prefixes.
6. React Query invalidates those prefixes; active screens refetch through their normal API hooks.

## Source Of Truth

`src/core/events/eventRegistry.js` owns both sides of the contract:

- `EVENT_REGISTRY`: event name to affected domains.
- `DOMAIN_QUERY_TEMPLATES`: domain to React Query key prefixes.

The backend exports `DATA_CHANGE_EVENT_DOMAIN_MAP` from this registry. The GUI exports `DATA_CHANGE_EVENT_DOMAIN_FALLBACK` and `KNOWN_DATA_CHANGE_DOMAINS` from the same registry. New standard events or domains should be added in the registry first, with tests proving emitted events are registered and domains materialize to real query keys.

## Guardrails

- Production `emitDataChange()` calls must include `broadcastWs`.
- Explicit payload `domains` override registry fallback domains, so explicit route payloads must include every affected domain.
- Polling is reserved for channels that do not have authoritative backend data-change events, such as billing and runtime/process progress.
- `data-authority` snapshots are read-only projections and refresh through the domains that affect their source data.

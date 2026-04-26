## Purpose
Own client-side interpretation of backend `data-change` WebSocket messages and convert them into React Query invalidations.
This boundary is the GUI adapter for the shared event registry in `src/core/events/eventRegistry.js`.

## Public API (The Contract)
- `index.js` exports category/domain normalization, subscription filters, message scope helpers, invalidation resolution, invalidation scheduling, and client observability.
- `resolveDataChangeInvalidationQueryKeys()` returns the React Query key prefixes affected by a data-change message.
- `invalidateDataChangeQueries()` invalidates the materialized key prefixes for a supplied query client.
- `createDataChangeInvalidationScheduler()` debounces rapid messages before invalidating.

## Dependencies
- Allowed: local data-change helpers and `src/core/events/eventRegistry.js`.
- Forbidden: feature internals, route handlers, direct WebSocket ownership, and component-specific query assumptions.

## Domain Invariants
- Client fallback event/domain coverage must come from the shared core registry, not a duplicate map.
- Query-key templates are prefixes; invalidating `['publisher', 'published', category]` must cover product-specific published-field queries.
- Unknown events may fall back to conservative query templates, but known domains must never be missing templates.
- The global app bridge owns data-change subscription for broad cache invalidation; feature-local subscriptions are exceptions only when they add behavior beyond query invalidation.

# 01 - Data Authority System Overview

Last verified: 2026-02-23

## Objective

Use one category-scoped authoritative model so every mutation is reflected consistently across:

- Studio editors
- Review and catalog surfaces
- SpecDb SQL state
- JSON authoring/runtime artifacts

## Authority model

1. Authoring sources (JSON + workbook map + generated artifacts) define category data.
2. Backend routes mutate authority and emit typed `data-change`.
3. WebSocket transport fans out category-scoped change events.
4. Frontend subscribers invalidate query families and refresh data.
5. Compile success synchronizes SpecDb and records durable sync version.
6. Snapshot endpoint exposes category authority token and sync status.

## Core runtime components

Backend authority plane:

- `src/api/routes/studioRoutes.js`
- `src/api/routes/sourceStrategyRoutes.js`
- `src/api/routes/catalogRoutes.js`
- `src/api/routes/brandRoutes.js`
- `src/api/routes/reviewRoutes.js`
- `src/api/events/dataChangeContract.js`
- `src/api/routes/dataAuthorityRoutes.js`
- `src/api/services/specDbSyncService.js`
- `src/api/services/compileProcessCompletion.js`

Frontend propagation plane:

- `tools/gui-react/src/components/layout/AppShell.tsx`
- `tools/gui-react/src/components/layout/dataChangeInvalidationScheduler.js`
- `tools/gui-react/src/api/dataChangeInvalidationMap.js`
- `tools/gui-react/src/hooks/useDataChangeSubscription.js`
- `tools/gui-react/src/hooks/useAuthoritySnapshot.js`
- `tools/gui-react/src/pages/studio/StudioPage.tsx`
- `tools/gui-react/src/pages/studio/authoritySync.js`

Persistence plane:

- `src/field-rules/sessionCache.js` (compiled+draft merge and cache)
- `src/ingest/categoryCompile.js` (workbook map load/save/validate)
- `src/db/seed.js` (deterministic SpecDb seed from JSON/contracts)
- `src/db/specDb.js` (`data_authority_sync`, `source_strategy`, review/runtime tables)

## High-value guarantees

- `workbook-map` save is blocked if `validate-map` fails (frontend and backend).
- `studio-drafts-saved` includes `product` domain fanout.
- source strategy CRUD emits typed events (`source-strategy-*`).
- compile completion emits `process-completed` and attempts SpecDb sync first.
- failed sync writes durable `data_authority_sync` state when DB handle exists.
- frontend/backed event-domain parity is enforced (`test/dataChangeDomainParity.test.js`).

## Authority invariants

- Item-level acceptance is not authoritative over component or enum masters.
- Component and enum master updates propagate to linked item surfaces.
- Routing and cascade targeting are ID/slot based (not source-host based).
- Source host and root domain are provenance metadata, not authority keys.

## Non-goals

- No claim of exactly-once event delivery.
- No hard lock against local stale edits; Studio uses explicit conflict resolution.
- No cross-category transactional commit; authority is category scoped.

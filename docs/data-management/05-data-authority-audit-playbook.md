# 05 - Data Authority Audit Playbook

Last full pass: 2026-02-25

## Audit scope used in this pass

- Backend event contract and route producers
- Frontend invalidation/subscriber pipeline
- Studio save/compile conflict behavior
- SpecDb sync durability and snapshot endpoint
- JSON/SQL authority data source inventory

## Current audit result (2026-02-25)

Status: pass with documented guardrails in place.

Verified:

- field-studio map save has server-side validation gate
- Studio save uses store-authoritative snapshot payload
- compile completion executes sync attempt before broadcast
- sync failures persist durable failed state (when db handle exists)
- source strategy mutations emit typed `data-change`
- `field-studio-map-saved` emits `studio/mapping/review-layout` domain fanout
- backend/frontend event-domain maps are in parity (`45` events, `19` domains)
- no unmapped domains in frontend invalidation templates
- no zero-fanout events in invalidation resolution
- WS channel coverage is aligned (`data-change`, `events`, `process`, `process-status`, `indexlab-event`, `test-import-progress`)
- polling/manual refresh families are intentionally outside `data-change` invalidation (`billing`, `learning`, `data-authority`, `indexlab`, `processStatus`, `runtime-ops`, `searxng`)

Historical rollout status (extracted from prior master/window plans):

- propagation scope phases 0 through 7 completed
- typed event normalization completed
- compile-success deterministic sync and durable versioning completed
- snapshot endpoint + subscriber hook flow completed
- post-phase hardening completed for field-studio-map preflight and conflict guard behavior

## Repeatable audit checklist

## A) Contract integrity

1. Review `src/api/events/dataChangeContract.js`.
2. Confirm all emitted events map to expected domains.
3. Confirm payload has normalized category/categories/version/entities.

## B) Producer coverage

1. Enumerate `emitDataChange` and `sendDataChangeResponse` call sites in `src/api`.
2. Confirm each producer route emits category and semantic event.
3. Confirm high-impact mutations are represented (studio, review, catalog, brand, queue, settings, source strategy).

## C) Subscriber coverage

1. Verify AppShell channel subscription includes `data-change`.
2. Verify invalidation map has domain templates for each active domain.
3. Verify authority snapshot hook invalidates snapshot key.
4. Verify Studio conflict guard works when authority token changes with unsaved edits.

## D) Persistence and projection

1. Verify `recordSpecDbSync` increments/saves versions correctly and supports explicit failure write.
2. Verify compile completion includes sync metadata in `process-completed` event meta.
3. Verify snapshot endpoint returns `authority_version`, `changed_domains`, `specdb_sync`.

## E) Regression tests

Run targeted suites:

- `test/studioRoutesPropagation.test.js`
- `test/mapValidationPreflight.test.js`
- `test/compileProcessCompletion.test.js`
- `test/specDbSyncService.test.js`
- `test/specDbSyncVersion.test.js`
- `test/dataAuthorityRoutes.test.js`
- `test/dataChangeContract.test.js`
- `test/dataChangeInvalidationMap.test.js`
- `test/dataChangeDomainParity.test.js`
- `test/dataAuthorityPropagationMatrix.test.js`
- `test/wsSubscriptionWiring.test.js`
- `test/frontendSessionAuditCoverage.test.js`
- `test/guiPersistenceSessionScope.test.js`

## Drift indicators to watch

- new mutation routes emitting raw/non-typed websocket payloads
- event names added only on backend or only on frontend
- domains without query templates
- compile success without durable sync write
- studio save/compile path bypassing field-studio-map validation

## Documentation update protocol

When authority behavior changes:

1. Update docs `01..05` in this folder.
2. Update Mermaid diagrams under `diagrams/authority-flows/`.
3. Update legacy phase logs only for status/history deltas.

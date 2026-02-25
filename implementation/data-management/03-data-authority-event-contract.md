# 03 - Data Authority Event Contract

Last verified: 2026-02-25
Contract owner: `src/api/events/dataChangeContract.js`

## Canonical payload

All authority broadcasts use `channel='data-change'` with payload:

```json
{
  "type": "data-change",
  "event": "field-studio-map-saved",
  "category": "mouse",
  "categories": ["mouse"],
  "domains": ["studio", "mapping", "review-layout"],
  "version": {
    "map_hash": "map:2026-02-24T12:00:00.000Z",
    "compiled_hash": null,
    "specdb_sync_version": 42,
    "updated_at": "2026-02-24T12:00:00.000Z"
  },
  "entities": {
    "productIds": [],
    "fieldKeys": []
  },
  "meta": {},
  "ts": "2026-02-24T12:00:00.000Z"
}
```

## Contract inventory snapshot

- Event names in contract map: `45`
- Unique domains in contract map: `19`
- Backend/frontend event-domain parity drift: `0`
- Domains without invalidation templates: `0`
- Events resolving to zero invalidation query keys: `0`

## Event families and default domains

Studio and compile:

- `field-studio-map-saved` -> `studio`, `mapping`, `review-layout`
- `process-completed` -> `studio`, `review-layout`, `component`, `enum`

Catalog and brand:

- `catalog-seed`, `catalog-bulk-add`, `catalog-product-add`, `catalog-product-update`, `catalog-product-delete` -> `catalog`, `queue`, `identity`
- `brand-seed`, `brand-bulk-add`, `brand-add`, `brand-update`, `brand-delete` -> `brand`, `catalog`, `identity`
- `brand-rename` -> `brand`, `catalog`, `identity`, `queue`

Settings, infra, storage, relocation:

- `llm-settings-updated`, `llm-settings-reset`, `convergence-settings-updated`, `runtime-settings-updated` -> `settings`, `indexing`
- `storage-settings-updated` -> `storage`, `settings`
- `indexlab-run-data-relocation-started`, `indexlab-run-data-relocated`, `indexlab-run-data-relocation-failed` -> `storage`, `indexing`
- `category-created` -> `categories`

Test mode:

- `test-mode-created`, `test-mode-deleted` -> `test-mode`, `categories`
- `test-mode-products-generated` -> `test-mode`

Source strategy:

- `source-strategy-created`, `source-strategy-updated`, `source-strategy-deleted` -> `source-strategy`

Queue:

- `queue-retry`, `queue-pause`, `queue-priority`, `queue-requeue` -> `queue`

Review/component/enum:

- `review-suggest` -> `review`, `suggestions`
- `review` -> `review`
- `component-review` -> `component`, `review`
- `review-override`, `review-manual-override`, `key-review-confirm`, `key-review-accept` -> `review`, `product`
- `component-override`, `component-key-review-confirm` -> `component`, `review`
- `enum-override`, `enum-rename`, `enum-consistency` -> `enum`, `review`

## Producer modules (audited)

- `src/api/routes/studioRoutes.js`
- `src/api/services/compileProcessCompletion.js`
- `src/api/routes/sourceStrategyRoutes.js`
- `src/api/routes/catalogRoutes.js`
- `src/api/routes/brandRoutes.js`
- `src/api/routes/configRoutes.js`
- `src/api/routes/queueBillingLearningRoutes.js`
- `src/api/routes/reviewRoutes.js`
- `src/api/routes/testModeRoutes.js`
- `src/api/routes/infraRoutes.js`
- `src/api/services/indexLabProcessCompletion.js`
- `src/api/reviewItemRoutes.js`
- `src/api/reviewComponentMutationRoutes.js`
- `src/api/reviewEnumMutationRoutes.js`
- `src/api/reviewRouteSharedHelpers.js`

## Consumer maps

Backend scope filter:

- `src/api/guiServer.js` -> `wsFilterPayload` + `dataChangeMatchesCategory`.

Frontend invalidation:

- `tools/gui-react/src/api/dataChangeInvalidationMap.js`
- `tools/gui-react/src/components/layout/dataChangeInvalidationScheduler.js`
- `tools/gui-react/src/components/layout/AppShell.tsx`
- `tools/gui-react/src/hooks/useAuthoritySnapshot.js`

Related non-data-change channel:

- `test-import-progress` is a dedicated progress channel from `testModeRoutes` to `TestModePage`.

## Contract safety checks

- `test/dataChangeContract.test.js` validates payload shape and normalization.
- `test/dataChangeInvalidationMap.test.js` validates domain->query fanout.
- `test/dataChangeDomainParity.test.js` enforces backend/frontend event-domain parity.
- `test/dataAuthorityPropagationMatrix.test.js` validates high-value propagation scenarios.

## Update rule

For any new mutation event:

1. Add event->domain mapping in backend contract map.
2. Mirror event->domain mapping in frontend fallback map.
3. Add domain query templates (or extend existing templates) in invalidation map.
4. Add/adjust parity and invalidation tests.

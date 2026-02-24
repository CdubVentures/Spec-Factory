# 03 - Data Authority Event Contract

Last verified: 2026-02-23
Contract owner: `src/api/events/dataChangeContract.js`

## Canonical payload

All authority broadcasts use `channel='data-change'` with payload:

```json
{
  "type": "data-change",
  "event": "workbook-map-saved",
  "category": "mouse",
  "categories": ["mouse"],
  "domains": ["studio", "mapping", "review-layout"],
  "version": {
    "draft_hash": "draft:2026-02-23T12:00:00.000Z",
    "compiled_hash": null,
    "specdb_sync_version": 42,
    "updated_at": "2026-02-23T12:00:00.000Z"
  },
  "entities": {
    "productIds": [],
    "fieldKeys": []
  },
  "meta": {},
  "ts": "2026-02-23T12:00:00.000Z"
}
```

## Event families and default domains

Studio and compile:

- `studio-drafts-saved` -> `studio`, `review-layout`, `labels`, `product`
- `workbook-map-saved` -> `studio`, `mapping`, `review-layout`
- `process-completed` -> `studio`, `review-layout`, `component`, `enum`

Catalog and brand:

- `catalog-seed`, `catalog-bulk-add`, `catalog-product-add`, `catalog-product-update`, `catalog-product-delete` -> `catalog`, `queue`, `identity`
- `brand-seed`, `brand-bulk-add`, `brand-add`, `brand-update`, `brand-delete` -> `brand`, `catalog`, `identity`
- `brand-rename` -> `brand`, `catalog`, `identity`, `queue`

Settings and strategy:

- `llm-settings-updated`, `llm-settings-reset`, `convergence-settings-updated` -> `settings`, `indexing`
- `source-strategy-created`, `source-strategy-updated`, `source-strategy-deleted` -> `source-strategy`

Queue and review:

- `queue-retry`, `queue-pause`, `queue-priority`, `queue-requeue` -> `queue`
- `review-suggest` -> `review`, `suggestions`
- `review` -> `review`
- `component-review` -> `component`, `review`
- `review-override`, `review-manual-override`, `key-review-confirm`, `key-review-accept` -> `review`, `product`
- `component-override`, `component-key-review-confirm` -> `component`, `review`
- `enum-override`, `enum-rename` -> `enum`, `review`

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
- `src/api/reviewItemRoutes.js`
- `src/api/reviewComponentMutationRoutes.js`
- `src/api/reviewEnumMutationRoutes.js`

## Consumer maps

Backend scope filter:

- `src/api/guiServer.js` -> `dataChangeMatchesCategory` gate in WS filtering.

Frontend invalidation:

- `tools/gui-react/src/api/dataChangeInvalidationMap.js`
- `tools/gui-react/src/components/layout/dataChangeInvalidationScheduler.js`
- `tools/gui-react/src/components/layout/AppShell.tsx`

## Contract safety checks

- `test/dataChangeContract.test.js` validates payload shape.
- `test/dataChangeInvalidationMap.test.js` validates domain->query fanout.
- `test/dataChangeDomainParity.test.js` enforces backend/frontend event-domain parity.

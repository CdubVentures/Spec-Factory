# Product SSOT Validation Audit — 2026-04-02

## Scope

Validate the SSOT migration for Overlaps 0a (product identity) and 0b (queue state):
- `product.json` is the sole disk SSOT for product identity
- SQL `products` is a derived cache rebuilt from product.json via `scanAndSeedCheckpoints`
- `loadProductCatalog` is retired from all non-import, non-migration source
- Queue JSON adapter removed — SQL `product_queue` is sole queue SSOT

---

## Artifact Snapshot (verified)

| Artifact | Count | Notes |
| --- | --- | --- |
| `product_catalog.json` (mouse) | 343 | Legacy import file. Not read at boot or seed. Only read by `seedFromCatalog` (user-triggered import route). |
| `.workspace/products/*/product.json` (mouse) | 369 | Sole disk SSOT. 343 from original catalog + 26 added via GUI. |
| SQL `products` rows (mouse) | 364 | Derived cache. 5 fewer than disk = products added but specDb not yet reseeded (lazy-load by design). |
| On disk but NOT in SQL | 5 | `mouse-1949dd1b`, `mouse-32def557`, `mouse-7f30ff41`, `mouse-8f3157bc`, `mouse-bb04aec9`. Will be seeded on next category open. |
| In SQL but NOT on disk | 0 | Every SQL product has a product.json file. |

**Previous audit reported 459/523 disk files** — this was counting non-mouse directories or test artifacts. Verified count is 369 mouse product.json files.

---

## Phase Validation

| Phase | Status | Detail |
| --- | --- | --- |
| 1 (Verify coverage) | **Validated** | All 343 catalog products have product.json files. 26 extra on disk (GUI-added). 5 not yet in SQL (lazy-load). |
| 2 (Remove seedProductCatalog) | **Validated** | `seedProductCatalog()` removed from seed.js. Product-catalog reseed phase removed from specDbRuntime.js. |
| 3 (CRUD to SQL-only) | **Validated** | addProduct, addProductsBulk, updateProduct, removeProduct, seedFromCatalog — all use specDb for dedup/existence. `patch.model → base_model` backward compat restored. |
| 4 (Identity + queue to SQL) | **Validated** | identityGate, productIdentityAuthority, fieldReviewHandlers, reconciler, queueState — all SQL-first. |
| 5 (Remaining consumers + DI) | **Validated** | `loadProductCatalog` removed from all route contexts, bootstrap, helpers, review routes, studio routes, brand registry, indexing builders, pipeline commands. |
| 6 (Dead code cleanup) | **Validated** | `loadProductCatalog`, `findProductByIdentity`, `nextAvailableId`, `catalogPath`, `emptyCatalog` deleted. Feature export contract asserts `loadProductCatalog === undefined`. Orphaned `sku`/`title` fields removed from writeProductIdentity. |
| 7 (Docs) | **Validated** | rebuild-map.html, storage-reference.html, architecture-reference.html, seeding-handoff.html, data-model.md, catalog-and-product-selection.md all updated. |

## Queue (Overlap 0b) Validation

| Item | Status | Detail |
| --- | --- | --- |
| JSON adapter removed | **Validated** | `createJsonAdapter`, `loadJsonState`, `saveJsonState` deleted from queueStorageAdapter.js. Factory throws if specDb is null. |
| All call sites pass specDb | **Validated** | queueCommand.js, reconciler.js, expansionHardening.js fixed. Zero `loadQueueState({` calls without specDb in non-test source. |
| seedQueueState removed | **Validated** | Removed from seed.js. product_queue rebuilt via seedFromCheckpoint. |
| JSON adapter tests removed | **Validated** | queueStateStorageRecoveryContracts.test.js emptied. JSON tests deleted from queueStorageAdapter.test.js. |

---

## Known Accepted Residue

These are intentional — not contradictions.

1. **`seedFromCatalog()` + `catalogProductLoader.js`** — Still reads `product_catalog.json`. This is a user-triggered import mechanism (POST `/catalog/{cat}/products/seed`), not a boot/SSOT read path. Acceptable as a legacy import format.

2. **`ingest/catalogSeed.js`** — Uses `loadCatalogProductsWithFields`. Same as above — ingest import path.

3. **Deprecated migrations** — `idFormatMigration.js` and `brandIdentifierBackfill.js` still import `loadProductCatalog`. Both have deprecation comments. Already ran. Not executable at runtime.

4. **5 disk products not in SQL** — Lazy-load design. Checkpoint reseed runs on category open, not at boot. These 5 will be seeded next time the user opens the mouse category.

---

## Test Proof

**Command:**
```
node --test src/features/catalog/products/tests/productCatalog.test.js \
  src/features/catalog/identity/tests/catalogIdentityGate.test.js \
  src/features/catalog/identity/tests/productIdentityAuthority.test.js \
  src/features/catalog/products/tests/reconciler.test.js \
  src/features/catalog/tests/catalogIdentityFeatureContractWiring.test.js \
  src/queue/tests/queueStorageAdapter.test.js \
  src/queue/tests/queueStateInputSyncContracts.test.js \
  src/queue/tests/queueStateSpecDbFacadeContracts.test.js \
  src/queue/tests/queueStateStaleContracts.test.js \
  src/queue/tests/queueStateMigrationContracts.test.js \
  src/db/tests/seedProductCatalog.test.js \
  src/pipeline/checkpoint/tests/seedFromCheckpoint.test.js \
  src/pipeline/checkpoint/tests/scanAndSeedCheckpoints.test.js \
  src/app/api/tests/specDbRuntime*.test.js \
  src/app/api/tests/apiCatalogHelpersWiring.test.js \
  src/app/api/tests/catalogHelpersSqlPath.test.js
```

**Result: 139 tests, 139 pass, 0 fail.**

Previous failures (updateProduct regression + contract export) are both fixed and verified green.

---

## Final Disposition

**Status: Validated.**

- Overlap 0a (product identity): product.json is sole disk SSOT. SQL is derived cache. loadProductCatalog retired.
- Overlap 0b (queue state): SQL product_queue is sole SSOT. JSON adapter deleted.
- 139/139 targeted tests green.
- Remaining catalog loader usage is intentional legacy import (user-triggered, not boot/seed).

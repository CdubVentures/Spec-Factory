## Purpose
Own catalog product, brand, identity, and artifact-migration behavior behind the canonical `src/features/catalog/**` boundary.
This feature is the stable source for catalog-backed product identity and catalog maintenance workflows.

## Public API (The Contract)
- `src/features/catalog/index.js`: product catalog CRUD/seed/list flows, brand registry/rename helpers, identity gate and authority helpers, catalog loaders, artifact migration helpers, `scanOrphans()`, `reconcileOrphans()`.
- `src/features/catalog/api/catalogRoutes.js`: `registerCatalogRoutes(ctx)`.
- `src/features/catalog/api/brandRoutes.js`: `registerBrandRoutes(ctx)`.

## Dependencies
- Allowed: internal modules under `src/features/catalog/**`, `src/api/events/dataChangeContract.js`, `src/observability/dataPropagationCounters.js`, `src/queue/queueState.js`, and existing low-level helpers in `src/utils/**`.
- Forbidden: cross-feature deep imports from other feature internals; other domains should consume catalog via `src/features/catalog/index.js`.

## Domain Invariants
- `src/features/catalog/index.js` is the public cross-boundary contract.
- Catalog identity and product-id generation stay canonical inside this feature.
- Queue reconciliation crosses the boundary only through the catalog contract or the explicit queue seam.
- New catalog work lands under `src/features/catalog/**`, not resurrected top-level catalog roots.

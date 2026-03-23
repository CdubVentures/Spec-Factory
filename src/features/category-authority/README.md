## Purpose
Own the category-authority snapshot route and the contract around generated category authority artifacts under `category_authority/{category}`.
This boundary is intentionally narrow: it exposes authority snapshot data without reviving the removed compiled-contract runtime.

## Public API (The Contract)
- `src/features/category-authority/api/dataAuthorityRoutes.js`: `buildAuthorityVersionToken()`, `buildAuthoritySnapshotPayload()`, `registerDataAuthorityRoutes(ctx)`.
- `src/features/category-authority/index.js`: no current exports; it remains a marker that runtime authority modules were removed.

## Dependencies
- Allowed: internal files in this feature, `src/observability/dataPropagationCounters.js`, and `src/observability/settingsPersistenceCounters.js`.
- Forbidden: new compiled-contract/runtime modules inside this feature and deep imports from other feature internals.

## Domain Invariants
- Authority snapshot payloads combine session-rule timing data with SpecDb sync metadata for a category.
- The snapshot route is only meaningful when authority snapshots are enabled by runtime config.
- Generated authority artifacts remain rooted under `config.categoryAuthorityRoot`, defaulting to `category_authority`.
- Synthetic helper URLs keep the `category_authority://` scheme used by downstream consumers.

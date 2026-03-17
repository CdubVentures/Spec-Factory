## Purpose
Own HTTP route registration for product, component, and enum review workflows.
This boundary coordinates review payload assembly and mutations while leaning on catalog, indexing, and legacy API seams for supporting behavior.

## Public API (The Contract)
- `src/features/review/index.js`: `registerReviewRoutes`, `createReviewRouteContext`.
- Consumers must import from `index.js`, not from internal `api/` paths.

## Dependencies
- Allowed: `src/features/catalog/index.js`, `src/features/indexing/index.js`, legacy route helpers under `src/api/**`, and `src/field-rules/**`.
- Forbidden: deep imports into other feature internals beyond those explicit contracts.

## Domain Invariants
- Review payload routes only serve catalog-backed products or SpecDb-backed entities that are ready for review.
- Enum consistency review must respect review consumer gates before applying mutations.
- Successful review mutations emit data-change events so downstream clients can refresh derived state.
- New review consumers should integrate through `registerReviewRoutes(ctx)` instead of duplicating review HTTP logic.

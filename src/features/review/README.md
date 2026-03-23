## Purpose
Own HTTP route registration for product, component, and enum review workflows.
This boundary coordinates review payload assembly and mutations while leaning on catalog, indexing, and legacy API seams for supporting behavior.

## Maturity Status: In Progress (Pre-Wired)

The review grid, LLM-assisted review, and component review surfaces are **actively evolving**. Current code contains:
- Working product field review grid (read + basic mutations)
- Component review payloads (SpecDb + legacy file-system paths)
- Enum review payloads
- Placeholder / pre-wired scaffolding for upcoming features (LLM review lanes, multi-product batch review, review queue prioritization)

**What this means for agents working here:**
- The payload shape is **not frozen** — new fields will be added as features land.
- `contracts/reviewFieldContract.js` exports canonical key lists but is **not runtime-enforced**. It serves as documentation and future SSOT anchor.
- Frontend types in `tools/gui-react/src/types/review.ts` include optional fields that are **forward-investment** for stages not yet built. Do not trim them.
- Three independent payload definitions exist (builder → handler mutation → TS types) — known SSOT gap, deferred until the shape stabilizes.
- `reviewStore.ts` stores `selectedField` and `selectedProductId` that are derivable from `activeCell` — cleanup deferred until review grid redesign.

**When to activate the contract:** Once the review grid feature set stabilizes (LLM review lanes shipped, batch review shipped), activate `reviewFieldContract.js` as a Zod-enforced boundary, generate TS types from it, and collapse the 3-way duplication.

## Public API (The Contract)
- `src/features/review/index.js`: `registerReviewRoutes`, `createReviewRouteContext`.
- Consumers must import from `index.js`, not from internal `api/` paths.

### Services (domain logic, stateless exports)
- `services/itemMutationService.js` — lane state resolution, candidate selection, override/confirm/accept logic for item-scoped review.
- `services/componentMutationService.js` — component property validation, identity rename/merge transactions, cascade helpers.
- `services/enumMutationService.js` — enum candidate validation, shared lane state, list value upsert, suggestion status, consistency helpers.
- Route handlers in `src/api/review*Routes.js` import from these services and re-export for backward compatibility.

### Pre-Wired Contracts (not enforced)
- `contracts/reviewFieldContract.js` — canonical key lists for FieldState, ReviewCandidate, KeyReviewLaneState, ProductReviewPayload. Exported but not imported by builders or route handlers yet.

## Dependencies
- Allowed: `src/features/catalog/index.js`, `src/features/indexing/index.js`, legacy route helpers under `src/api/**`, `src/field-rules/**`, and `src/api/reviewRouteSharedHelpers.js`.
- Forbidden: deep imports into other feature internals beyond those explicit contracts.

## Domain Invariants
- Review payload routes only serve catalog-backed products or SpecDb-backed entities that are ready for review.
- Enum consistency review must respect review consumer gates before applying mutations.
- Successful review mutations emit data-change events so downstream clients can refresh derived state.
- New review consumers should integrate through `registerReviewRoutes(ctx)` instead of duplicating review HTTP logic.

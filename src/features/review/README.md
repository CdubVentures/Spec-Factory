## Purpose
Own all product, component, and enum review workflows: grid state assembly,
candidate selection, mutation resolution, override acceptance, impact analysis,
and lane state management. Domain logic lives in `domain/`; HTTP routing in `api/`;
stateless mutation helpers in `services/`; payload shape contracts in `contracts/`.

## Maturity Status: In Progress (Pre-Wired)

The review grid, LLM-assisted review, and component review surfaces are **actively evolving**.
- Payload shape is **not frozen** — new fields will be added as features land.
- `contracts/reviewFieldContract.js` exports canonical key lists but is **not runtime-enforced**. It serves as documentation and future SSOT anchor.
- Frontend types in `tools/gui-react/src/types/review.ts` include forward-investment fields for stages not yet built. Do not trim them.
- Three independent payload definitions exist (builder, handler mutation, TS types) — known SSOT gap, deferred until shape stabilizes.
- `reviewStore.ts` stores `selectedField` and `selectedProductId` that are derivable from `activeCell` — cleanup deferred until review grid redesign.

**When to activate the contract:** Once the review grid feature set stabilizes (LLM review lanes shipped, batch review shipped), activate `reviewFieldContract.js` as a Zod-enforced boundary, generate TS types from it, and collapse the 3-way duplication.

## Public API (The Contract)
- `src/features/review/index.js` exports:
  - `registerReviewRoutes`, `createReviewRouteContext` (HTTP surface)
  - Grid assembly: `buildFieldLabelsMap`, `buildReviewLayout`, `readLatestArtifacts`, `buildFieldState`, `buildProductReviewPayload`, `writeProductReviewArtifacts`, `buildReviewQueue`, `writeCategoryReviewArtifacts`
  - Overrides: `resolveOverrideFilePath`, `readReviewArtifacts`, `setOverrideFromCandidate`, `setManualOverride`, `approveGreenOverrides`, `buildReviewMetrics`, `finalizeOverrides`
  - Component/enum review: `resolvePropertyFieldMeta`, `buildComponentReviewLayout`, `buildComponentReviewPayloads`, `buildEnumReviewPayloads`
  - Cascade impact: `findProductsReferencingComponent`, `cascadeComponentChange`, `cascadeEnumChange`
  - Utilities: `normalizeFieldKey`, `applySharedLaneState`, `confidenceColor`, `runQaJudge`, `startReviewQueueWebSocket`, `suggestionFilePath`, `appendReviewSuggestion`, `evaluateVariance`, `evaluateVarianceBatch`
- Consumers must import from `index.js`, not from internal paths.

### Services (domain logic, stateless exports)
- `services/itemMutationService.js` — lane state resolution, candidate selection, override/confirm/accept logic.
- `services/componentMutationService.js` — component property validation, identity rename/merge, cascade helpers.
- `services/enumMutationService.js` — enum candidate validation, shared lane state, list value upsert, consistency helpers.

### Pre-Wired Contracts (not enforced)
- `contracts/reviewFieldContract.js` — canonical key lists for FieldState, ReviewCandidate, KeyReviewLaneState, ProductReviewPayload.

### Route Layer (self-contained HTTP handling)
- `api/reviewRoutes.js` — thin dispatcher delegating to extracted handler modules.
- `api/fieldReviewHandlers.js`, `api/componentReviewHandlers.js` — query/read handlers.
- `api/itemMutationRoutes.js`, `api/componentMutationRoutes.js`, `api/enumMutationRoutes.js` — mutation handlers.
- `api/routeSharedHelpers.js` — shared mutation response/validation helpers.
- `api/mutationResolvers.js` — SpecDb context resolution for mutations.
- `api/reviewRouteContext.js` — DI context factory.

## Dependencies
- Allowed: `src/core/` (including `src/core/events/dataChangeContract.js`), `src/shared/`, `src/db/`, `src/features/catalog/index.js`, `src/features/indexing/index.js`, `src/features/settings-authority/index.js`, `src/utils/` (common, candidateIdentifier, componentIdentifier, fieldKeys, slotValueShape), `src/engine/` (ruleAccessors, fieldRulesEngine, runtimeGate), `src/field-rules/consumerGate.js`, `src/categories/loader.js`, `src/queue/queueState.js`, `src/pipeline/componentReviewBatch.js`.
- Forbidden: `src/api/` (all HTTP handling is self-contained), deep imports into other feature internals.
- Legacy: `src/review/*.js` shims re-export from `domain/` for backward compatibility. New consumers should use `src/features/review/index.js`.

## Domain Invariants
- Review state derived from SpecDb — never cached independently.
- Override workflows are idempotent.
- Component mutations validate against field rules before persisting.
- Forward-investment fields retained (do not trim).
- Successful review mutations emit data-change events so downstream clients can refresh.
- New review consumers should integrate through `registerReviewRoutes(ctx)`.

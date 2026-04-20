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
  - Grid assembly: `buildFieldLabelsMap`, `buildReviewLayout`, `buildProductReviewPayload`, `writeProductReviewArtifacts`
  - Overrides: `resolveOverrideFilePath`, `readReviewArtifacts`, `setOverrideFromCandidate`, `setManualOverride`, `approveGreenOverrides`, `buildReviewMetrics`, `finalizeOverrides`
  - Component/enum review: `resolvePropertyFieldMeta`, `buildComponentReviewLayout`, `buildComponentReviewPayloads`, `buildEnumReviewPayloads`
  - Cascade impact: `findProductsReferencingComponent`, `cascadeComponentChange`, `cascadeEnumChange`
  - Candidate deletion: `deleteCandidateBySourceId`, `deleteAllCandidatesForField`
  - Utilities: `normalizeFieldKey`, `confidenceColor`, `runQaJudge`, `evaluateVariance`, `evaluateVarianceBatch`
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
- `api/itemMutationRoutes.js`, `api/componentMutationRoutes.js`, `api/enumMutationRoutes.js` — mutation handlers. `itemMutationRoutes` hosts three POST actions: `/override`, `/manual-override`, and `/clear-published`. All three accept optional `variantId` for variant-dependent fields; clear-published also accepts `allVariants: true` for whole-field unresolve.
- `api/candidateDeletionRoutes.js` — DELETE candidate endpoints (single + bulk).
- `api/routeSharedHelpers.js` — shared mutation response/validation helpers.
- `api/mutationResolvers.js` — SpecDb context resolution for mutations.
- `api/reviewRouteContext.js` — DI context factory.

## Dependencies
- Allowed: `src/core/` (including `src/core/events/dataChangeContract.js`), `src/shared/`, `src/db/`, `src/features/publisher/index.js` (republishField), `src/features/color-edition/index.js` (deleteColorEditionFinderRun for cascade), `src/features/catalog/index.js`, `src/features/indexing/index.js`, `src/features/settings-authority/index.js`, `src/utils/` (common, candidateIdentifier, componentIdentifier, fieldKeys, slotValueShape), `src/engine/` (ruleAccessors, fieldRulesEngine, runtimeGate), `src/field-rules/consumerGate.js`, `src/categories/loader.js`, `src/queue/queueState.js`.
- Forbidden: `src/app/api/` (all HTTP handling is self-contained), deep imports into other feature internals.
- Legacy: `src/review/*.js` shims re-export from `domain/` for backward compatibility. New consumers should use `src/features/review/index.js`.

## Domain Invariants
- Review state derived from SpecDb — never cached independently.
- Override workflows are idempotent.
- Component mutations validate against field rules before persisting.
- Forward-investment fields retained (do not trim).
- Successful review mutations emit data-change events so downstream clients can refresh.
- New review consumers should integrate through `registerReviewRoutes(ctx)`.
- **Variant-dependent AND variant-generator fields both emit `variant_values`** in the drawer payload. `variant_dependent` fields (release_date, future discontinued/SKU/price) populate from `field_candidates` rows scoped by `variant_id`. `variant_generator` fields (colors, editions) populate from the active `variants` table — their per-row `value` is the combo/slug and `variant_key` is `"color:<combo>"` / `"edition:<slug>"`. Publishing contracts are unchanged — generators still publish as JSON lists to `fields[]`, not to `variant_fields[vid][]`.
- **Drawer source display** uses the publisher's resolved-status filter as the equivalent of the author-persisted `linked_candidates[]` audit list. Sources come from `candidate.metadata.evidence_refs` (or `metadata.evidence_by_variant[variant_key]` when present, for CEF Run 2+ identity-check projections). The drawer gates per-source URLs by `publishConfidenceThreshold` and displays row confidence derived from `max(sources.confidence) / 100`, not the stored candidate-level value. See `selectors/publishedSourceSelectors.ts` in the GUI.
- **Candidate deletion is variant-aware**: `deleteCandidateBySourceId` / `deleteAllCandidatesForField` branch on `isVariantBackedField(fieldKey)` (from `src/features/color-edition/index.js`). Variant-backed fields (`colors`, `editions`) are stripped from candidates only — published is owned by the variants table. All other fields (`release_date`, `name`, future) are stripped + re-published via `republishField`, which unpublishes when no remaining candidate clears `publishConfidenceThreshold`. Cascade deletes on the candidate row sweep the `field_candidate_evidence` projection automatically via FK.
- **`has_run` is meaningful-state, not candidate-count**: `deriveHasRun({ candidateCount, knownFieldStateCount })` in `reviewGridData.js` returns true if the product has any candidate OR any published field. Variant-derived published (post-CEF-delete-all-runs) keeps the row visible in the grid; without this rule the row would dim to invisible after `stripRunSourceFromCandidates` empties the candidate set.
- **Drawer published badge**: `tools/gui-react/src/features/review/components/FieldReviewDrawer.tsx` renders a `PublishedBadge` whose `kind` is decided by `resolveDrawerBadge(fieldKey, hasPublished, variantDependent?)`: `'variant'` for `colors`/`editions` or any field flagged variant-dependent by the backend (`field_rule.variant_dependent`), `'value'` otherwise. Reflects the deletion semantics class so users see whether a candidate delete will demote published.
- **Manual override contract** (trust-boundary in `services/itemMutationService.js`):
  - `variantGenerator` fields (`colors`, `editions`) reject override → 400 `override_not_allowed` — CEF is authoritative.
  - Variant-dependent fields require `variantId` → 400 `variant_id_required` otherwise.
  - Scalar fields forbid `variantId` → 400 `variant_id_not_allowed` when supplied.
  - Set-union list fields (`contract.list_rules.item_union === 'set_union'`) accept comma-separated string input and split via `parseList` before submit.
- **Clear-published contract** (`POST /review/{category}/clear-published` via `itemMutationRoutes.js`, backed by `publisher.clearPublishedField`):
  - Demotes `field_candidates.status resolved → candidate` and removes the JSON projection. Never deletes candidate rows.
  - Variant-dependent requires exactly one of `{variantId, allVariants:true}` — 400 `variant_clear_scope_required` / `variant_clear_scope_conflict` otherwise.
  - Scalar forbids both — 400 `variant_id_not_allowed` / `all_variants_not_allowed`.
  - Broadcasts `review-clear-published` with `{productId, field, variantId?, allVariants?}` in meta. Manual-override lock in `publishCandidate.js:124-127, :241-244` naturally releases once the resolved JSON entry is gone.
  - Also nulls `metadata_json.publish_result` on demoted candidate rows so Publisher GUI doesn't render stale "published" state.

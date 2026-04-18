## Purpose

Own all product, component, and enum review workflows: grid state assembly, candidate selection, mutation resolution, override acceptance, impact analysis, lane state management, and review grid state runtime factories.

## Public API (The Contract)

- `index.js` -- public exports for cross-feature access
- `reviewCandidateRuntime.js` -- `normalizeLower`, `isMeaningfulValue`, `candidateLooksReference` utilities
- `reviewGridData.js`, `reviewGridHelpers.js` -- grid assembly and helpers
  - `deriveHasRun({ candidateCount, knownFieldStateCount })` -- pure: returns `true` if a product has any meaningful state (candidates OR any known published field). Drives the review-grid "dimmed" state. Variant-derived published fields keep a row visible after delete-all-runs strips candidates.
- `deleteCandidate.js` -- `deleteCandidateBySourceId(...)` and `deleteAllCandidatesForField(...)`. Branch on `isVariantBackedField(fieldKey)` (imported from `src/features/color-edition/index.js`):
  - **Variant-backed (`colors`, `editions`)**: strip SQL row + product.json candidate entry. Published is **not** touched (variants table is the SSOT).
  - **Everything else**: strip SQL + JSON, then call `republishField` to re-derive published from remaining candidates (unpublishes if none above threshold). Returns `{ deleted, republished, artifacts_cleaned }`.
- `candidateInfrastructure.js` -- candidate management infrastructure
- `componentImpact.js`, `componentReviewData.js`, `componentReviewHelpers.js` -- component review
- `enumReviewData.js` -- enum review data
- `overrideWorkflow.js`, `overrideHelpers.js` -- override handling
- `confidenceColor.js` -- confidence color mapping
- `qaJudge.js` -- QA judgment logic
- `varianceEvaluator.js` -- variance evaluation
- `reviewNormalization.js` -- review data normalization

## Dependencies

- Allowed: `src/core/*`, `src/shared/*`, `src/db/*` (SpecDb via DI)
- Forbidden: `src/app/api/` (all HTTP handling is self-contained), deep imports into other feature internals

## Domain Invariants

- All runtime dependencies are injected via factory arguments -- no global imports of DB or storage.
- Grid state mutations are transactional within a single SpecDb instance.
- Candidate operations operate on the per-category SpecDb, never cross-category.
- `buildProductReviewPayload` emits `variant_values` for **both** variant-dependent attributes (release_date, future discontinued/SKU/price) **and** variant-generator fields (colors, editions). Generator entries are derived from the active `variants` table — each entry keyed by `variant_id`, value = combo/slug, enriched with `variant_label`, `variant_type`, `color_atoms`, `edition_slug`, `variant_key`. Publishing semantics are unaffected (generators still publish to `fields[]`, not `variant_fields[vid][]`); this is a drawer-payload enrichment so the UI can render per-variant rows with swatches and per-variant source lists.
- Published-value `source_timestamp` comes from the winning resolved row's `updated_at`; `missingCount` still increments for fields with no resolvable value so coverage math stays accurate even when a row is omitted from the sparse fields map.

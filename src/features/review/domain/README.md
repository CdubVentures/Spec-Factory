## Purpose

Own all product, component, and enum review workflows: grid state assembly, candidate selection, mutation resolution, override acceptance, impact analysis, lane state management, and review grid state runtime factories.

## Public API (The Contract)

- `index.js` -- public exports for cross-feature access
- `reviewCandidateRuntime.js` -- `normalizeLower`, `isMeaningfulValue`, `candidateLooksReference` utilities
- `reviewGridData.js`, `reviewGridHelpers.js` -- grid assembly and helpers
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

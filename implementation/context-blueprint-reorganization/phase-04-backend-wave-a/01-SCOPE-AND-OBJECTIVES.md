# Phase 04 Scope and Objectives

## Phase Objective

Move stable backend contexts behind feature contracts with compatibility facades so behavior remains unchanged during extraction.

## In Scope

- `settings-authority` backend contract seeding and route-consumer cutover.
- `catalog-identity` backend contract seeding and route-consumer cutover.
- `review-curation` backend contract seeding and route-consumer cutover.
- Wave A seam registry, characterization plan, and risk controls for these contexts.

## Out of Scope

- High-coupling `runProduct` decomposition and orchestration deep-split work (`phase-05-backend-wave-b`).
- Frontend feature slicing (`phase-06-frontend-feature-slicing`).
- Blocking architecture enforcement cutover (`phase-07-enforcement-and-cutover`).

## Success Conditions

1. Feature entrypoints exist for selected Wave A contexts.
2. API composition/route consumers target those entrypoints rather than mixed legacy internals.
3. Legacy paths remain compatibility-safe while migrations are in progress.
4. Focused contract suites and full `npm test` remain green after each landed slice.

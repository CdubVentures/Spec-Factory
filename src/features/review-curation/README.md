## Purpose
Compatibility facade for review-curation helpers. Now re-exports from
`src/features/review/domain/index.js` (the canonical location).

**Deprecation:** This facade is scheduled for retirement. Its 4 consumers
should migrate to `src/features/review/index.js`. After migration, delete
this directory.

## Public API (The Contract)
- `src/features/review-curation/index.js`: re-exports 31 review domain functions from `src/features/review/domain/index.js`.

## Dependencies
- Allowed: `src/features/review/domain/index.js` only.
- Forbidden: adding new logic or new consumers.

## Domain Invariants
- Thin re-export only. Must not fork behavior.
- Behavioral changes belong in `src/features/review/domain/`.

## Purpose
Provide the canonical feature wrapper for review-curation helpers that still live in the legacy `src/review/**` implementation area.
This boundary lets other domains depend on a feature contract instead of importing scattered review modules directly.

## Public API (The Contract)
- `src/features/review-curation/index.js`: re-exports review layout builders, component impact helpers, override workflow helpers, QA judging, queue WebSocket wiring, suggestion helpers, variance evaluation, and related review-curation utilities from `src/review/**`.

## Dependencies
- Allowed: the legacy `src/review/**` modules re-exported by this boundary.
- Forbidden: adding unrelated logic here or bypassing this wrapper with new deep imports from other boundaries.

## Domain Invariants
- This feature remains a thin compatibility facade; it should not fork behavior away from the underlying `src/review/**` modules.
- Cross-boundary callers should import review-curation helpers from `src/features/review-curation/index.js`.
- Behavioral changes belong in the underlying review modules and must remain observable through this feature contract.

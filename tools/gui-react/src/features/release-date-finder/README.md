## Purpose

Embedded finder panel in IndexLab for discovering per-variant first-availability release dates. Fires single-shot Run and budget-loop Loop against the backend RDF orchestrator, renders one row per CEF variant with evidence chain + publisher chain, and groups runs by `loop_id` when emitted by a loop call.

## Public API (The Contract)

- `ReleaseDateFinderPanel` — React component (lazy-loaded via `finderPanelRegistry.generated.ts`).
- Hooks:
  - `useReleaseDateFinderQuery(category, productId)` — GET state + runs + publisher candidates per variant.
  - `useReleaseDateFinderRunMutation(category, productId)` — POST single-shot run (one LLM call per variant).
  - `useReleaseDateFinderLoopMutation(category, productId)` — POST budget loop (retries until publisher-reached or definitive unknown).
  - `useDeleteReleaseDateFinderRunMutation(category, productId)` / `useDeleteReleaseDateFinderAllMutation(category, productId)`.
- Types: `ReleaseDateFinderResult`, `ReleaseDateFinderCandidate`, `ReleaseDateFinderRun`, `EvidenceSource`.

## Dependencies

Allowed: `src/shared/ui/finder` (scaffolding), `src/features/operations` (`useFireAndForget`, `useIsModuleRunning`, `useRunningVariantKeys`), `src/features/color-edition-finder` (public API only — variant/edition data), `src/api/client`, `src/stores/*`.
Forbidden: Other feature internals.

## Domain Invariants

- Gate: requires CEF data before RDF can run (variant registry must exist).
- **Run** (header + per-row) is always clickable and spammable — mirrors PIF's View/Hero semantics. Each click fires a fresh run via `useFireAndForget`.
- **Loop** (header + per-row) locks while the corresponding loop is in flight: per-row Loop disables via `useRunningVariantKeys('rdf', productId, 'loop').has(variantKey)`; header Loop disables when every variant is already looping.
- Loop firings must pass `{ subType: 'loop', variantKey }` to `useFireAndForget` so the per-variant loop lock tracker sees them.
- Header buttons say **Run** and **Loop** — "all" is implied by being in the header. Per-row buttons say **Run** and **Loop** (Loop shows `...` while looping).
- Loop All fires one loop per variant in parallel (not one multi-variant loop) — matches PIF precedent and keeps per-variant UI feedback independent.
- All I/O routes through `/api/v1/release-date-finder/` — no ad-hoc fetches in components.

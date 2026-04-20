## Purpose

Embedded finder panel in IndexLab for discovering per-variant manufacturer part numbers (MPNs). Thin wrapper around `shared/ui/finder/GenericScalarFinderPanel.tsx`; backend orchestration lives at `src/features/sku/`. Mirrors the Release Date Finder pattern — a ~20 LOC wrapper that passes finder id + 3 codegen-emitted hooks + SKU-specific "How It Works" content.

## Public API (The Contract)

- `SkuFinderPanel` — React component (lazy-loaded via `finderPanelRegistry.generated.ts`). Thin wrapper around `GenericScalarFinderPanel`.
- Hooks (codegen-emitted from `finderModuleRegistry.js` entry `skuFinder`):
  - `useSkuFinderQuery(category, productId)` — GET state + runs + publisher candidates per variant.
  - `useSkuFinderRunMutation(category, productId)` — POST single-shot run (one LLM call per variant).
  - `useSkuFinderLoopMutation(category, productId)` — POST budget loop (retries until publisher-reached or definitive unknown).
  - `useDeleteSkuFinderRunMutation(category, productId)` / `useDeleteSkuFinderAllMutation(category, productId)`.
- Types: `SkuFinderResult`, `SkuFinderCandidate`, `SkuFinderRun`, `EvidenceRef` — auto-derived from backend Zod schemas (`src/features/sku/skuSchema.js`) via `scripts/generateFinderTypes.js` → `types.generated.ts`.

## Dependencies

Allowed: `src/shared/ui/finder` (scaffolding), `src/features/operations` (`useFireAndForget`, `useIsModuleRunning`, `useRunningVariantKeys`), `src/features/color-edition-finder` (public API only — variant registry), `src/api/client`, `src/stores/*`.
Forbidden: other feature internals.

## Domain Invariants

- Gate: requires CEF data before SKF can run (variant registry must exist).
- **Run** (header + per-row) is always clickable and spammable. Each click fires a fresh run via `useFireAndForget`.
- **Loop** (header + per-row) locks while the corresponding loop is in flight: per-row Loop disables via `useRunningVariantKeys('skf', productId, 'loop').has(variantKey)`; header Loop disables when every variant is already looping.
- Loop firings must pass `{ subType: 'loop', variantKey }` to `useFireAndForget` so the per-variant loop lock tracker sees them.
- Header buttons say **Run** and **Loop** — "all" is implied by being in the header. Per-row buttons say **Run** and **Loop** (Loop shows `...` while looping).
- Loop All fires one loop per variant in parallel (not one multi-variant loop) — matches RDF / PIF precedent.
- All I/O routes through `/api/sku-finder/` — no ad-hoc fetches in components.
- MPNs are returned as plain strings; no `formatValue` is applied (identity). Case is currently lowercased by the shared publisher normalizer — tracked as a follow-up architectural fix.

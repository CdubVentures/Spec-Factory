## Purpose

Embedded finder panel in IndexLab for discovering, processing, and managing product images across color/edition variants. Provides gallery view, carousel slot builder, and LLM vision evaluation.

## Public API (The Contract)

- `ProductImageFinderPanel` — React component (lazy-loaded via `finderPanelRegistry.generated.ts`)
- Types: `ProductImageEntry`, `ProductImageFinderRun`, `EvalRecord`, `CarouselProgress`, `ResolvedSlot`, `GalleryImage`, `ImageGroup`

## Dependencies

Allowed: `src/shared/ui/finder`, `src/stores/*`, `src/api/client`, `src/features/color-edition-finder` (public API only — variant/color data)
Forbidden: Other feature internals

## Domain Invariants

- Gate: requires CEF data before PIF can run (variant registry must exist)
- Carousel slots are user-overrideable (user override > eval winner > empty)
- `__cleared__` sentinel means "user intentionally emptied this slot"
- All images served via `/api/v1/product-image-finder/` routes
- Color atoms resolved dynamically from `variant_key` + CEF registry (no hardcoded combos)
- `variantBadgeBgStyle()` is a documented exception to the inline-style ban (runtime hex gradients)

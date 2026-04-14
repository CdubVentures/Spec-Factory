## Purpose

Per-product image discovery, download, vision evaluation, and carousel assembly. Each color variant and edition gets its own LLM search calls + RMBG background removal. Vision LLM evaluates view quality and selects hero images. Carousel slots are assembled per-variant with user override support.

## Public API (The Contract)

Exported from `index.js`:

- `propagateVariantRenames({ productId, productRoot, registryUpdates, specDb? })` — Update PIF data when CEF renames a variant. Walks images, runs, evals, carousel_slots. JSON + SQL.
- `backfillPifVariantIds({ specDb?, productRoot? })` — One-time scan: stamps variant_id on existing PIF data from CEF registry. Idempotent.
- `matchVariant(img, { variantId, variantKey })` — Predicate: match image/record to variant selector. variant_id wins when both present, falls back to variant_key.

Internal modules (not re-exported — auto-wired via `finderModuleRegistry`):

- `productImageFinder.js` — Orchestrator: LLM search + download + RMBG + strategy loop
- `imageEvaluator.js` — Vision eval: view ranking, hero selection, carousel slot resolution
- `carouselBuild.js` — Thin per-view and per-hero evaluation functions
- `carouselStrategy.js` — Pure function: carousel completion analysis + next-action decision

## Dependencies

- **Allowed**: `src/core/` (finder infra, config, LLM clients, operations registry)
- **Cross-feature (reads only)**: `src/features/color-edition/` — reads `color_edition.json` for variant data (colors, editions, variant_registry). Does NOT import CEF code; reads JSON directly.
- **Cross-feature (imports via public API)**: `src/features/indexing/` — `createPhaseCallLlm` for LLM routing
- **Forbidden**: Other feature internals

## Domain Invariants

- **Dual-state CQRS**: JSON is durable SSOT (`.workspace/products/{pid}/product_images.json`). SQL is frontend projection (rebuildable from JSON). Both must stay in sync.
- **variant_id is immutable**: Once assigned by CEF registry, a variant's `v_<8-hex>` hash never changes. PIF uses it as the stable join key for images, evals, and carousel slots.
- **variant_key is mutable**: Can change on CEF Run 2+ identity check. Propagation function updates all PIF references when this happens.
- **carousel_slots keyed by variant_key**: Human-readable JSON keys. Re-keyed by propagation on rename.
- **matchVariant predicate**: All image filtering uses `matchVariant()`. variant_id wins when both sides have it; falls back to variant_key for legacy data.
- **Accumulation across runs**: Images from multiple PIF runs are unioned per variant. Each run's images carry the variant_key from that run's CEF data.

## Purpose

Per-product image discovery, download, vision evaluation, and carousel assembly. Each color variant and edition gets its own LLM search calls + RMBG background removal. Vision LLM evaluates view quality and selects hero images. Carousel slots are assembled per-variant with user override support.

## Public API (The Contract)

Exported from `index.js`:

- `propagateVariantRenames({ productId, productRoot, registryUpdates, specDb? })` — Update PIF data when CEF renames a variant. Walks images, runs, evals, carousel_slots. JSON + SQL.
- `propagateVariantDelete({ productId, variantId, variantKey, productRoot, specDb? })` — Remove all PIF data for a deleted variant: images, run images, evaluations, carousel_slots. Updates SQL projection (images, image_count, carousel_slots).
- `backfillPifVariantIds({ specDb?, productRoot? })` — One-time scan: stamps variant_id on existing PIF data from CEF registry. Idempotent.
- `matchVariant(img, { variantId, variantKey })` — Predicate: match image/record to variant selector. variant_id wins when both present, falls back to variant_key.
- `resolveKeyFinderPifPriorityImageContext({ specDb, product, productRoot, fieldRule })` — Async read-only Key Finder context helper. When `fieldRule.ai_assist.pif_priority_images.enabled` is true, resolves PIF priority-view images for the CEF default/base variant, verifies local files exist, and returns prompt image metadata with base64 PNG thumbnails for LLM attachment or unavailable guidance. No persistence.

Internal modules (not re-exported — auto-wired via `finderModuleRegistry`):

- `productImageFinder.js` — Orchestrator: LLM search + download + RMBG + strategy loop
- `imageEvaluator.js` — Vision eval: view ranking, hero selection, carousel slot resolution
- `carouselBuild.js` — Thin per-view and per-hero evaluation functions
- `carouselStrategy.js` — Pure function: carousel completion analysis + next-action decision

## Dependencies

- **Allowed**: `src/core/` (finder infra, config, LLM clients, operations registry)
- **Cross-feature (reads SQL)**: Reads active variants from `specDb.variants.listActive(productId)` at runtime. Does NOT read `color_edition.json` for variant data — JSON is durable memory only, not a runtime read source.
- **Cross-feature (reads JSON)**: Reads `color_edition.json` for `siblings_excluded` from run history (prompt context enrichment only — not for variant data).
- **Cross-feature (imports via public API)**: `src/features/indexing/` — `createPhaseCallLlm` for LLM routing
- **Forbidden**: Other feature internals

## Domain Invariants

- **Dual-state CQRS**: JSON is durable SSOT (`.workspace/products/{pid}/product_images.json`). SQL is frontend projection (rebuildable from JSON). Both must stay in sync.
- **Variants table is the runtime source**: PIF reads active variants from `specDb.variants.listActive(productId)` at runtime, NOT from `color_edition.json selected.*`. The variants table is the SSOT for what variants exist and their labels/types/atoms.
- **variant_id is immutable**: Once assigned by CEF registry, a variant's `v_<8-hex>` hash never changes. PIF uses it as the stable join key for images, evals, and carousel slots.
- **variant_key is mutable**: Can change on CEF Run 2+ identity check. `propagateVariantRenames` updates all PIF references when this happens.
- **Variant deletion cascades to PIF**: When a variant is deleted, `propagateVariantDelete` removes all images, evaluations, runs, and carousel slots referencing that variant_id/variant_key (JSON + SQL summary + SQL run rows), and unlinks orphaned image files (and originals) from disk. Called from `color-edition/variantLifecycle.deleteVariant` step 6 — PIF is the `variantArtifactProducer` branch of the cascade (the `variantFieldProducer` branch is handled generically via `core/finder/variantCleanup.js`).
- **carousel_slots keyed by variant_key**: Human-readable JSON keys. Re-keyed by propagation on rename. Deleted by propagation on variant delete.
- **matchVariant predicate**: All image filtering uses `matchVariant()`. variant_id wins when both sides have it; falls back to variant_key for legacy data.
- **Accumulation across runs**: Images from multiple PIF runs are unioned per variant. Each run's images carry the variant_key from that run's CEF data.
- **Key Finder image context is read-only**: `resolveKeyFinderPifPriorityImageContext` exposes only PIF-evaluated priority images for the default/base variant. Missing or unconvertible local files produce unavailable guidance; raw image candidates are never promoted into Key Finder context.

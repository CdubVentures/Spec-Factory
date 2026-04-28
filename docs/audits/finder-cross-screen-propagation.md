# Finder Runs / Cross-Screen Propagation Audit

Date: 2026-04-28
Current severity: **HIGH**

## Scope

Finder run/delete events now resolve to the expected Review/Catalog-facing query keys for the checked key-finder paths. Remaining active risk is the PIF runtime read contract: some workflows still read/modify `product_images.json` directly instead of treating JSON as a durable mirror.

## Active Findings

### G1. PIF runtime JSON read/modify paths need contract tightening - HIGH
**Files:** `src/features/product-image/imageEvaluator.js`, `src/features/product-image/carouselBuild.js`, `src/features/product-image/productImageFinder.js`

PIF eval, carousel, and run workflows still use `product_images.json` as the read/modify source in places. Some writes are legitimate durable JSON mirror writes, but runtime reads should be checked case by case against the SQL-runtime-SSOT contract.

**Fix shape:** Audit each PIF JSON read. Keep JSON mirror writes, but move runtime reads to SQL projections or document why a specific read is rebuild/debug-only.

### G2. PIF `image-processed` does not update `pif_variant_progress` - LOW
**File:** `src/features/product-image/api/productImageFinderRoutes.js`

Image processing updates `product_images` but does not call `writePifVariantProgress()`. This is acceptable while rings represent slot fills rather than raw image counts.

**Fix shape:** Document the current ring semantics. If rings ever shift to image counts, write `pif_variant_progress` from the image-processed path.

### G3. CEF cascade pattern is correct but under-documented - INFO

CEF variant deletion cascades to PIF/RDF/SKU/publisher and should be treated as the canonical pattern for future variant-producing modules.

**Fix shape:** Document the cascade pattern in the architecture docs before adding another variant producer.

## Recommended Fix Order

1. **G1** - Audit PIF runtime JSON reads and tighten SQL runtime read contract.
2. **G3** - Document CEF cascade as the pattern for future variant producers.
3. **G2** - Keep as a watch item unless PIF ring semantics change.

# Finder Runs → Cross-Screen Propagation Audit

Date: 2026-04-27
Worst severity: **CRITICAL** — KF events omit `'catalog'` domain → Overview KeyTierRings + last-run cell stay stale after every KF run/loop.

## Per-finder event mapping (current)

Source: `src/core/finder/finderModuleRegistry.js`

```
CEF: run                  → review, product, color-registry
     run-deleted          → review, product
     deleted              → review, product
     variant-deleted      → review, product, product-image-finder, release-date-finder, sku-finder, publisher
     variants-deleted-all → review, product, product-image-finder, release-date-finder, sku-finder, publisher

PIF: run / run-deleted / deleted / loop / image-processed /
     image-deleted / batch-processed / evaluate / carousel-updated → catalog

RDF: run / run-deleted / deleted / loop → review, product, publisher
SKU: run / run-deleted / deleted / loop → review, product, publisher

KF:  run / loop / run-deleted / field-deleted / deleted → review, product, publisher
```

## Consumer surfaces

1. Overview catalog row — variant cells, rings, diamonds, last-run timestamps, KeyTierRings.
2. Review grid — `field_candidates`, scalar variants cell, key tier progress.
3. Finder panel — discovery history, run history, prompt preview.
4. Command Console — active queue, last-run badge, picked keys chip.
5. Drawers — DiscoveryHistoryDrawer, ManualOverride, FullReset.

## Per-finder × mutation × surface matrix

| Finder | Run | Loop | Delete-Run | Delete-All | Accept-Candidate | Manual-Override |
|---|---|---|---|---|---|---|
| CEF | All ✓ | n/a | All ✓ | All ✓ | Review ✓ | Review ✓ |
| PIF | Overview + Panel ✓ | Both ✓ | Both ✓ | Both ✓ | n/a | Overview + Panel ✓ |
| RDF | Review + Overview ✓ | Both ✓ | Both ✓ | Both ✓ | Review ✓ | Review ✓ |
| SKU | Review + Overview ✓ | Both ✓ | Both ✓ | Both ✓ | Review ✓ | Review ✓ |
| **KF** | Review only ✗ | Review only ✗ | Review ✓ | Review ✓ | Review ✓ | n/a |

## Identified gaps

### G1. KF events omit `'catalog'` domain — **CRITICAL**
**File:** `src/core/finder/finderModuleRegistry.js:731–737`
`['key-finder', :cat]` is invalidated by KF events but `['catalog', :cat]` is not. Overview's KeyTierRings and `kfLastRunAt` cell stay stale after every KF run/loop until the user navigates away and back, or until another finder's mutation incidentally invalidates the catalog.

**Fix shape:**
```js
'run':           ['review', 'product', 'publisher', 'catalog'],
'loop':          ['review', 'product', 'publisher', 'catalog'],
'run-deleted':   ['review', 'product', 'publisher', 'catalog'],
'field-deleted': ['review', 'product', 'publisher', 'catalog'],
'deleted':       ['review', 'product', 'publisher', 'catalog'],
```
Plus the three missing event-registry entries from the Review/Overview audit (`key-finder-field-deleted`, `key-finder-deleted`, `key-finder-run-deleted`).

### G2. PIF `image-processed` doesn't update `pif_variant_progress` — LOW
**File:** `src/features/product-image/api/productImageFinderRoutes.js:828`
Image processing updates `product_images` but does not call `writePifVariantProgress()`. Acceptable today because rings show *slot fills*, not raw image counts — but if ring semantics ever shift to image counts this becomes a real drift.

**Fix shape:** document as "by design, ring counts = slot fills"; if semantics change, call `writePifVariantProgress()` in the image-processed path.

### G3. CEF cascade is correct but undocumented — INFO
CEF's `variant-deleted` and `variants-deleted-all` correctly fan out to PIF/RDF/SKU/publisher. This is the only finder with an explicit cross-finder cascade. Worth documenting as the canonical pattern for the next variant producer that needs the same.

### G4. Last-run timestamps depend on catalog refresh granularity — ACCEPTABLE
Catalog query is global per-category. A per-product mutation invalidates the whole row map. Per-product query keys would explode (~350×5 entries) — current trade-off is acceptable.

## Confirmed-good patterns

- CEF variant-cascade (memory: `feedback_cef_owns_colors_editions.md`).
- `pif_variant_progress` projection writes co-located with PIF mutations (`writePifVariantProgress` after run, loop, slot writes).
- `key_tier_progress` derived from `field_rules.difficulty` + CEF variants on every catalog build (so once `'catalog'` is in the KF domain list, rings update automatically).
- Run/loop mutations for RDF/SKU correctly invalidate Review.

## Recommended fix order

1. **G1** — add `'catalog'` to all five KF event domains. 5-line change in `finderModuleRegistry.js`. Highest user-visible impact.
2. Add the three missing KF events to `EVENT_REGISTRY` (overlaps with review/overview audit).
3. **G3** — document the CEF cascade pattern in `docs/03-architecture/live-updates.md`.
4. Telemetry: log query-key invalidations from `dataChangeScheduler` to confirm the fix lands.

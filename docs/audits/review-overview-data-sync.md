# Review Grid ↔ Overview Catalog Data Sync Audit

Date: 2026-04-27
Worst severity: **HIGH** (3 missing event-registry entries → user-visible 60 s lag).

## Shared data inventory

| Data | SQL owner | Review query keys | Overview query keys |
|---|---|---|---|
| Catalog metadata | `products` | `['reviewProductsIndex', cat]` | `['catalog', cat]` |
| Field candidates | `field_candidates` | `['candidates', cat, productId, field]` | (derived, in CatalogRow) |
| Published values | `published` | inside `reviewProductsIndex.fields[*]` | (derived) |
| Variant registry | `variants` | inside `reviewProductsIndex.fields[*].variant_values` | `pifVariants[]`, `skuVariants[]`, `rdfVariants[]` |
| Last-run timestamps | `operations` | (not used) | `cefLastRunAt` … `kfLastRunAt` |
| Key tier progress | `key_tier_progress` | (not used) | `keyTierProgress[]` |
| Confidence/concrete-gate | per-field state | `selected.status/color` | `confidence`, `coverage`, `fieldsFilled` |

**Architectural insight:** Review reads raw SQL via `reviewProductsIndex`; Overview reads SQL projections via `catalog`. They share **none** of their query keys, so every mutation must update both caches.

## Mutation coverage matrix

| Mutation | Review cache patched | Overview cache patched | Event in `EVENT_REGISTRY`? |
|---|---|---|---|
| Manual override | ✓ `setQueryData(reviewProductsIndex)` | ✓ via `catalogRowPatch` | ✓ `review-manual-override` |
| Clear published | ✓ | ✓ | ✓ `review-clear-published` |
| Delete candidate (single) | ✓ | ✓ | ✓ `candidate-deleted` |
| Delete all candidates | ✓ | ✓ | ✓ `candidate-deleted` |
| Unpublish field row (all products) | ✓ | ✓ | ✓ `key-finder-unpublished` |
| Delete field row (all products) | ✓ | ✓ | ❌ **`key-finder-field-deleted` MISSING** |
| Unpublish product non-variant keys | ✓ | ✓ | ✓ `key-finder-unpublished` |
| Delete product non-variant keys | ✓ | ✓ | ❌ **`key-finder-field-deleted` MISSING** |
| Bulk run/loop (Command Console) | ❌ Review NOT patched | ✓ optimistic | ✓ per finder |
| Full reset (CEF/PIF/etc.) | (relies on backend event) | (relies on backend event) | ✓ per finder |

## Identified gaps

### G1. Three missing key-finder events in registry — **CRITICAL**
**File:** `src/core/events/eventRegistry.js`
**Events fired but unmapped:**
- `key-finder-field-deleted` — fired by `ReviewPage.tsx:530, 578` and `keyFinderQueries.ts:113`
- `key-finder-deleted` — fired by `useDeleteAllKeyFinderRunsMutation`
- `key-finder-run-deleted` — fired by `useDeleteKeyFinderRunMutation`

When the resolver gets an unmapped event, it returns no domains → zero invalidation. Review patches its own cache locally; Overview waits the full `staleTime` (60 s on `catalog` reads) to refresh.

**Fix shape:** add to `EVENT_REGISTRY`:
```
'key-finder-field-deleted': ['key-finder', 'review', 'product', 'publisher', 'catalog'],
'key-finder-deleted':       ['key-finder', 'review', 'product', 'catalog'],
'key-finder-run-deleted':   ['key-finder', 'review'],
```
Then regenerate `invalidationResolver.d.ts`.

### G2. Bulk Command Console actions don't invalidate Review — MEDIUM
**File:** `tools/gui-react/src/pages/overview/CommandConsole.tsx:531-545`
PIF carousel clear and similar bulk paths optimistically `setQueryData(['catalog', cat])` and invalidate `['catalog', cat]` + `['product-image-finder', cat]`, but **never** touch `['reviewProductsIndex', cat]`. Review shows stale PIF state for 5 s.

**Fix shape:** extend `catalogRowPatch` (`features/catalog/api/catalogRowPatch.ts`) to also patch `['reviewProductsIndex', cat]` for the same productIds, OR add `['reviewProductsIndex', cat]` to the explicit invalidate list.

### G3. Review optimistic patches don't propagate to Overview — MEDIUM
**File:** multiple in `ReviewPage.tsx` (lines 370, 545, 561, 577, 593, 605, 610, 623, 640, 653, 657)
Review's `setQueryData(['reviewProductsIndex', cat])` updates its own cache instantly, but Overview's `['catalog', cat]` only updates after the backend round-trips and the `data-change` event fires. User sees a 50–200 ms gap when switching panels.

**Fix shape:** introduce a shared `patchOverviewRowFromReviewMutation()` helper that maps Review's field-state delta to CatalogRow fields (`confidence`, `coverage`, `fieldsFilled`, `keyTierProgress`). Co-locate with `catalogRowPatch.ts`.

### G4. Dead `catalog-review` query in Review — LOW
**File:** `tools/gui-react/src/features/review/components/ReviewPage.tsx:168`
Review fetches `['catalog-review', category]` but never reads the result. Dead bandwidth + cache pollution.

**Fix shape:** delete the query, or wire it into the actual UI.

### G5. `publishConfidenceThreshold` invalidation is global — LOW
**File:** `tools/gui-react/src/features/review/components/ReviewPage.tsx:197-201`
A threshold change refetches **all** `['candidates']` cross-category. Acceptable today (rare edit) but should be scoped to the active category.

**Fix shape:** narrow to `['candidates', category]`.

## Confirmed-good patterns

- `tools/gui-react/src/features/catalog/api/catalogRowPatch.ts` — fetches the changed row, surgical `setQueryData` patches all 5 affected catalog query keys, falls back to invalidate.
- `tools/gui-react/src/features/catalog/components/productCacheOptimism.ts` — optimistic patches with rollback for product mutations.
- `tools/gui-react/src/features/review/state/reviewCandidateCache.ts` — surgical `setQueryData` for every candidate mutation.
- `useDataChangeMutation` — the contract works; the gaps above are mutations that bypass it.

## Recommended fix order

1. **G1** — add the three missing KF events. 5-minute fix. Highest impact.
2. **G2** — extend `catalogRowPatch` to also patch `reviewProductsIndex`. 15 min.
3. **G3** — Review→Overview optimistic patch helper. 30 min.
4. **G5** — scope threshold invalidation to category. 2 min.
5. **G4** — delete dead query or wire it up.

## Data-flow diagram (current state)

```
USER ACTION IN REVIEW
  ↓
useDataChangeMutation → emit event → backend mutation → emit data-change WS
  ↓
useWsEventBridge in AppShell:
  • invalidateDataChangeQueries() (75 ms batch via dataChangeScheduler)
  • patchCatalogRowsFromDataChange()  ← only fires if domains include 'catalog'
  ↓
Review:   ['reviewProductsIndex', cat] invalidated → refetch
Overview: ['catalog', cat] patched (if event domain mapped)

If event unmapped (G1) → no invalidation → stale until staleTime expires
If event mapped but Review not in domains (G2) → Review stale
```

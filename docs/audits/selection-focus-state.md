# Selection / Focus State Audit

Date: 2026-04-27
Worst severity: **HIGH** — Review drawer keeps a stale `activeCell` if the targeted product/field is deleted in another flow.

## Selection store inventory

| Store | File | Scope | Persist? |
|---|---|---|---|
| Overview selection | `pages/overview/overviewSelectionStore.ts` | Multi-select product ids per category | No (in-memory) |
| IndexLab picker | `features/indexing/state/indexlabStore.ts` | brand / model / productId / runId + recents | localStorage |
| Review drawer | `features/review/state/reviewStore.ts` | `activeCell {productId, field}` | No |
| Discovery history drawer | `stores/finderDiscoveryHistoryStore.ts` | finderId / productId / category + filters | No |
| Component review | `features/review/state/componentReviewStore.ts` | `selectedEntity {type, name, maker, rowIndex}` + `flaggedItems` | No |

## Identified gaps

### G1. Review drawer keeps stale `activeCell` after entity deletion — **HIGH**
**File:** `tools/gui-react/src/features/review/components/ReviewPage.tsx`
If the active product/field is deleted (in another tab, by another panel, or by `key-finder-field-deleted`), the drawer remains open but `activeProduct`/`activeFieldState` resolve to undefined. User can type but mutations error silently.

**Fix shape:** add an effect that closes the drawer when `activeProduct == null` or the field is no longer in the field map.

### G2. Overview selection survives bulk delete — MEDIUM
**File:** `pages/overview/CommandConsole.tsx:330–350` (PIF/CEF Delete-All paths)
`useOverviewSelectionStore` keeps deleted product ids in `byCategory[category]`. After bulk delete, ActiveAndSelectedRow can show ghost badges.

**Fix shape:** subscribe the selection store to catalog row removals, or call `clear(category)` (or filter ids) on successful delete.

### G3. IndexLab picker can hold a deleted productId/runId — MEDIUM
**File:** `pages/overview/IndexLabLink.tsx:36–38`
Picker state is persisted to localStorage. If the product is deleted server-side, the next IndexingPage load shows blank or "Not in catalog" until the self-heal effect runs.

**Fix shape:** when bulk delete completes, if the deleted ids include current `pickerProductId`/`pickerRunId`, clear them immediately.

### G4. Discovery history drawer can target a ghost product — MEDIUM
**File:** `shared/ui/finder/DiscoveryHistoryDrawer.tsx`
Reopening the drawer for a deleted product produces an empty/404 result with no user feedback.

**Fix shape:** validate `(productId, finderId)` against the catalog query before rendering content; auto-close + toast if invalid.

### G5. Component-review flagged-items rowIndex drifts after sort/filter — LOW-MEDIUM
**File:** `pages/component-review/ComponentSubTab.tsx`
`flaggedItems[].rowIndex` is captured at flag time; after re-sort/filter, the index points at a different entity.

**Fix shape:** store identity (`type, name, maker, variant`) only; derive `rowIndex` at render via `Array.findIndex`.

### G6. Multi-category selection mismatch (future) — LOW
**File:** `useUiCategoryStore` + `CommandConsole.tsx`
Today the app is single-category ("mouse"). When a second category is added, selections from the previous category will leak into Command Console actions because `category` is captured by props at render.

**Fix shape:** subscribe Command Console to category and re-render; clear selection on category change.

### G7. PIF variant ring click → no Review filter sync (future) — LOW
**Files:** `pages/overview/PifVariantPopover.tsx`, `features/product-image-finder/components/ProductImageFinderPanel.tsx`
Today Review has no variant dimension; if it gets one, clicking a PIF variant ring won't filter Review. Document the boundary.

## Confirmed-good patterns

- Drawer close (`useReviewStore.closeDrawer`) resets all transient state.
- Discovery history drawer fields (`fieldKeyFilter`, `variantIdFilter`) reset on close.
- IndexLab picker localStorage persistence + sanitization on hydration.
- Overview selection keyed by category — no cross-category leak today.

## Recommended fix order

1. **G1** — close Review drawer if active entity vanishes. ~30 min.
2. **G2** — clear selection on bulk delete. ~15 min.
3. **G3** — clear IndexLab picker when deletion includes its targets. ~15 min.
4. **G4** — discovery drawer target validation. ~30 min.
5. **G5** — refactor flagged-items to identity-based.

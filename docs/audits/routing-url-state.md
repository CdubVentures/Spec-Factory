# Routing / URL / Deep-Link State Audit

Date: 2026-04-27
Worst severity: **MEDIUM** — Review drawer state is purely in-memory; refresh closes it. No deep links are shareable.

## Routing model

- `HashRouter` (`tools/gui-react/src/App.tsx:68`).
- 16 routes registered via `tools/gui-react/src/registries/pageRegistry.ts`.
- Zero `useSearchParams` callsites — query strings unused for state.

## State persistence tiers

| State | Owner | Persisted? | Cross-tab? | Refresh-safe? |
|---|---|---|---|---|
| Active category | `uiCategoryStore` | localStorage | ✓ broadcast | ✓ |
| Indexing tab | `tabStore` | localStorage | ✓ | ✓ |
| Indexing picker (brand/model/product/run) | `indexlabStore` | localStorage | ✓ | ✓ |
| Review grid filters (brand, sort, confidence, coverage, runStatus) | `reviewGridSessionState` | sessionStorage → localStorage fallback | ✓ | ✓ |
| Collapse / detail-column toggles | `collapseStore` | localStorage | ✓ | ✓ |
| Theme / timezone | `uiThemeStore`, `uiSettingsStore` | localStorage | ✓ | ✓ |
| **Overview multi-select** | `overviewSelectionStore` | ✗ | ✗ | **✗** |
| **Review drawer activeCell + cellMode + editingValue** | `reviewStore` | ✗ | ✗ | **✗** |
| **Discovery History drawer (finder/product/filter)** | `finderDiscoveryHistoryStore` | ✗ | ✗ | **✗** |
| **Component Review selectedEntity + flaggedItems** | `componentReviewStore` | ✗ (sub-tab via tabStore is) | ✗ | **✗** |

## Identified gaps

### G1. Review drawer dies on refresh — MEDIUM
**Files:** `tools/gui-react/src/features/review/components/ReviewPage.tsx:125–127`, `reviewStore.ts:94–96`
Refreshing the page closes the drawer. `activeCell` and `editingValue` are pure Zustand. Users mid-edit lose context.

**Fix shape:** encode `?product=…&field=…` in the hash (HashRouter supports query strings: `/#/review?product=MM731&field=release_date`). On mount read the params; if present, call `openDrawer`. Fall back to store.

### G2. Overview multi-select dies on refresh — MEDIUM
**File:** `tools/gui-react/src/pages/overview/overviewSelectionStore.ts:26–53`
No `persist()` middleware. Bulk selection for Command Console is wiped on refresh. Also creates a cross-tab desync (Tab 1 selection ≠ Tab 2).

**Fix shape:** add `zustand/middleware/persist` keyed per category. ~10 min.

### G3. No deep-link sharing for any contextual surface — MEDIUM
**Files:** Indexing Lab `IndexLabLink.tsx:26–40`, Review, Component Review.
"Check this product's color edition" requires navigating + state setup; can't paste a URL.

**Fix shape:** define a small URL contract per page:
- `/#/indexing?category=mouse&brand=cooler-master&product=MM731`
- `/#/review?category=mouse&product=MM731&field=release_date`
- `/#/review-components?category=mouse&type=switches&entity=tactile_blue`
On mount, hydrate the relevant store from search params; navigate without params still works.

### G4. Discovery history drawer state non-persistent — LOW
**Files:** `tools/gui-react/src/stores/finderDiscoveryHistoryStore.ts:33–45`, `DiscoveryHistoryDrawer.tsx`
Drawer closes on refresh. Low frequency end-user surface.

**Fix shape:** optional URL fragment encoding (or skip if not worth the complexity).

### G5. No deletion → route auto-redirect — LOW
If product X is deleted (in another tab / by another flow) while Review drawer has it active, the drawer renders against undefined data. Mutations error silently.

**Fix shape:** subscribe to `data-change` deletion events on Review; if `activeCell.productId` is gone, close the drawer + toast "Product no longer in catalog". (Pairs with selection-focus audit G1.)

### G6. Indexing Lab picker requires session state — MEDIUM
`IndexLabLink.tsx:26–40` sets Zustand picker state then `navigate('/indexing')`. Pasting `/#/indexing` directly shows blank picker. Tab 2 paste loses Tab 1 context.

**Fix shape:** also encode picker state in `/#/indexing?...`. Hydrate on mount before reading store. Memory mentions `feedback_test_indexlab_via_gui.md` — never invoke via CLI; deep link should preserve "click into picker" UX.

## Confirmed-good patterns

- Category store broadcasts via localStorage → all tabs sync category instantly.
- `reviewGridSessionState` cleverly uses sessionStorage with a localStorage fallback for migration.
- Page registry is the single source of truth for routing — no scattered route definitions.
- Indexing Lab's "self-heal" effect clears `pickerProductId` if it's not in the catalog.

## Recommended fix order

1. **G2** — `persist()` for `overviewSelectionStore`. ~10 min, immediate UX win.
2. **G1** — Review drawer URL params. ~45 min.
3. **G6** — Indexing Lab URL params. ~30 min.
4. **G3** — extend deep-link contract to Component Review. ~30 min each surface.
5. **G5** — deletion auto-close (pairs with selection-focus audit G1).
6. **G4** — defer.

## URL contract sketch (proposed)

```
/#/                                           Overview (current category from store)
/#/?category=mouse                            Overview (override category via URL)
/#/review?product=MM731&field=release_date    Review with drawer auto-open
/#/indexing?brand=cooler-master&product=MM731 Indexing with picker hydrated
/#/storage?run=20260427-abcdef                Storage focused on a run
```

All hash-router compatible — no router migration needed.

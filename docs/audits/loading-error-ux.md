# Loading / Error State UX Audit

Date: 2026-04-27
Worst severity: **HIGH** — there is no global error toast; query and mutation failures are largely invisible to the user. WS reconnect is silent and may cascade into a page reload.

## Infrastructure

| Concern | File | Status |
|---|---|---|
| Global error boundary | `tools/gui-react/src/shared/ui/feedback/ErrorBoundary.tsx` | ✓ wraps all pages in `App.tsx:57`; only catches render errors, not async failures |
| Suspense fallback | `App.tsx:58` | ✓ `<Spinner />` wraps lazy pages |
| QueryClient defaults | `App.tsx:31–39` | `staleTime: 5_000`, `retry: 1`, no `refetchOnWindowFocus`. No global `onError`. |
| WS reconnect | `api/ws.ts` | ✓ idle watchdog (60 s), exponential backoff (1–30 s), invalidates queries; **silent UX** |
| Skeleton primitives | `feedback/Spinner.tsx`, `feedback/SkeletonBlock.tsx`, `FinderPanelSkeleton` | Available |
| Toast / notification system | – | **Missing.** `AlertBanner` exists but is per-page, no queue. |

## Per-page coverage

| Page | Loading skeleton | Empty state | Error display | Retry UI |
|---|---|---|---|---|
| Overview catalog | ✗ | ✗ silent empty grid | ✗ | ✗ |
| Billing | ✓ comprehensive | ✓ "No data" | ✗ | ✗ |
| Indexing | ~ Suspense + `FinderPanelSkeleton` | ~ | ✓ terse `actionError` | ✗ |
| Publisher | ~ minimal | ? | ✗ | ✗ |
| Component review | ✗ | ✗ | ✗ silent rollback | ✗ |
| Runtime Ops | ? | ? | ? | ? |
| Finder popovers (Key tier, PIF, CEF) | ✓ "Loading…" + empty messages | ✓ | ✗ | ✗ |
| Studio | ? | ? | ? | ? |

## Identified gaps

### G1. No global error toast — **HIGH**
**File:** `App.tsx:31–39`
QueryClient has no `defaultOptions.queries.onError` / `mutations.onError`. Failures are silent unless a component renders an `AlertBanner` itself. User sees stale data and assumes it's current.

**Fix shape:** add a `ToastContainer` + `useToast` hook; wire it into QueryClient defaults and `useDataChangeMutation`. Auto-dismiss after 5 s; "Retry" action on the toast.

### G2. Mutation rollback is invisible — HIGH
**File:** `pages/component-review/ComponentSubTab.tsx:315–322` (and similar)
`onError` rolls back optimistic state but never tells the user the action failed. User believes the mutation succeeded.

**Fix shape:** every `useDataChangeMutation` should default to surfacing a toast on error. Component opt-out for cases that handle errors locally.

### G3. WS disconnect / reconnect is silent — HIGH
**File:** `tools/gui-react/src/api/ws.ts`
60-second idle watchdog can trigger a full page reload with no warning. User experiences as "the app crashed".

**Fix shape:** `ConnectionStatusBar` with three states (connected / reconnecting / offline). Wire `WsManager.onclose` and `.onopen`. Replace silent reload with a "Reload" button.

### G4. Overview / Publisher / Component Review have no skeletons — HIGH
Catalog grid, candidate tables, and component tables render empty while loading. User can't distinguish "still loading" from "no data".

**Fix shape:** add `SkeletonBlock` / row-skeleton patterns matching the `Billing` page model. Reuse the existing primitives.

### G5. Indexing `actionError` is terse — MEDIUM
**File:** `IndexingPage.tsx:368–371`
"action failed: undefined" is a common user-visible error. Lacks context, no retry button.

**Fix shape:** route through the toast system (G1); include the server error message.

### G6. No exponential backoff on retry — MEDIUM
`retry: 1` with no delay strategy. Transient network blips that need 2–3 s to resolve still surface as failures.

**Fix shape:** `retryDelay: (n) => Math.min(1000 * 2 ** n, 30000)`; `retry: 3` for queries (not mutations).

### G7. Stale-refetch indication only on Billing — LOW
`isPlaceholderData` → `sf-stale-refetch` CSS class only used on Billing. Other pages refetch silently with no visual cue.

**Fix shape:** apply the same dimming token wherever a query has `placeholderData`.

### G8. Empty-state copy inconsistent — LOW
"No data", "No keys in this tier", silent empty — different patterns across pages.

**Fix shape:** create a single `EmptyState` component (icon + title + helper text + optional action) and standardize copy.

### G9. Error boundary doesn't handle async-thrown errors — LOW
`ErrorBoundary` catches render exceptions but not promise rejections from queries / mutations. Combined with G1, async failures slip past everything.

**Fix shape:** route async errors through the toast system; reserve `ErrorBoundary` for true render failures.

### G10. Global `Suspense` fallback is undifferentiated — LOW
A single `<Spinner />` for every page-level lazy load. Indexing has its own panel-level skeleton; other pages don't.

**Fix shape:** per-page `Suspense` boundaries with skeletons matching the page shape.

## Confirmed-good patterns

- `Billing` page is the model: comprehensive `SkeletonBlock` coverage, "No data" callouts, `isPlaceholderData` styling.
- `KeyTierPopover` correctly disambiguates loading vs empty: "Loading keys…" while `isLoading && !rowsForTier.length`, then "No keys in this tier".
- `ComponentSubTab` uses optimistic updates with proper rollback on error (just needs visible feedback).
- WS manager has idle watchdog, exponential reconnect, and `onReconnect` rehydration — solid fundamentals.
- `FinderPanelSkeleton` + `Suspense` for lazy Indexing finder panels.

## Recommended fix order

1. **G1** — global error toast system. Unblocks G2, G3, G5.
2. **G3** — `ConnectionStatusBar` for WS state.
3. **G4** — skeletons for Overview / Publisher / Component review.
4. **G2** — toast on mutation failure with optional retry.
5. **G5** — improve Indexing error copy via the toast system.
6. **G6** — exponential backoff in QueryClient defaults.
7. **G8** — `EmptyState` component + standardized copy.
8. **G7, G9, G10** — polish.

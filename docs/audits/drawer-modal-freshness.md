# Drawer / Modal Freshness Audit

Date: 2026-04-27
Worst severity: **MEDIUM** — PIF and ComponentReview drawers carry 30–60 s `staleTime`; reopening after a mutation can show pre-mutation data.

## Inventory

| Component | File | Lifecycle | `staleTime` | Verdict |
|---|---|---|---|---|
| DiscoveryHistoryDrawer | `shared/ui/finder/DiscoveryHistoryDrawer.tsx` | Portal, stays mounted, query enabled when open | (none — global default 5 s) | LOW gap (implicit) |
| PromptPreviewModal | `shared/ui/finder/PromptPreviewModal.tsx` | Unmounts on close | `0` (via `promptPreviewQueries.ts:66`) | ✅ Excellent |
| PifVariantPopover | `pages/overview/PifVariantPopover.tsx` | Stays mounted; query lazy on `popOpen` | `30_000` | MEDIUM gap |
| KeyTierPopover | `pages/overview/KeyTierPopover.tsx` | Stays mounted; query lazy on open | `5_000` | ✅ |
| ComponentReviewDrawer | `pages/component-review/ComponentReviewDrawer.tsx` | Drawer | `60_000` (impact query) | MEDIUM gap |
| CefRunPopover | `pages/overview/CefRunPopover.tsx` | No queries | n/a | ✅ |

## Identified gaps

### G1. DiscoveryHistoryDrawer has no explicit `staleTime` — LOW
**File:** `shared/ui/finder/DiscoveryHistoryDrawer.tsx`
`runsQuery` inherits the global 5 s default. Works today, but the drawer is a "show me the truth right now" surface — it should be explicit.

**Fix shape:** declare `staleTime: 0` (or document the 5 s).

### G2. PifVariantPopover holds 30 s `staleTime` — MEDIUM
**File:** `pages/overview/PifVariantPopover.tsx:106–148`
Closing the popover during a PIF mutation and reopening within 30 s shows pre-mutation data (rings, image counts, slot fills).

**Fix shape:** either drop to `5_000` (matches KeyTierPopover), or invalidate on the popover-open transition after a relevant mutation. The data-change WS path will refresh open popovers; the gap is the *closed→open* transition window.

### G3. ComponentReviewDrawer impact query holds 60 s `staleTime` — MEDIUM
**File:** `pages/component-review/ComponentReviewDrawer.tsx`
`['componentImpact', category, componentType, item.name]` is cached for 60 s. Cross-product impact counts can be obviously stale after a fast workflow (override → next item).

**Fix shape:** drop to `30_000` or `0`; or rely on data-change events to invalidate.

## Confirmed-good patterns

- **PromptPreviewModal** with `staleTime: 0` is the canonical "always fresh on open" pattern. New drawers should follow it.
- All audited drawers/modals avoid the snapshot-via-props anti-pattern (no `data` prop carrying cached state).
- All mutations inside drawers go through `useDataChangeMutation` with `extraQueryKeys` for surgical invalidation.
- Lazy query enablement (`enabled: open && …`) avoids wasted fetches.
- WS bridge handler invalidates open popovers via the data-change scheduler.

## Recommended `staleTime` policy

| Surface category | `staleTime` |
|---|---|
| Prompts / live previews | 0 |
| Per-product summaries / counts | 5 000 |
| Cross-product impact / metadata | 30 000 |
| Truly static reference (reserved keys, etc.) | Infinity |

## Recommended fix order

1. **G2** — PIF popover `staleTime: 5_000`. ~1-line change.
2. **G3** — ComponentReview impact `staleTime: 30_000`. ~1-line.
3. **G1** — discovery history drawer explicit `staleTime: 0`. ~1-line.
4. Add a lint rule (or PR-time check) that flags new `useQuery({ … staleTime: > 30_000 })` calls inside `*Drawer*.tsx` / `*Modal*.tsx` / `*Popover*.tsx`.

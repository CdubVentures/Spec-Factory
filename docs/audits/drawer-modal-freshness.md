# Drawer / Modal Freshness Audit

Date: 2026-04-28
Current severity: **MEDIUM**

## Scope

Drawer and popover queries should avoid showing old snapshots after a user closes and reopens a detail surface.

## Active Findings

### G1. PIF variant popover uses a 30-second stale window - MEDIUM
**File:** `tools/gui-react/src/features/product-image-finder/components/PifVariantPopover.tsx`

Several PIF popover queries can show pre-mutation image/evaluation data after reopen.

**Fix shape:** Lower stale time to a small value or zero for popover detail queries.

### G2. Component Review impact drawer uses a 60-second stale window - MEDIUM
**File:** `tools/gui-react/src/features/component-review/components/ComponentReviewDrawer.tsx`

Impact data can stay stale for up to a minute after related mutations.

**Fix shape:** Lower stale time and/or invalidate on relevant component/enum events.

### G3. Discovery history drawer has no explicit freshness contract - LOW

The drawer relies on defaults rather than a local stale-time decision.

**Fix shape:** Add an explicit freshness policy if the drawer becomes a stale-data complaint.

## Recommended Fix Order

1. **G1** - PIF popover freshness.
2. **G2** - Component Review impact freshness.
3. **G3** - Defer.

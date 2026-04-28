# Server-Side In-Memory Cache Audit

Date: 2026-04-28
Current severity: **LOW-MEDIUM**

## Scope

Field Studio map saves co-invalidate key caches. Remaining work is route-specific cache invalidation and pruning dead cache plumbing.

## Active Findings

### G1. Direct field-key-order PUT may miss `reviewLayoutByCategory` invalidation - LOW-MEDIUM
**File:** `src/features/studio/api/studioRoutes.js`

The patch path invalidates both `sessionCache` and `reviewLayoutByCategory`, but the direct `PUT /studio/:cat/field-key-order` path appears to invalidate only `sessionCache`.

**Fix shape:** Add `reviewLayoutByCategory.delete(category)` to the direct PUT path if the cache is active.

### G2. `reviewLayoutByCategory` may be unused - LOW
**File:** `src/app/api/specDbRuntime.js`

The Map appears to have invalidation calls but little or no active read/write value.

**Fix shape:** Confirm whether it is alive. If unused, delete it per the subtractive engineering mandate.

### G3. Component/enum cache invalidation plumbing may be dead - LOW

Some route context passes field-rules cache invalidators that component/enum mutations do not use.

**Fix shape:** Remove dead plumbing or add a WHY comment explaining why these mutations do not affect field rules.

## Recommended Fix Order

1. **G2** - Confirm whether `reviewLayoutByCategory` is alive.
2. **G1** - Wire direct field-key-order PUT if the cache is active.
3. **G3** - Remove or annotate dead invalidator plumbing.

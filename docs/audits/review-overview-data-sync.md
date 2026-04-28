# Review Grid / Overview Catalog Data Sync Audit

Date: 2026-04-28
Current severity: **LOW-MEDIUM**

## Scope

Review reads raw SQL through `['reviewProductsIndex', category]`. Overview reads catalog projections through `['catalog', category]`. Correctness is now covered by data-change invalidation for the checked key-finder paths; remaining findings are latency/efficiency cleanup.

## Active Findings

### G1. Review optimistic patches do not synchronously patch Overview - LOW-MEDIUM
**Files:** `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `tools/gui-react/src/features/catalog/api/catalogRowPatch.ts`

Review updates its own query cache immediately, while Overview waits for the backend round trip and data-change/refetch path. This is correct but can show a short 50-200 ms mismatch when switching panels immediately after a Review mutation.

**Fix shape:** Defer unless visible in normal workflow. If it becomes user-visible, add a shared Review-to-Catalog patch helper beside `catalogRowPatch.ts`.

### G2. `publishConfidenceThreshold` local invalidation is broad - LOW
**File:** `tools/gui-react/src/features/review/components/ReviewPage.tsx`

The local threshold-change path invalidates all `['candidates']` queries. Backend threshold reconciliation already emits per-category `publisher-reconcile`, so this is a local efficiency cleanup rather than a correctness bug.

**Fix shape:** Narrow the local invalidation to `['candidates', category]`.

## Recommended Fix Order

1. **G2** - Scope threshold invalidation to category.
2. **G1** - Only add shared optimistic Overview patching if measured UX pain justifies it.

# Loading / Error State UX Audit

Date: 2026-04-28
Current severity: **HIGH**

## Scope

The app has page-local error handling but no consistent global failure, retry, reconnect, or stale-refetch UX contract.

## Active Findings

### G1. No global error toast contract - HIGH

Query and mutation failures are often local, silent, or log-only.

**Fix shape:** Add a global error notification path used by shared API/query/mutation utilities.

### G2. Mutation rollback is invisible - HIGH

Optimistic rollback can make UI state jump back without explaining what failed.

**Fix shape:** Pair rollback with a toast or inline error that names the failed action and gives a retry path when safe.

### G3. WS disconnect/reconnect state is silent - HIGH

Reconnect now avoids a normal page reload path, but users still lack visible connected/reconnecting/offline state during long operations.

**Fix shape:** Add a `ConnectionStatusBar` or equivalent status surface.

### G4. Several major pages lack skeleton/loading structure - HIGH

Overview, Publisher, and Component Review have less polished loading structure than Billing.

**Fix shape:** Add page-appropriate skeletons and stale-refetch indicators.

### G5. Indexing action errors are terse - MEDIUM

Indexing errors can be too compact to guide recovery.

**Fix shape:** Route action failures through the global error UX with clearer messages.

### G6. Retry/backoff UX is not explicit - MEDIUM

Users cannot tell when retries are happening or exhausted.

**Fix shape:** Add query retry/backoff defaults and visible retry state for important workflows.

### G7. Stale-refetch indication is inconsistent - LOW

Billing has better stale/refetch styling than many other screens.

**Fix shape:** Reuse the pattern on high-traffic pages.

### G8. Empty-state copy is inconsistent - LOW

Empty states vary across screens.

**Fix shape:** Standardize a small `EmptyState` primitive/copy contract.

### G9. Error boundary does not catch async failures - LOW

Async query/mutation errors need explicit UI handling.

**Fix shape:** Cover via global query/mutation error UX.

### G10. Global Suspense fallback is undifferentiated - LOW

The fallback does not communicate which area is loading.

**Fix shape:** Defer until route-level skeletons are in place.

## Recommended Fix Order

1. **G1** - Global error toast/notification path.
2. **G3** - Visible WS connection status.
3. **G4** - Skeletons for major pages.
4. **G2/G5** - Mutation and Indexing failure messages.
5. **G6** - Retry/backoff UX.
6. **G7/G8/G9/G10** - Polish.

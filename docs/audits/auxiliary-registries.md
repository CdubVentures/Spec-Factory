# Auxiliary Registries Propagation Audit

Date: 2026-04-28
Current severity: **MEDIUM**

## Scope

Brand registry propagation remains the main active gap. Color registry follows the shared data-change pattern; Unit registry is currently isolated enough to defer.

## Active Findings

### G1. BrandManager bypasses the shared data-change mutation pattern - MEDIUM
**File:** `tools/gui-react/src/features/studio/components/BrandManager.tsx`

Backend brand routes emit data-change events, but BrandManager uses raw React Query mutations and manual invalidations. This leaves registry propagation dependent on one-off local knowledge instead of the central event contract.

**Fix shape:** Convert BrandManager mutations to `useDataChangeMutation` with existing brand events and remove custom invalidation where redundant.

### G2. Unit registry has no cross-feature event contract - LOW
**File:** `tools/gui-react/src/pages/unit-registry/unitRegistryQueries.ts`

Unit mutations manually invalidate the unit page only. This is acceptable while units are isolated, but would become a propagation gap if units appear in Review, Studio, or component dropdowns.

**Fix shape:** Add unit events only when a second consumer exists.

## Recommended Fix Order

1. **G1** - Migrate BrandManager to `useDataChangeMutation`.
2. **G2** - Defer until units leave their isolated surface.

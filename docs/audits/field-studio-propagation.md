# Field Rules Studio Consumer Propagation Audit

Date: 2026-04-28
Current severity: **MEDIUM**

## Scope

Field Studio writes are SQL-first with durable JSON mirrors. Active propagation gaps are non-key finder prompt previews and the product decision around manual enum/list compile timing.

## Active Findings

### G1. Prompt-preview invalidation only covers Key Finder - MEDIUM
**File:** `src/core/events/eventRegistry.js`

`review-layout` invalidation covers key-finder prompt previews, but SKU/RDF/CEF/PIF prompt previews also read Field Studio hints/rules. Those previews rely on close/reopen freshness rather than live invalidation.

**Fix shape:** Extend the review-layout prompt-preview invalidation template to every finder that reads field rules.

### G2. Manual enum/list edit model needs a product decision - MEDIUM
**Files:** `src/features/studio/api/studioRoutes.js`, Studio mapping UI

Manual enum/list edits are not clearly defined as either draft-until-compile or auto-compiled. Without that decision, fixes can either surprise users with immediate generated changes or leave stale previews without visible warning.

**Fix shape:** Choose one model: auto-compile known values on save, or show a clear "compile needed" state.

### G3. Studio persistence only patches `studio-config` immediately - LOW
**File:** `tools/gui-react/src/features/studio/state/studioPersistenceAuthority.ts`

The save path patches `studio-config` and relies on server events for broader Studio payload refresh.

**Fix shape:** Add direct `['studio', category]` invalidation only if stale Studio-page payloads are reproduced.

### G4. StudioPage still has manual/broad invalidation paths - MEDIUM
**File:** `tools/gui-react/src/features/studio/components/StudioPage.tsx`

Some Studio flows still use direct or broad query invalidation instead of relying on a precise backend data-change contract. Some paths may need backend events before the frontend can become precise.

**Fix shape:** Inventory each manual invalidation, keep the ones that are strictly local UI refreshes, and move cross-screen effects behind typed data-change events.

## Recommended Fix Order

1. **G1** - Add non-key finder prompt-preview invalidation.
2. **G2** - Decide manual enum/list compile behavior.
3. **G4** - Inventory StudioPage manual invalidations and add missing backend events where needed.
4. **G3** - Defer until a stale Studio payload repro exists.

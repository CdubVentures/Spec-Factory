# IndexLab / Storage / Runtime Ops / Overview Sync Audit

Date: 2026-04-28
Current severity: **MEDIUM**

## Scope

Storage deletion and Runtime Ops reconnect invalidation are fixed. Remaining issues are active-run freshness, selection pruning, and auditability of generated invalidation mappings.

## Active Findings

### G1. Storage detail page lacks active-run refresh - MEDIUM
**File:** `tools/gui-react/src/features/storage-manager/state/useRunDetail.ts`

Run detail uses a long stale window and does not subscribe to active `indexlab-event` pulses for the visible run id. Artifact sizes and source state can lag during an active run.

**Fix shape:** Subscribe the detail view to active-run events and invalidate `['storage','run',runId]` or `['indexlab','run',runId]` on pulses.

### G2. Run-finalize catalog coverage needs per-run-type audit - MEDIUM

Generic IndexLab completion does not itself emit a Catalog data-change. Finder-specific completion paths may cover the visible Catalog fields, but coverage should be verified per run type before adding any generic event.

**Fix shape:** Build a matrix of run types, emitted data-change events, affected product ids, and Catalog fields. Add a generic finalize event only for uncovered fields.

### G3. Command Console selection can persist after row deletion - LOW
**File:** `tools/gui-react/src/pages/overview/CommandConsole.tsx`

If selected rows are deleted by another flow, the selection store can keep ids that are no longer visible.

**Fix shape:** Clear or prune selected ids when product/run deletion events remove rows from the current category.

### G4. Data-change domain mapping is not easy to audit from source - LOW

Generated resolver artifacts are correct, but humans still need to inspect generated output to understand the mapping.

**Fix shape:** Keep source registries and generated resolver docs close enough that reviewers can inspect the contract without reverse-engineering generated files.

### G5. CommandConsole still has manual/broad invalidation leftovers - MEDIUM
**File:** `tools/gui-react/src/pages/overview/CommandConsole.tsx`

Some Command Console flows still patch or invalidate broad query scopes manually. Some may need backend data-change events before they can move to precise invalidation.

**Fix shape:** Inventory each manual invalidation, split local optimistic UI updates from cross-screen propagation, and move cross-screen effects to typed backend data-change events.

## Recommended Fix Order

1. **G1** - Active-run refresh for Storage detail.
2. **G2** - Per-run-type finalize coverage audit.
3. **G5** - Replace manual/broad Command Console invalidation where data-change events can express the scope.
4. **G3** - Prune Command Console selection on deletes.
5. **G4** - Improve mapping auditability during the next resolver/codegen cleanup.

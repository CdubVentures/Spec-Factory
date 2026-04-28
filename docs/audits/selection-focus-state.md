# Selection / Focus State Audit

Date: 2026-04-28
Current severity: **HIGH**

## Scope

Selection and drawer stores keep entity ids in memory. They need a consistent pruning contract when products, runs, fields, variants, or component rows disappear.

## Active Findings

### G1. Review drawer can keep stale `activeCell` after deletion - HIGH

If the targeted product or field is deleted elsewhere, Review can keep a drawer focused on an entity that no longer exists.

**Fix shape:** Subscribe Review focus state to deletion events and close the drawer with a visible notice when the active entity disappears.

### G2. Overview selection can survive bulk delete - MEDIUM

The selection store can retain ids after selected rows are deleted.

**Fix shape:** Prune selected ids after product/run deletion and after bulk command completion where rows disappear.

### G3. IndexLab picker can hold deleted product/run ids - MEDIUM

Picker state is persisted and can point at removed entities.

**Fix shape:** Clear picker product/run ids when deletion events include the active targets.

### G4. Discovery history drawer can target a deleted product - MEDIUM

The drawer target can become invalid after product deletion.

**Fix shape:** Validate target existence and close with a notice if missing.

### G5. Component Review flagged items are row-index based - LOW-MEDIUM

Sort/filter changes can move rows while flagged state still refers to row indexes.

**Fix shape:** Store stable entity ids instead of row indexes.

### G6. Future multi-category selection mismatch - LOW

Selection behavior can become confusing if multi-category workflows are added.

**Fix shape:** Keep selection category-scoped.

### G7. PIF variant ring click does not sync Review filter - LOW

This is an optional navigation enhancement, not a correctness issue.

**Fix shape:** Defer unless users expect ring-to-review drilldown.

### G8. Component-review batch paths have manual/broad invalidation leftovers - MEDIUM
**Files:** component-review batch mutation paths

Some component-review batch flows still rely on manual or broad invalidation. They need a precise event/query-key contract before they can be safely narrowed.

**Fix shape:** Inventory batch paths, add backend data-change events where missing, then narrow frontend invalidation to affected component/entity scopes.

## Recommended Fix Order

1. **G1** - Close Review drawer when active entity vanishes.
2. **G2/G3** - Prune Overview selection and IndexLab picker after deletes.
3. **G4** - Validate Discovery History target.
4. **G8** - Tighten component-review batch invalidation after backend event coverage is confirmed.
5. **G5** - Move flagged items to identity-based state.
6. **G6/G7** - Defer.

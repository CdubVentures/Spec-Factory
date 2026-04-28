# Data Authority Snapshot Query Audit

Date: 2026-04-28
Current severity: **LOW**

## Scope

The `['data-authority','snapshot',category]` query has broad invalidation but limited consumer surface.

## Active Findings

### G1. Broad invalidation intent is undocumented - LOW

The broad data-authority snapshot invalidation is hard to reason about without local comments.

**Fix shape:** Add a WHY comment near the event/domain mapping.

### G2. Observability payload is not clearly consumed - LOW-MEDIUM

The snapshot carries observability-style data, but consumer ownership is unclear.

**Fix shape:** Either document the payload as reserved or split it into a separate endpoint when a second consumer appears.

### G3. Polling plus invalidation is redundant - LOW

Polling remains even though event invalidation exists.

**Fix shape:** Raise stale time or remove polling once invalidation confidence is high.

### G4. No regression test for cascade scope - LOW

The broad template could expand accidentally.

**Fix shape:** Add a small invariant test if this query becomes performance-sensitive.

## Recommended Fix Order

1. **G1** - Document broad invalidation.
2. **G2** - Decide payload ownership.
3. **G3/G4** - Defer.

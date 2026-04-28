# Evidence Pipeline Audit

Date: 2026-04-28
Current severity: **LOW**

## Scope

Evidence capture and gating are generally healthy. Active issues are UI surfacing and small maintainability guards.

## Active Findings

### G1. 404 or rejected evidence is not visually surfaced in Review - LOW

Evidence acceptance status exists, but users do not get a clear visual cue when evidence URLs are invalid or rejected.

**Fix shape:** Add a small indicator for rejected evidence in the Review evidence drawer.

### G2. No cross-system enum-sync test - LOW

Evidence-kind values cross SQL, backend logic, and UI display.

**Fix shape:** Add a small enum parity test if evidence kinds change again.

### G3. One hardcoded evidence-kind literal needs context - INFO

The hardcoded `identity_only` exclusion is defensible but should carry a WHY comment.

**Fix shape:** Add a short comment when touching that query.

## Recommended Fix Order

1. **G1** - Visual rejected-evidence indicator.
2. **G3** - Comment hardcoded literal when nearby.
3. **G2** - Defer until evidence kinds change.

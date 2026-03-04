# Review Curation Theme Contract Runbook

Generated: 2026-03-03  
Track: `implementation/ui-styling-system-standardization`

## Purpose

This document is the formal style contract for Review Grid + Review Components curation surfaces.  
Use it to keep button/state semantics stable while continuing drift reduction work.

## Scope

- `tools/gui-react/src/pages/review/*`
- `tools/gui-react/src/pages/component-review/*`
- shared review primitives in `tools/gui-react/src/theme.css`
- guardrails in `test/reviewButtonThemeDriftGuard.test.js` and `test/componentReviewThemeDriftGuard.test.js`

## Lane Contract (Do Not Drift)

| Lane | Primitive | Token Source | Color Contract |
| --- | --- | --- | --- |
| Run AI (all surfaces) | `sf-run-ai-button` | `--sf-state-run-ai-fg` | Purple `#9333EA` |
| Item Accept | `sf-item-accept-button` | `--sf-state-item-accept-fg` | Blue `#3B82F6` |
| Shared Accept | `sf-shared-accept-button` | `--sf-state-shared-accept-fg` | Blue `#3B82F6` |
| Confirm (item) | `sf-confirm-button-solid` | `--sf-state-confirm-fg` | Orange `#EA580C` |
| Confirm (shared) | `sf-shared-confirm-button` | `--sf-state-shared-confirm-fg` | Orange `#EA580C` |
| Accepted state | `sf-success-button-solid`, `sf-chip-success` | `--sf-state-success-*` | Green accepted state only |

## State Labels and Behavior

- Accepted buttons must render label `Accepted` and be non-clickable in accepted lock states.
- Pending AI badge/banner copy is unified to `AI Pending`.
- Pending AI lane tint is light purple (not orange).
- Review top drawer uses two controls only:
  - `Approve` (blue; switches to disabled `Approved` green when all greens are accepted)
  - `Finalize` (orange)

## New Primitive Hooks Added In This Pass

### Review Brand Filter

- `.sf-review-brand-filter-bar`
- `.sf-review-brand-filter-toggle`
- `.sf-review-brand-filter-toggle-active`
- `.sf-review-brand-filter-toggle-inactive`
- `.sf-review-brand-filter-brand`
- `.sf-review-brand-filter-brand-active`
- `.sf-review-brand-filter-brand-inactive`
- `.sf-review-brand-filter-separator`

### Cell Tooltip

- `.sf-cell-tooltip-content`
- `.sf-cell-tooltip-tier-badge`
- `.sf-cell-tooltip-tier-1`
- `.sf-cell-tooltip-tier-2`
- `.sf-cell-tooltip-tier-3`
- `.sf-cell-tooltip-tier-fallback`
- `.sf-cell-tooltip-overridden-badge`
- `.sf-cell-tooltip-review-badge`
- `.sf-cell-tooltip-link`
- `.sf-cell-tooltip-reason-chip`
- `.sf-cell-tooltip-arrow`

## Theme-Proof Rule

Never hardcode lane hex values in TSX component files.

- Allowed: semantic primitives + token indirection in `theme.css`.
- Allowed: changing token values by theme profile.
- Not allowed: direct `bg-*`, `text-*`, `border-*` color utility bundles in migrated review/component surfaces.

## Required Drift Workflow

1. Add/extend guardrail tests first (RED).
2. Apply minimal semantic class refactor (GREEN).
3. Re-run targeted suites.
4. Recompute matrix artifacts.
5. Update handoff and ledger docs in the same pass.

## Command Contract

```bash
node --test test/reviewButtonThemeDriftGuard.test.js
node --test test/componentReviewThemeDriftGuard.test.js
node --test test/*ThemeDriftGuard.test.js
node scripts/generatePanelStyleDriftMatrix.js --write
node scripts/generatePanelStyleRemediationQueue.js --write
python scripts/generate_review_button_color_matrix.py
```

## Current Baseline After This Pass

- Drift matrix summary (`tools/gui-react/src/pages`):
  - Total surfaces: `83`
  - Aligned: `83`
  - Non-aligned: `0` (`0` low, `0` moderate, `0` high)
- `review` and `component-review` sections remain fully aligned in the generated queue snapshot.

## Next Wave Priority

1. Keep lane-button/token contracts locked through existing Theme Drift Guards.
2. Require RED-first guard updates for any new panel before styling changes.
3. Re-run matrix + queue generation in every UI PR that touches `tools/gui-react/src/pages`.

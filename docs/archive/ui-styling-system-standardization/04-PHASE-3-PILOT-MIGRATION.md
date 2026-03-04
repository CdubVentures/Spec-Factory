# Phase 3 - Pilot Migration on Canonical Components

## Objective
Prove the token system works in real code by migrating the three canonical components while preserving behavior and visual identity.

## Pilot components
1. `tools/gui-react/src/components/layout/AppShell.tsx`
2. `tools/gui-react/src/components/common/DrawerShell.tsx`
3. `tools/gui-react/src/components/common/DataTable.tsx`

## How I will execute
1. Replace duplicated ad-hoc classes with semantic token-backed classes.
2. Keep interactions and logic unchanged.
3. Reduce local style drift and improve consistency.
4. Validate side-by-side behavior before broader rollout.

## Detailed steps
1. `AppShell` migration:
1. Normalize header controls and drawer styling into shared semantic classes.
2. Replace hardcoded border/background combinations with token-backed surfaces.
3. Keep shell animation/background identity exactly as designed.
2. `DrawerShell` migration:
1. Standardize panel surface, header, section labels, inputs, and action buttons.
2. Keep status/source badge behavior but map palettes to semantic status tokens where possible.
3. Remove repeated border/radius/value combinations in local class strings.
3. `DataTable` migration:
1. Move table shell, head cell typography, row hover, and empty state styling to shared tokens.
2. Retain table functionality (sorting/filtering/expansion/persist state).
3. Ensure compact density remains unchanged.
4. Write short migration notes for each component:
1. Before/after class strategy
2. Tokens/primitives adopted
3. Any temporary compatibility shortcuts

## Validation
1. Build and open target routes.
2. Verify:
1. Dark mode parity
2. Hover/focus/active interactions
3. No text clipping or spacing regressions
4. Confirm no logic regressions in interactive controls.

## Deliverables
1. Migrated canonical components
2. Pilot migration notes
3. Approval checkpoint before full rollout

## Exit criteria
1. Pilot components render correctly and consistently.
2. Tokenized classes reduce duplicate styling patterns.
3. No functional regressions in pilot scope.

## Risks and mitigation
1. Risk: visual mismatch from token remapping.
Mitigation: compare against Phase 0 baseline for each pilot surface.
2. Risk: style churn from mixed old/new classes.
Mitigation: centralize replacements through semantic primitives.


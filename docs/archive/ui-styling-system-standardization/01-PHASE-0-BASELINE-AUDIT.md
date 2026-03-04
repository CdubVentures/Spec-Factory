# Phase 0 - Baseline Audit and Drift Inventory

## Objective
Establish a measurable baseline of current styling usage before changing any UI code. This prevents accidental visual regressions and gives us a concrete drift map.

## How I will execute
1. Audit raw token usage from the codebase.
2. Build a ranked drift inventory for color, typography, spacing, and border radius.
3. Select canonical reference components that represent the intended style direction.
4. Freeze styling behavior for the migration window.

## Inputs
- `tools/gui-react/src/**/*.tsx`
- `tools/gui-react/src/index.css`
- `tools/gui-react/tailwind.config.ts`

## Detailed steps
1. Run frequency scans for classes and style literals.
```powershell
rg -o --no-filename "(?:bg|text|border|ring|divide)-[a-z]+(?:-[0-9]{2,3})?(?:/[0-9]+)?" src -g "*.tsx"
rg -o --no-filename "\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|gap|space-y|space-x)-(?:\d+(?:\.5)?|\[[^\]]+\])\b" src -g "*.tsx"
rg -o --no-filename "\brounded(?:-(?:none|sm|md|lg|full|t|b))?\b" src -g "*.tsx"
rg -n "#[0-9a-fA-F]{3,8}" src -g "*.{css,ts,tsx}"
rg -n "style=\{\{" src -g "*.tsx"
```
2. Export audit outputs into an internal report file in this folder.
3. Mark each finding as:
1. `compliant` (already aligned with intended system)
2. `near-duplicate` (can map directly to a token)
3. `drift` (should be replaced with a token or primitive)
4. Choose reference components:
1. `AppShell` for page shell and controls
2. `DrawerShell` for panel and form patterns
3. `DataTable` for dense tabular layout patterns
5. Create a temporary freeze rule:
1. No new raw hex values in TSX.
2. No new arbitrary `text-[Npx]` unless approved in this plan.
3. No new ad-hoc spacing/radius values outside current scale.

## Deliverables
1. `phase-0-audit-report.md` (summary and top drift offenders)
2. `phase-0-token-frequency.csv` (or equivalent table)
3. Approved list of canonical components

## Exit criteria
1. Drift categories are quantified.
2. Baseline is approved before migration starts.
3. Team has an explicit freeze policy for new styling drift.

## Risks and mitigation
1. Risk: hidden inline styles inside large pages.
Mitigation: scan for `style={{` and explicitly classify all color/spacing/radius values.
2. Risk: dark mode mismatch during migration.
Mitigation: tag every baseline entry with light/dark behavior.


# Phase 0 Audit Report - UI Styling System Standardization

Date: 2026-02-26  
Scope: `tools/gui-react/src/**/*.tsx`, `tools/gui-react/src/index.css`, `tools/gui-react/tailwind.config.ts`

## Baseline summary

| Domain | Total uses | Unique tokens | Compliant | Near-duplicate | Drift |
|---|---:|---:|---:|---:|---:|
| Color tokens | 9,690 | 446 | 138 | 6,290 | 3,262 |
| Typography tokens | 2,397 | 16 | 0 | 1,479 | 918 |
| Spacing tokens | 5,639 | 86 | 0 | 5,636 | 3 |
| Radius tokens | 1,307 | 8 | 1,285 | 21 | 1 |
| Raw hex literals | 38 | 37 | 16 | 3 | 19 |
| Inline style occurrences | 197 | 45 files | 6 (semantic var) | 190 (layout/runtime) | 1 |

Classification model used in this phase:
- `compliant`: already aligned to semantic token direction (`accent`, `surface/panel` usage, `:root` + `html.dark` CSS vars, common radius primitives).
- `near-duplicate`: currently valid but should collapse to semantic tokens/primitives in later phases.
- `drift`: arbitrary or hard-coded styling likely to regress consistency without tokenization.

## Ranked drift inventory

### Color drift
Top drift families by weighted usage:
1. `red` (670)
2. `blue` (566)
3. `amber` (454)
4. `green` (331)
5. `emerald` (305)
6. `purple` (273)

Top drift tokens:
- `text-red-600` (78)
- `text-red-400` (67)
- `text-red-300` (63)
- `text-blue-700` (63)
- `text-red-700` (62)
- `text-amber-300` (61)

Light/dark behavior tags:
- `light+dark`: most class-based drift tokens are paired with `dark:` variants.
- `light-only`: chart fills/strokes and inline badge palettes in [BillingPage.tsx](/C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/pages/billing/BillingPage.tsx), [OverviewTab.tsx](/C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/pages/runtime-ops/panels/OverviewTab.tsx), [SystemBadges.tsx](/C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/pages/studio/workbench/SystemBadges.tsx).

### Typography drift
Arbitrary text sizes are the dominant typography drift:
- `text-[10px]` (588)
- `text-[11px]` (229)
- `text-[9px]` (84)
- `text-[8px]` (14)
- `text-[12px]` (3)

Top files by arbitrary pixel text usage:
1. `src/pages/studio/StudioPage.tsx` (110)
2. `src/pages/indexing/panels/RuntimePanel.tsx` (68)
3. `src/pages/indexing/panels/SearchProfilePanel.tsx` (45)
4. `src/pages/llm-settings/LlmSettingsPage.tsx` (40)
5. `src/pages/runtime-ops/panels/PrefetchUrlPredictorPanel.tsx` (38)

Light/dark behavior tag: `mode-agnostic` (typography sizing does not branch by theme).

### Spacing drift
Spacing scale is mostly stable. Drift entries found:
- `space-y-3.5` (1)
- `pr-7` (1)
- `p-3.5` (1)

Light/dark behavior tag: `mode-agnostic`.

### Radius drift
Radius usage is heavily normalized (`rounded`, `rounded-full`, `rounded-lg`). Single drift entry:
- `rounded-none` (1)

Light/dark behavior tag: `mode-agnostic`.

### Raw hex + inline style drift
Raw hex file hotspots:
1. `src/index.css` (19, mostly theme-variable seed values)
2. `src/pages/studio/workbench/SystemBadges.tsx` (12)
3. `src/pages/runtime-ops/panels/OverviewTab.tsx` (4)
4. `src/pages/billing/BillingPage.tsx` (2)
5. `src/pages/studio/workbench/WorkbenchTable.tsx` (1)

Inline style hotspots:
1. `src/pages/studio/StudioPage.tsx` (87)
2. `src/pages/studio/workbench/WorkbenchDrawer.tsx` (41)
3. `src/pages/review/ReviewMatrix.tsx` (11)
4. `src/pages/pipeline-settings/PipelineSettingsPage.tsx` (6)

Inline style classification breakdown:
- `style:layout-runtime` = 190
- `style:semantic-var` = 6
- `style:visual-drift` = 1 (`fontSize/lineHeight/padding/borderRadius` inline in `StudioPage.tsx`)

## Canonical reference components (approved for Phase 0)

| Component | Baseline snapshot | Drift flags |
|---|---|---|
| [AppShell.tsx](/C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/components/layout/AppShell.tsx) | 34 color tokens, 4 typography, 12 spacing, 3 radius, 0 inline styles | Uses semantic shell classes (`sf-*`) plus some status/CTA color utilities (`sky/amber/indigo`) |
| [DrawerShell.tsx](/C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/components/common/DrawerShell.tsx) | 27 color tokens, 13 typography, 29 spacing, 8 radius, 0 inline styles | Includes arbitrary text sizes (`text-[10px]`, `text-[9px]`) and action color (`bg-orange-500`) |
| [DataTable.tsx](/C:/Users/Chris/Desktop/Spec%20Factory/tools/gui-react/src/components/common/DataTable.tsx) | 17 color tokens, 6 typography, 11 spacing, 2 radius, 1 inline style | Includes `text-[10px]` header size and inline `tableLayout: 'fixed'` |

These three components are confirmed as canonical migration anchors for Phase 3.

## Freeze policy (effective immediately for migration window)

1. No new raw hex literals in TS/TSX files.
2. No new arbitrary `text-[Npx]` classes unless explicitly approved in this plan.
3. No new spacing/radius tokens outside the current observed scale baseline.
4. Any required inline style must be either:
- runtime layout-only (`width/height/position/transform/order`), or
- semantic CSS-variable based (`var(--sf-...)`).

## Deliverables produced

1. `implementation/ui-styling-system-standardization/phase-0-audit-report.md`
2. `implementation/ui-styling-system-standardization/phase-0-token-frequency.csv`
3. Canonical component list: `AppShell`, `DrawerShell`, `DataTable`

## Exit criteria status

- Drift categories quantified: COMPLETE.
- Baseline artifacts generated: COMPLETE.
- Freeze policy documented: COMPLETE.
- Baseline approval before migration: PENDING TEAM APPROVAL.

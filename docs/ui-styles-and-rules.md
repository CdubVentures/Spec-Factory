# UI Styles and Rules

Last Updated: 2026-03-03
Scope: `tools/gui-react/src/**/*.{ts,tsx,css}`
Purpose: Canonical UI build contract for zero drift, strict theming, and future multi-theme expansion.

## Source Consolidation
This document condenses the UI styling track documentation under `implementation/ui-styling-system-standardization/`, especially:
- `token-contract.md`
- `token-rules.md`
- `phase-4-primitive-layer-guide.md`
- `10-TYPOGRAPHY-RULES-2026-02-26.md`
- `11-DEVELOPER-STYLES-AND-OWNER-PREFERENCES-2026-02-26.md`
- drift artifacts (`panel-style-drift-matrix.*`, `panel-style-remediation-queue.md`)

## Non-Negotiable Outcomes
1. New UI work must introduce zero style drift.
2. Component styling must be theme-safe by design (token-driven, no hardcoded visual values).
3. Feature changes must preserve behavior and selected-state UX contracts.
4. All panel-level additions must pass drift guard tests before merge.

## Component Architecture

### 1) Feature-Sliced ownership boundaries
Use this ownership model:
- `src/shared/` (or equivalent shared layer): pure visual primitives only.
- `src/features/<feature>/`: domain logic + feature containers.
- `src/pages/`: composition/orchestration of feature modules.

### 2) Shared visual components (dumb/presentational)
Examples: buttons, tooltips, chips, form controls, table shells, card/surface primitives.
Rules:
- No domain business logic.
- No API calls.
- No store ownership beyond strictly local UI state.
- Style only through semantic tokens/primitives.

### 3) Feature/domain components
Examples: peripheral comparison tables, brand showcases, game requirement lists, review lanes.
Rules:
- Contain domain behavior and data mapping.
- Compose shared primitives; never re-implement primitive styles.
- Must not bypass primitive layer with ad-hoc utility bundles.

### 4) Allowed import direction
- Features may import shared primitives.
- Shared primitives must not import features.
- Cross-feature usage must go through explicit public feature APIs.

## Styling Strictness

### 1) Token model
- Scale tokens: `scale.<domain>.<name>`.
- Semantic tokens: `semantic.<domain>.<intent>`.
- Components consume semantic tokens/classes first.

### 2) Hard bans
- Inline visual styling for skin values is banned.
  - Banned literals: `fontSize`, `lineHeight`, `padding`, `borderRadius`, `color`, `background`, `borderColor`.
- Hardcoded hex in TS/TSX is banned.
- Arbitrary pixel text utilities (for example `text-[10px]`) are banned for new work.
- New raw color utility bundles (`text-gray-*`, `bg-blue-*`, etc.) are banned.

### 3) Allowed exceptions
Inline styles are only allowed for runtime geometry/layout:
- `width`, `height`, `left`, `top`, `right`, `bottom`, `transform`, `order`, virtualization geometry.
If a style must be dynamic, it must reference semantic CSS variables, not raw literals.

### 4) Token scales to use
- Typography: `micro`, `nano`, `caption`, `label`, `body-xs`, `body-sm`, `body`, `title-sm`, `title`, `title-lg`, `display-sm`, `display`.
- Spacing: `0`, `0-5`, `1`, `1-5`, `2`, `2-5`, `3`, `4`, `6`, `8`, `12`.
- Radius: `none`, `sm`, `md`, `lg`, `pill`.

### 5) Owner interaction preferences (must preserve)
- Active state must win over hover.
- Selected rows/buttons must keep selected visuals while hovered.
- Effort color contract:
  - `1-3` -> success
  - `4-6` -> info
  - `7-8` -> warning
  - `9-10` -> danger

## Asset Integration in the UI

### 1) Single source of truth
All media rendering must go through a centralized resolver/service (single API). UI components must not hardcode image/asset paths.

Required pattern:
- Feature/page provides a typed asset descriptor (`category`, `brand`, `model`, `variant`, `assetKind`, `assetId`).
- Resolver returns canonical URL + fallback + metadata.
- Presentation component renders resolver output only.

### 2) Prohibited pattern
- Directly constructing image URLs inside UI components.
- Hardcoding endpoint strings or storage paths in JSX.

### 3) Hierarchy resilience contract
Layouts must adapt to `Category -> Brand -> Model+Variant` hierarchy dynamically:
- Use stable identifiers for keys (never raw display names).
- Do not encode brand/model names into layout assumptions.
- Renames/acquisitions must not break cards, rows, tabs, or navigation.
- Title/copy may change; structure and bindings must remain stable.

## Responsive and Accessibility Rules

### 1) Responsive baseline (mobile-first)
Breakpoints:
- Base: mobile (default)
- `sm`: >= 640px
- `md`: >= 768px
- `lg`: >= 1024px
- `xl`: >= 1280px

Rules:
- Build mobile layout first, then enhance upward.
- No horizontal overflow at mobile widths.
- Dense grids (for example hardware/spec matrices) must collapse to stacked cards/rows on mobile.
- Tables must provide a mobile fallback pattern (stacked key-value rows, drawer, or virtualized list).

### 2) Accessibility (WCAG)
- Meet WCAG 2.1 AA color contrast for text.
- Every interactive element must be keyboard reachable and visibly focusable.
- Use `:focus-visible` tokenized focus styles (no browser-default-only reliance).
- Provide ARIA labels/names for icon-only controls and ambiguous actions.
- Preserve logical tab order.
- Tooltips and dialogs must support keyboard navigation and escape behavior.

## TDD for UI

### 1) Visual primitives
Test goals:
- Primitive class wiring exists.
- No banned raw style patterns.
- Semantic token hooks remain present.

Typical tests:
- Theme drift guards for primitive usage.
- Contract tests for token class presence.

### 2) Interactive feature components
Test goals:
- Behavioral state transitions.
- Domain logic + UI state coupling.
- Selected/hover/disabled invariants.

Typical tests:
- User interaction tests (keyboard + pointer).
- Feature wiring tests for store/API integration boundaries.
- Regression tests for owner-specific contracts (active-vs-hover stability, effort-tier mapping).

### 3) Red-Green enforcement
For UI changes:
1. Add/extend failing drift/behavior test first.
2. Implement minimal change.
3. Re-run focused suites + theme drift guard suites.
4. Regenerate drift artifacts when panel/page styling changes.

## Zero-Drift Delivery Checklist (Required for every new panel)
1. Compose with shared `sf-*` primitives first.
2. Use semantic token roles only; no raw family color classes.
3. Avoid inline skin styles and raw literals.
4. Validate mobile collapse behavior.
5. Validate keyboard navigation and focus visibility.
6. Add/extend panel-specific drift guard tests.
7. Run `node --test test/*ThemeDriftGuard.test.js`.
8. Regenerate drift artifacts:
   - `node scripts/generatePanelStyleDriftMatrix.js --write`
   - `node scripts/generatePanelStyleRemediationQueue.js --write`
9. Confirm summaries remain aligned with zero new drift.

## Multi-Theme Readiness Rules
1. Components map to semantic intent, never concrete color values.
2. Theme variants only change token values in `theme.css` / profile layer.
3. Adding a new visual role requires:
- token contract update,
- primitive update,
- drift/test coverage update,
- migration mapping entry.
4. Do not ship feature-specific one-off theme logic.

## Enforcement Commands
- `node --test test/*ThemeDriftGuard.test.js`
- `node scripts/generatePanelStyleDriftMatrix.js --write`
- `node scripts/generatePanelStyleRemediationQueue.js --write`

## Definition of Done for UI Styling
A change is complete only when:
1. It follows this contract with no banned patterns.
2. Drift guards pass.
3. Artifacts are regenerated and internally consistent.
4. Mobile/accessibility criteria are met.
5. No new exceptions were introduced.

## Critical Owner Contracts (Must Preserve)

### 1) Review curation lane contract
- Run AI lane must remain purple and use `sf-run-ai-button`.
- Item Accept and Shared Accept lanes must remain blue and use lane primitives.
- Confirm actions must remain orange and use confirm primitives.
- Accepted state must be green and non-clickable with label `Accepted` in lock states.
- Pending AI copy must be exactly `AI Pending`.
- Pending AI lane tint must stay light purple (not orange).
- Review top drawer must remain a 2-control contract:
  - `Approve` (blue; becomes disabled green `Approved` when all greens accepted)
  - `Finalize` (orange)

### 2) Sidebar/nav typography and behavior contract
- Primary and sub-sidebar nav buttons must maintain uniform minimum height.
- Do not place dynamic count copy (for example `N knobs`) inside sidebar nav buttons.
- If counts are needed, render them in detail/header surfaces, not nav rails.

### 3) Selected-vs-hover stability contract
- Active/selected visuals must not be lost on hover.
- If base primitive hover styles conflict, pin selected state with stronger semantic selectors.

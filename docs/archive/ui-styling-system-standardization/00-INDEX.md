# UI Styling System Standardization Plan

## Goal
Create a universal styling system for the React frontend so new features remain visually consistent across color, typography, spacing, and border radius.

## Scope
- Frontend workspace: `tools/gui-react`
- First migration anchors:
1. `src/components/layout/AppShell.tsx`
2. `src/components/common/DrawerShell.tsx`
3. `src/components/common/DataTable.tsx`
- Global styling inputs:
1. `src/index.css`
2. `tailwind.config.ts`
3. Existing helper maps in `src/utils/colors.ts`

## Phase Sequence
1. [Phase 0 - Baseline Audit and Drift Inventory](./01-PHASE-0-BASELINE-AUDIT.md)
2. [Phase 1 - Token Contract and Naming Rules](./02-PHASE-1-TOKEN-CONTRACT.md)
3. [Phase 2 - Theme Infrastructure Implementation](./03-PHASE-2-THEME-INFRASTRUCTURE.md)
4. [Phase 3 - Pilot Migration on Canonical Components](./04-PHASE-3-PILOT-MIGRATION.md)
5. [Phase 4 - Shared Primitive Layer](./05-PHASE-4-PRIMITIVE-LAYER.md)
6. [Phase 5 - Rollout by Surface](./06-PHASE-5-ROLLOUT.md)
7. [Phase 6 - Enforcement and CI Guardrails](./07-PHASE-6-ENFORCEMENT.md)
8. [Phase 7 - Governance, Expansion, and Signoff](./08-PHASE-7-GOVERNANCE-SIGNOFF.md)

## Definition of Done
1. All new UI changes use tokenized styles only.
2. Core pages are migrated to semantic tokens/primitives.
3. CI rejects non-compliant styling patterns.
4. Expansion rules exist for adding new tokens without reintroducing drift.

## Current Audit Artifacts
1. [Rollout Tracker](./rollout-tracker.md)
2. [Panel Style Drift Matrix](./panel-style-drift-matrix.md)
3. [Panel Style Remediation Queue](./panel-style-remediation-queue.md)
4. [Drift Findings Priority (2026-02-26)](./09-DRIFT-FINDINGS-PRIORITY-2026-02-26.md)
5. [Typography Rules (2026-02-26)](./10-TYPOGRAPHY-RULES-2026-02-26.md)
6. [Developer Styles and Owner Preferences (2026-02-26)](./11-DEVELOPER-STYLES-AND-OWNER-PREFERENCES-2026-02-26.md)
7. [Multi-Theme Handoff (2026-03-02)](./14-MULTI-THEME-HANDOFF-2026-03-02-0955.md)
8. [Review/Button Color Matrix Workbook](./review-button-color-matrix.xlsx)
9. [Review Curation Theme Contract Runbook (2026-03-03)](./15-REVIEW-CURATION-THEME-CONTRACT-RUNBOOK-2026-03-03.md)

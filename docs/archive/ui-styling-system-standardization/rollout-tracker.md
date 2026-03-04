# Phase 5 Rollout Tracker

## Batch 01 - Indexing Panels Shell Standardization (2026-02-26)

### Drift metrics (indexing panels)
- Legacy outer shell bundle: `21 -> 0`
- Legacy inner section bundle: `203 -> 0`
- Legacy button border bundle: `24 -> 0`
- Radius utility palette: constrained to `3` utilities (`rounded`, `rounded-lg`, `rounded-full`)
- Micro text utility drift (`text-[9|10|11px]`): `168` remaining (next batch)

### File tracker

| File path | Current drift severity | Target primitive/token mapping | Status |
| --- | --- | --- | --- |
| `tools/gui-react/src/pages/indexing/panels/BatchPanel.tsx` | medium | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/EventStreamPanel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/LearningPanel.tsx` | low | outer shell -> `sf-surface-panel` | done |
| `tools/gui-react/src/pages/indexing/panels/LlmMetricsPanel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/LlmOutputPanel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/NeedSetPanel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/OverviewPanel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/PanelControlsPanel.tsx` | medium | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/Phase05Panel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/Phase06Panel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/Phase06bPanel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/Phase07Panel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/Phase08Panel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/Phase09Panel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/PickerPanel.tsx` | medium | nested shell -> `sf-surface-elevated` (featured panel shell preserved) | done |
| `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx` | medium | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/SearchProfilePanel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/SerpExplorerPanel.tsx` | medium | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/SessionDataPanel.tsx` | medium | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/UrlHealthPanel.tsx` | high | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/indexing/panels/WorkerPanel.tsx` | medium | outer shell -> `sf-surface-panel`; nested shell -> `sf-surface-elevated` | done |

### Exception log (active)
- `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx`: heavy use of `text-[9|10|11px]` remains for dense telemetry layout; move to shared micro typography primitives in next batch.
- `tools/gui-react/src/pages/indexing/panels/SearchProfilePanel.tsx`: large volume of micro labels/badges remains; batch with runtime panel typography pass.

## Batch 02 - Runtime Ops Panel Section Standardization (2026-02-26)

### Drift metrics (runtime-ops panels)
- Legacy outer shell bundle: `0 -> 0`
- Legacy inner section bundle: `6 -> 0`
- Legacy button border bundle: `0 -> 0`
- Radius utility palette: constrained to `6` utilities (`rounded`, `rounded-sm`, `rounded-lg`, `rounded-full`, `rounded-t`, `rounded-b`)
- Micro text utility drift (`text-[9|10|11px]`): `269` remaining (next batch)

### File tracker

| File path | Current drift severity | Target primitive/token mapping | Status |
| --- | --- | --- | --- |
| `tools/gui-react/src/pages/runtime-ops/panels/WorkerDataDrawer.tsx` | medium | nested shell -> `sf-surface-elevated` | done |
| `tools/gui-react/src/pages/runtime-ops/panels/ScreenshotPreview.tsx` | medium | nested shell -> `sf-surface-elevated` with existing hover accent retained | done |
| `tools/gui-react/src/pages/runtime-ops/panels/ExtractionTab.tsx` | low | nested shell -> `sf-surface-elevated` (candidate cards) | done |

### Exception log (active)
- `tools/gui-react/src/pages/runtime-ops/panels/PrefetchUrlPredictorPanel.tsx`: dense instrumentation layout still uses heavy `text-[9|10|11px]` micro typography.
- `tools/gui-react/src/pages/runtime-ops/panels/PrefetchSerpTriagePanel.tsx`: dense instrumentation layout still uses heavy `text-[9|10|11px]` micro typography.
- `tools/gui-react/src/pages/runtime-ops/panels/PrefetchDomainClassifierPanel.tsx`: dense instrumentation layout still uses heavy `text-[9|10|11px]` micro typography.

## Batch 03 - Indexing + Runtime Ops Typography Tokenization (2026-02-26)

### Drift metrics (indexing + runtime-ops panels)
- Indexing micro text utility drift (`text-[9|10|11px]`): `168 -> 0`
- Runtime-ops micro text utility drift (`text-[9|10|11px]`): `269 -> 0`
- Shared typography primitive coverage: added `sf-text-label` in theme primitives.

### Mapping applied
- `text-[9px]` -> `sf-text-nano`
- `text-[10px]` -> `sf-text-caption`
- `text-[11px]` -> `sf-text-label`

### Scope
- `tools/gui-react/src/pages/indexing/panels/*.tsx`
- `tools/gui-react/src/pages/runtime-ops/panels/*.tsx`

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js`: now fails on any `text-[9|10|11px]` usage in indexing panels.
- `test/runtimeOpsPanelThemeDriftGuard.test.js`: now fails on any `text-[9|10|11px]` usage in runtime-ops panels.

### Exception log (active)
- None for `text-[9|10|11px]` in indexing/runtime-ops panel surfaces.

## Batch 04 - Indexing + Runtime Ops Badge Color Standardization (2026-02-26)

### Drift metrics (indexing + runtime-ops panels)
- Legacy inline badge color bundles (success/warning/danger/info/neutral): `53 -> 0`
- Shared chip primitive usage now present across panel surfaces:
  - `sf-chip-success`: `18`
  - `sf-chip-warning`: `12`
  - `sf-chip-danger`: `4`
  - `sf-chip-info`: `5`
  - `sf-chip-neutral`: `14`

### Mapping applied
- `bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300` -> `sf-chip-success`
- `bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300` -> `sf-chip-warning`
- `bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300` -> `sf-chip-danger`
- `bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300` -> `sf-chip-info`
- `bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300` -> `sf-chip-neutral`
- `bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200` -> `sf-chip-neutral`

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js`: now blocks legacy inline badge color bundles in indexing panels.
- `test/runtimeOpsPanelThemeDriftGuard.test.js`: now blocks legacy inline badge color bundles in runtime-ops panels.

### Exception log (active)
- None for targeted legacy inline badge color bundles in indexing/runtime-ops panel surfaces.

## Batch 05 - Expanded Badge + Micro Text Guard Finalization (2026-02-26)

### Drift metrics (indexing + runtime-ops panels)
- Expanded micro text utility drift (`text-[8|9|10|11px]`): `3 -> 0`
- Expanded legacy inline badge bundle denylist: all guarded variants now `0` in panel surfaces.
- Final runtime-ops residual badge variants (`bg-red-100 text-red-800`, `bg-green-100 text-green-800`, border-state blue/gray pair): `6 -> 0`.
- Shared chip primitive usage across panel surfaces after codemod:
  - `sf-chip-success`: `48`
  - `sf-chip-warning`: `41`
  - `sf-chip-danger`: `30`
  - `sf-chip-info`: `27`
  - `sf-chip-neutral`: `50`
  - `sf-chip-accent`: `18`
- Shared `sf-text-micro` usage in panel surfaces: `3`.

### Mapping applied
- `text-[8px]` -> `sf-text-micro`
- Additional inline status/badge bundles -> shared chip primitives:
  - `bg-emerald|green-* ...` -> `sf-chip-success`
  - `bg-amber|yellow|orange-* ...` -> `sf-chip-warning`
  - `bg-red|rose-* ...` -> `sf-chip-danger`
  - `bg-blue|cyan|sky-* ...` -> `sf-chip-info`
  - `bg-gray|slate-* ...` -> `sf-chip-neutral`
  - `bg-indigo|purple|violet-* ...` -> `sf-chip-accent`
- Residual runtime-ops status toggles:
  - `bg-red-100 text-red-800` -> `sf-chip-danger`
  - `bg-green-100 text-green-800` -> `sf-chip-success`
  - `bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700` -> `sf-chip-info border-blue-300 dark:border-blue-700`
  - `bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600` -> `sf-chip-neutral border-gray-200 dark:border-gray-600`

### Enforcement
- `test/primitiveLayerWiring.test.js`: now asserts `sf-text-micro`.
- `test/indexingPanelThemeDriftGuard.test.js`: now blocks `text-[8|9|10|11px]` and expanded legacy badge bundle variants.
- `test/runtimeOpsPanelThemeDriftGuard.test.js`: now blocks `text-[8|9|10|11px]` and expanded legacy badge bundle variants, including residual runtime-ops toggle variants.

### Exception log (active)
- None for guarded badge/micro-text drift patterns in indexing/runtime-ops panel surfaces.

## Batch 06 - Callout + State Surface Standardization (2026-02-26)

### Drift metrics (indexing + runtime-ops panels)
- Legacy inline callout/state surface bundles (new denylist coverage): `0` remaining in panel surfaces.
- Legacy runtime-ops action-button bundle (`w-full text-xs ... border-blue-300 ...`): `3 -> 0`.
- Legacy rounded card surface bundle (`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg`): `8 -> 0`.
- Shared callout primitive usage across panel surfaces:
  - `sf-callout-success`: `7`
  - `sf-callout-warning`: `19`
  - `sf-callout-danger`: `9`
  - `sf-callout-info`: `4`
  - `sf-callout-accent`: `1`
- Shared card surface primitive usage across panel surfaces:
  - `sf-surface-card`: `11`

### Mapping applied
- Added shared callout primitives in `tools/gui-react/src/theme.css`:
  - `sf-callout`
  - `sf-callout-success`
  - `sf-callout-warning`
  - `sf-callout-danger`
  - `sf-callout-info`
  - `sf-callout-neutral`
  - `sf-callout-accent`
- Added shared action control primitive in `tools/gui-react/src/theme.css`:
  - `sf-action-button`
- Added shared card surface primitive in `tools/gui-react/src/theme.css`:
  - `sf-surface-card`
- Replaced legacy inline callout/state bundles across indexing + runtime-ops panels:
  - `bg-*-50 + border-*-200/300 + text-*` warning/info/danger/success/accent callouts -> `sf-callout` + `sf-callout-*`
  - stage pipeline cards with inline border/text/bg bundles -> `sf-callout-*`
  - planner lock chip in indexing runtime panel migrated to `sf-chip-danger`

### Enforcement
- `test/primitiveLayerWiring.test.js`: now asserts shared callout primitives.
- `test/primitiveLayerWiring.test.js`: now asserts `sf-action-button` and `sf-surface-card`.
- `test/indexingPanelThemeDriftGuard.test.js`: now blocks legacy callout bundles in indexing panels.
- `test/indexingPanelThemeDriftGuard.test.js`: now blocks legacy rounded card surface bundle in indexing panels.
- `test/runtimeOpsPanelThemeDriftGuard.test.js`: now blocks legacy callout bundles in runtime-ops panels.
- `test/runtimeOpsPanelThemeDriftGuard.test.js`: now blocks the legacy runtime-ops blue action-button bundle.
- `test/runtimeOpsPanelThemeDriftGuard.test.js`: now blocks legacy rounded card surface bundle in runtime-ops panels.

### Exception log (active)
- None for guarded callout/state-surface drift patterns in indexing/runtime-ops panel surfaces.

## Batch 07 - Pipeline Settings Panel Drift Normalization (2026-02-26)

### Drift metrics (pipeline settings surfaces)
- Legacy inline panel/icon/toggle/action bundles: `14 -> 0`.
- Pipeline micro text utility drift (`text-[10|11px]`): `3 -> 0`.
- Pipeline radius utility drift (`rounded-md`): `2 -> 0`.
- Pipeline settings local panel files now use shared primitives:
  - `PipelineSettingsPage.tsx`: `sf-*` references `95`, raw color utility count `0`.
  - `RuntimeSettingsFlowCard.tsx`: `sf-*` references `55`, raw color utility count `0`.

### Mapping applied
- Added shared primitives to `tools/gui-react/src/theme.css`:
  - `sf-primary-button`, `sf-danger-button`
  - `sf-nav-item`, `sf-nav-item-active`, `sf-nav-item-muted`
  - `sf-switch`, `sf-switch-on`, `sf-switch-off`, `sf-switch-track`, `sf-switch-track-on`, `sf-switch-thumb`
  - `sf-status-text-info`, `sf-status-text-warning`, `sf-status-text-danger`, `sf-status-text-muted`
- Migrated pipeline settings surfaces to shared primitive contracts:
  - `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx`
  - `tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx`

### Enforcement
- Added dedicated guard suite:
  - `test/pipelineSettingsThemeDriftGuard.test.js`
    - blocks legacy inline pipeline bundles
    - enforces constrained radius token palette (`rounded`, `rounded-lg`, `rounded-full`)
    - blocks arbitrary micro text utilities (`text-[10|11px]`)
- Expanded primitive layer wiring assertions:
  - `test/primitiveLayerWiring.test.js` now asserts new nav/switch/button/status-text primitives.

### Audit artifact
- Panel + nested component matrix captured:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`

### Exception log (active)
- `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`: high inline color utility density remains, pending next guard/migration batch.
- `tools/gui-react/src/pages/storage/StoragePage.tsx`: high inline color utility density remains, pending next guard/migration batch.

## Batch 08 - Pipeline Tactile Nav Tune + Full Cross-Panel Matrix (2026-02-26)

### Drift metrics (pipeline settings + full GUI matrix)
- Pipeline shell radius drift (oversized root): `rounded-lg -> rounded`.
- Pipeline nav/tab tactile affordance: restored stronger button states (visible border, hover lift, active press/inset, dark-mode parity).
- Full panel drift matrix scope expanded from scoped slices to full board inventory:
  - Surfaces analyzed: `83`.
  - Drift summary: `aligned=2`, `low=14`, `moderate=38`, `high=29`.
  - Pipeline settings surfaces now score `aligned` in the generated matrix.

### Mapping applied
- Tuned shared nav primitive in `tools/gui-react/src/theme.css`:
  - `sf-nav-item`: baseline border + gradient surface + tactile shadow.
  - `sf-nav-item:hover`: stronger border/background + raised shadow.
  - `sf-nav-item:active`: press-state transform + inset shadow.
  - `sf-nav-item-active`: stronger active border/fill + inset/outer shadow.
  - active hover stability: `.sf-nav-item.sf-nav-item-active:hover` and dark-mode equivalent keep selected tabs visually active while hovered.
  - `sf-nav-item-muted`: explicit muted border/background and dark-mode parity.
- Tightened pipeline shell radius in `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx`:
  - root container class `rounded-lg -> rounded`.
- Added matrix generator script:
  - `scripts/generatePanelStyleDriftMatrix.js`
  - writes:
    - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
    - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`

### Enforcement
- `test/pipelineSettingsThemeDriftGuard.test.js`:
  - radius palette tightened for pipeline files (`rounded`, `rounded-full`).
  - explicit guard added against legacy oversized root radius fragment (`rounded-lg` shell root).
- `test/primitiveLayerWiring.test.js`:
  - now asserts nav press-state primitive (`.sf-nav-item:active`).
  - now asserts tactile nav shadow styling is present in `.sf-nav-item`.
  - now asserts active nav hover-state selector is present (`.sf-nav-item.sf-nav-item-active:hover`).

### Audit artifact
- Full side-by-side panel drift matrix regenerated:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`

### Exception log (active)
- Cross-surface high-drift hotspots remain queued for migration waves:
  - `tools/gui-react/src/pages/studio/StudioPage.tsx`
  - `tools/gui-react/src/pages/catalog/ProductManager.tsx`
  - `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`
  - `tools/gui-react/src/pages/storage/StoragePage.tsx`

## Batch 09 - Settings-Adjacent Drift Closure (2026-02-26)

### Drift metrics (llm-settings + storage)
- `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`:
  - raw utility colors: `168 -> 0`
  - raw `text-xs` utilities: `16 -> 0`
  - primitive coverage: `sf-* 0 -> 130`
  - drift grade: `high -> aligned`
- `tools/gui-react/src/pages/storage/StoragePage.tsx`:
  - raw utility colors: `99 -> 0`
  - primitive coverage: `sf-* 0 -> 89`
  - drift grade: `high -> aligned`
- Full matrix summary after Wave 09:
  - surfaces analyzed: `83`
  - drift split: `aligned=4`, `low=14`, `moderate=38`, `high=27` (from `aligned=2`, `high=29`)

### Mapping applied
- Migrated settings-adjacent card/input/status/toggle/button bundles to shared primitives:
  - `sf-surface-elevated`, `sf-input`, `sf-icon-button`, `sf-action-button`, `sf-primary-button`
  - `sf-nav-item`, `sf-nav-item-active`, `sf-nav-item-muted`
  - `sf-tab-strip`, `sf-tab-item`, `sf-tab-item-active` (horizontal scope bars, distinct from sidebar tabs)
  - `sf-status-text-*`, `sf-chip-*`, `sf-callout-*`, `sf-text-label`, `sf-text-caption`
- Restored LLM selected-row scope tone contract (selected state only):
  - `field -> sf-callout-info`
  - `component -> sf-callout-warning`
  - `list/default -> sf-callout-accent`

### Enforcement
- Added/expanded `test/settingsAdjacentThemeDriftGuard.test.js`:
  - blocks legacy inline settings-adjacent bundles
  - blocks arbitrary micro text (`text-[10|11px]`)
  - blocks raw `text-xs` utilities
  - enforces constrained radius token palette (`rounded`, `rounded-full`)
  - enforces raw utility color density threshold
  - asserts selected LLM review rows remain scope-toned
  - asserts LLM horizontal scope bar uses dedicated tab-strip/tab-item primitives
- Expanded `test/primitiveLayerWiring.test.js`:
  - asserts `sf-tab-strip`, `sf-tab-item`, and active-hover stability selector for horizontal tabs
- Validation run:
  - `node --test test/settingsAdjacentThemeDriftGuard.test.js` (passing)
  - `node --test test/primitiveLayerWiring.test.js test/pipelineSettingsThemeDriftGuard.test.js test/settingsAdjacentThemeDriftGuard.test.js` (passing)

### Audit artifact
- Regenerated with write-through:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`

### Exception log (active)
- Remaining high-drift hotspots queued for next waves:
  - `tools/gui-react/src/pages/studio/StudioPage.tsx`
  - `tools/gui-react/src/pages/catalog/ProductManager.tsx`
  - `tools/gui-react/src/pages/studio/BrandManager.tsx`
  - `tools/gui-react/src/pages/test-mode/TestModePage.tsx`
  - `tools/gui-react/src/pages/studio/workbench/WorkbenchDrawer.tsx`

## Batch 10 - Typography Hierarchy Normalization Pass (2026-02-26)

### Typography metrics (standardized settings surfaces)
- Pipeline settings surfaces:
  - raw `text-xs` utilities: `28 -> 0`
    - `PipelineSettingsPage.tsx`: `15 -> 0`
    - `RuntimeSettingsFlowCard.tsx`: `13 -> 0`
- Settings-adjacent surfaces (locked from prior wave):
  - `LlmSettingsPage.tsx`: raw `text-xs` `16 -> 0` (guarded)
  - `StoragePage.tsx`: raw `text-xs` `0 -> 0`
- Global typography token baseline uplift in theme:
  - `--sf-token-font-size-caption: 10px -> 11px`
  - `--sf-token-font-size-label: 11px -> 12px`

### Mapping applied
- Applied role-based typography mapping:
  - control labels, button labels, toggles, row labels: `sf-text-label`
  - secondary meta/helper text and supporting lines: `sf-text-caption`
  - section/page headings remain `text-sm font-semibold` for structural hierarchy
- Sidebar navigation normalization:
  - pipeline primary rail and convergence rail nav items now use `min-h-[74px]` for uniform button heights.
  - removed dynamic `N knobs` copy from convergence sidebar nav/button layer.
- Scope:
  - `tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx`
  - `tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx`
  - `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`
  - `tools/gui-react/src/pages/storage/StoragePage.tsx`
  - `tools/gui-react/src/theme.css`

### Enforcement
- `test/pipelineSettingsThemeDriftGuard.test.js`
  - added guard: blocks raw `text-xs` in pipeline settings surfaces.
  - added guard: enforces uniform sidebar nav min-height and blocks `N knobs` copy in convergence sidebar nav.
- `test/settingsAdjacentThemeDriftGuard.test.js`
  - maintains raw `text-xs` guard for LLM/storage surfaces.
  - added guard: selected LLM user-set row tone must match success badge tone.
- `test/primitiveLayerWiring.test.js`
  - added readable token baseline assertions for caption/label token sizes.
- Validation run:
  - `node --test test/primitiveLayerWiring.test.js test/pipelineSettingsThemeDriftGuard.test.js test/settingsAdjacentThemeDriftGuard.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)

## Batch 11 - Full Panel Audit Refresh + QueueTab Semantic Cutover (2026-03-02)

### Drift metrics
- Full panel drift matrix refresh:
  - surfaces analyzed: `83`
  - drift split: `aligned=4`, `low=14`, `moderate=38`, `high=27` -> `aligned=5`, `low=14`, `moderate=38`, `high=26`
- `tools/gui-react/src/pages/runtime-ops/panels/QueueTab.tsx`:
  - raw utility colors: `131 -> 0`
  - semantic references (`sf-*`): `11 -> 87`
  - drift grade: `high -> aligned`
- Runtime-ops section heat:
  - total raw utility colors: `1587 -> 1456`
  - aligned surfaces: `0 -> 1`

### Mapping applied
- Added generated remediation backlog artifact:
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`
  - generator: `scripts/generatePanelStyleRemediationQueue.js`
- Regenerated matrix artifacts:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
- Migrated `QueueTab` surface to semantic primitives/token aliases:
  - row/table states: `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-table-row-active`, `sf-table-empty-state`
  - tone/text/border roles: `sf-text-primary|muted|subtle`, `sf-status-text-*`, `sf-border-*`, `sf-row-hoverable`, `sf-marker-info`
  - lane and status surfaces: `sf-nav-item`, `sf-nav-item-active`, `sf-chip-*`, `sf-callout-*`
- Expanded `theme.css` primitives for reusable semantic roles used by queue/runtime panels:
  - `sf-status-text-success`
  - `sf-text-primary`, `sf-text-muted`, `sf-text-subtle`
  - `sf-border-default`, `sf-border-soft`, `sf-border-danger-soft`
  - `sf-row-hoverable`
  - `sf-table-row-active`
  - `sf-table-head-danger`, `sf-table-head-cell-danger`
  - `sf-marker-info`
- Normalized shared runtime-ops badge mappers to semantic chip primitives:
  - `queueStatusBadgeClass`
  - `llmCallStatusBadgeClass`
  - `triageDecisionBadgeClass`
  - `riskFlagBadgeClass`

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js`:
  - added guard `runtime queue tab avoids raw utility color classes` (QueueTab-specific raw utility denylist via regex scan).

### Validation run
- Focused guards/build:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)
- Full sweep:
  - `npm test` (failing)
  - blocker: pre-existing AST inventory snapshot gate mismatch in `test/astKnobInventorySnapshot.test.js` (line-number drift in `src/api/routes/configRoutes.js`; requires `node scripts/generateAstKnobInventory.js --write` if snapshot refresh is intended)

## Batch 12 - Prefetch Search Planner Semantic Cutover (2026-03-02)

### Drift metrics
- Full panel matrix summary:
  - `aligned=5`, `low=14`, `moderate=38`, `high=26` -> `aligned=6`, `low=14`, `moderate=38`, `high=25`
- Runtime-ops section heat:
  - high drift surfaces: `11 -> 10`
  - aligned surfaces: `1 -> 2`
  - raw utility colors: `1456 -> 1394`
- `tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchPlannerPanel.tsx`:
  - raw utility colors: `62 -> 0`
  - semantic refs (`sf-*`): `54 -> 93`
  - drift grade: `high -> aligned`

### Mapping applied
- Migrated planner panel copy/summary/table-callout blocks from inline gray/blue utility bundles to semantic classes:
  - `sf-text-primary`, `sf-text-muted`, `sf-text-subtle`
  - `sf-border-default`
  - `sf-summary-toggle`, `sf-link-accent`, `sf-icon-badge`, `sf-pre-block`
  - existing `sf-chip-*`, `sf-callout-*`, `sf-status-text-*`, `sf-text-*` primitives
- Extended theme primitive coverage in `tools/gui-react/src/theme.css` with reusable roles:
  - `sf-summary-toggle`
  - `sf-link-accent`
  - `sf-icon-badge`
  - `sf-pre-block` (light/dark compatible)

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js`:
  - broadened raw-color guard to cover migrated panel set:
    - `QueueTab.tsx`
    - `PrefetchSearchPlannerPanel.tsx`

### Audit artifacts
- Regenerated:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)
- Full regression sweep:
  - `npm test` (passing)

## Batch 13 - Prefetch Brand Resolver Semantic Cutover (2026-03-02)

### Drift metrics
- Full panel matrix summary:
  - `aligned=6`, `low=14`, `moderate=38`, `high=25` -> `aligned=7`, `low=14`, `moderate=38`, `high=24`
- Runtime-ops section heat:
  - high drift surfaces: `10 -> 9`
  - aligned surfaces: `2 -> 3`
  - raw utility colors: `1394 -> 1282`
- `tools/gui-react/src/pages/runtime-ops/panels/PrefetchBrandResolverPanel.tsx`:
  - raw utility colors: `112 -> 0`
  - semantic refs (`sf-*`): `40 -> 112`
  - drift grade: `high -> aligned`

### Mapping applied
- Migrated Brand Resolver panel from inline gray/blue/red/orange utility color bundles to semantic primitives:
  - text/border/link roles: `sf-text-*`, `sf-border-*`, `sf-link-accent`
  - table/surface roles: `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-pre-block`, `sf-summary-toggle`
  - status/callout roles: `sf-status-text-*`, `sf-chip-*`, `sf-callout-*`
- Updated confidence-ring tone mapping in panel helper to semantic status classes.

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard now includes:
  - `PrefetchBrandResolverPanel.tsx`

### Audit artifacts
- Regenerated:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)

## Batch 14 - Runtime Prefetch Triplet Semantic Cutover (2026-03-02)

### Drift metrics
- Full panel matrix summary:
  - `aligned=7`, `low=14`, `moderate=38`, `high=24` -> `aligned=10`, `low=14`, `moderate=38`, `high=21`
- Runtime-ops section heat:
  - high drift surfaces: `9 -> 6`
  - aligned surfaces: `3 -> 6`
  - raw utility colors: `1282 -> 900`
- Migrated panel deltas:
  - `tools/gui-react/src/pages/runtime-ops/panels/PrefetchUrlPredictorPanel.tsx`: `rawColor=128 -> 0`, `high -> aligned`
  - `tools/gui-react/src/pages/runtime-ops/panels/PrefetchSerpTriagePanel.tsx`: `rawColor=127 -> 0`, `high -> aligned`
  - `tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchResultsPanel.tsx`: `rawColor=127 -> 0`, `high -> aligned`

### Mapping applied
- Replaced residual runtime prefetch panel utility color bundles with semantic primitives/token roles only:
  - text/link/summary: `sf-text-*`, `sf-link-accent`, `sf-summary-toggle`
  - table and row state: `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-table-row-active`, `sf-border-soft`
  - status/callout/chip roles: `sf-status-text-*`, `sf-chip-*`, `sf-callout-*`, `sf-icon-badge`
  - structured payload/pre blocks: `sf-pre-block`
- Removed raw inline color interpolation in predictor heatmap:
  - `rgba(52, 211, 153, x)` -> `rgb(var(--sf-color-accent-rgb) / x)`

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `PrefetchUrlPredictorPanel.tsx`
  - `PrefetchSerpTriagePanel.tsx`
  - `PrefetchSearchResultsPanel.tsx`

### Audit artifacts
- Regenerated (with write mode for matrix snapshot):
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)

## Batch 21 - Search Profile Semantic Cutover (2026-03-02)

### GUI panel
- `Search Profile`

### Drift metrics
- Full panel matrix summary:
  - `aligned=18`, `high=13` -> `aligned=19`, `high=12`
- Indexing section heat:
  - high drift surfaces: `5 -> 4`
  - aligned surfaces: `2 -> 3`
  - raw utility colors: `1143 -> 964`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/SearchProfilePanel.tsx`:
    - `colorCount -> 0`
    - `driftGrade -> aligned`
    - `sfCount=191`

### Mapping applied
- Replaced remaining Search Profile utility color/radius bundles with semantic primitives/token roles:
  - card/surface and button roles: `sf-surface-elevated`, `sf-surface-card`, `sf-action-button`
  - text and semantic tone roles: `sf-text-*`, `sf-status-text-*`
  - table and row-state roles: `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-table-row-active`, `sf-border-soft`
  - callout/chip/preformatted payload roles: `sf-callout-*`, `sf-chip-*`, `sf-pre-block`
  - summary toggles: `sf-summary-toggle`
- Enforced selected-vs-hover stability in query rows by switching to `sf-table-row-active` state class when selected.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `SearchProfilePanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Build:
  - `npm --prefix tools/gui-react run build` (failing; pre-existing RuntimeDraft contract mismatch at `tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx:355`)
- Full regression sweep:
  - `npm test` (failing; unrelated pre-existing failures)
  - failing tests:
    - `test/indexingRuntimeOpsImmediateRunSyncGui.test.js` (`timeout_waiting_for_condition:indexing_reflects_runtimeops_manual_run_switch`)
    - `test/runtimeSettingsKeyCoverageMatrix.test.js` (runtime key coverage mismatch)
    - `test/storageSettingsRoutes.test.js` (`storage-settings PUT keeps localDirectory empty when destination is s3`, expected `200`, got `500`)
- Full regression sweep:
  - `npm test` (passing; `tests=3354`, `pass=3354`, `fail=0`)

## Batch 18 - Runtime Ops High-Drift Burn-Down (2026-03-02)

### Drift metrics
- Full panel matrix summary:
  - `aligned=13`, `low=14`, `moderate=38`, `high=18` -> `aligned=16`, `low=14`, `moderate=38`, `high=15`
- Runtime-ops section heat:
  - high drift surfaces: `3 -> 0`
  - aligned surfaces: `9 -> 12`
  - raw utility colors: `610 -> 362`
- Migrated panel deltas:
  - `tools/gui-react/src/pages/runtime-ops/panels/DocumentsTab.tsx`:
    - `rawColor=66 -> 0`
    - `high -> aligned`
  - `tools/gui-react/src/pages/runtime-ops/panels/ExtractionTab.tsx`:
    - `rawColor=92 -> 0`
    - `high -> aligned`
  - `tools/gui-react/src/pages/runtime-ops/panels/FallbacksTab.tsx`:
    - `rawColor=90 -> 0`
    - `high -> aligned`

### Mapping applied
- Replaced residual high-drift runtime-ops table/filter/inspector styling with semantic primitives/token roles:
  - inputs/selects: `sf-input`, `sf-select`
  - table roles: `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-table-row-active`
  - text/border roles: `sf-text-*`, `sf-border-soft`
  - state/callout/chip roles kept semantic through existing helper mappings
- Replaced confidence/success progress bars with token-driven inline fills (no raw utility color classes):
  - track/background uses semantic token rgb vars
  - fill tone switches by semantic state vars/accent token

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `DocumentsTab.tsx`
  - `ExtractionTab.tsx`
  - `FallbacksTab.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3351`, `pass=3351`, `fail=0`)
- Full regression sweep:
  - `npm test` (passing; `tests=3351`, `pass=3351`, `fail=0`)

## Batch 19 - Indexing Phase05 Semantic Cutover (2026-03-02)

### Drift metrics
- Full panel matrix summary:
  - `aligned=16`, `low=14`, `moderate=38`, `high=15` -> `aligned=17`, `low=14`, `moderate=38`, `high=14`
- Indexing section heat:
  - high drift surfaces: `7 -> 6`
  - aligned surfaces: `0 -> 1`
  - raw utility colors: `1792 -> 1609`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/Phase05Panel.tsx`:
    - `rawColor=183 -> 0`
    - `sf refs=59 -> 149`
    - `high -> aligned`

### Mapping applied
- Replaced repeated Phase05 text/border/background utility color bundles with semantic primitives/token roles:
  - text roles: `sf-text-primary`, `sf-text-subtle`, `sf-status-text-success|warning|danger`
  - border roles: `sf-border-soft`
  - elevated surfaces remained primitive (`sf-surface-elevated`) with removal of residual light/dark utility color overlays
- Preserved existing `sf-*` surface layout and telemetry table structures; only tokenized visual color/radius concerns.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` now includes migrated-panel raw-color guard for:
  - `Phase05Panel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3355`, `pass=3355`, `fail=0`)

## Batch 20 - Runtime Settings Semantic Cutover (2026-03-02)

### Drift metrics
- Full panel matrix summary:
  - `aligned=17`, `low=14`, `moderate=38`, `high=14` -> `aligned=18`, `low=14`, `moderate=38`, `high=13`
- Indexing section heat:
  - high drift surfaces: `6 -> 5`
  - aligned surfaces: `1 -> 2`
  - raw utility colors: `1609 -> 1143`
- Migrated panel delta:
  - GUI panel: `Runtime Settings`
  - `tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx`:
    - `rawColor=466 -> 0`
    - `sf refs=79 -> 289`
    - `high -> aligned`

### Mapping applied
- Migrated `Runtime Settings` panel to semantic primitives/token roles:
  - run/save status tones -> `sf-status-text-*`
  - section wrappers and collapsible headers -> `sf-surface-elevated`, `sf-border-soft`, `sf-summary-toggle`
  - control fields -> `sf-input`, `sf-select`
  - action controls -> `sf-primary-button`, `sf-icon-button`
- Removed residual inline utility color bundles across conditional branches and warning/error text lanes.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `RuntimePanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3355`, `pass=3355`, `fail=0`)

## Batch 15 - Domain Classifier Semantic Cutover (2026-03-02)

### Drift metrics
- Full panel matrix summary:
  - `aligned=10`, `low=14`, `moderate=38`, `high=21` -> `aligned=11`, `low=14`, `moderate=38`, `high=20`
- Runtime-ops section heat:
  - high drift surfaces: `6 -> 5`
  - aligned surfaces: `6 -> 7`
  - raw utility colors: `900 -> 793`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/PrefetchDomainClassifierPanel.tsx`:
    - `rawColor=107 -> 0`
    - `sf refs=44 -> 109`
    - `high -> aligned`

### Mapping applied
- Replaced remaining domain-classifier utility color bundles with semantic primitives/token roles:
  - text/link/summary roles: `sf-text-*`, `sf-link-accent`, `sf-summary-toggle`
  - table/surface roles: `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-table-row-active`, `sf-border-soft`
  - status/callout roles: `sf-status-text-*`, `sf-chip-*`, `sf-callout-*`, `sf-icon-badge`
  - payload panels: `sf-pre-block`

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `PrefetchDomainClassifierPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3351`, `pass=3351`, `fail=0`)

## Batch 16 - NeedSet Semantic Cutover (2026-03-02)

### Drift metrics
- Full panel matrix summary:
  - `aligned=11`, `low=14`, `moderate=38`, `high=20` -> `aligned=12`, `low=14`, `moderate=38`, `high=19`
- Runtime-ops section heat:
  - high drift surfaces: `5 -> 4`
  - aligned surfaces: `7 -> 8`
  - raw utility colors: `793 -> 678`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/PrefetchNeedSetPanel.tsx`:
    - `rawColor=115 -> 0`
    - `sf refs=34 -> 95`
    - `high -> aligned`

### Mapping applied
- Replaced remaining NeedSet panel utility color bundles with semantic primitives/token roles:
  - header/summary text roles: `sf-text-*`, `sf-summary-toggle`
  - row/table/surface roles: `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-border-soft`, `sf-row-hoverable`
  - state and tone roles: `sf-status-text-*`, `sf-callout-*`, `sf-chip-*`
  - structured payload panels: `sf-pre-block`
- Converted identity tooltip panel to semantic elevated surface styling and token-driven arrow fill.

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `PrefetchNeedSetPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3351`, `pass=3351`, `fail=0`)

## Batch 17 - Query Journey Semantic Cutover (2026-03-02)

### Drift metrics
- Full panel matrix summary:
  - `aligned=12`, `low=14`, `moderate=38`, `high=19` -> `aligned=13`, `low=14`, `moderate=38`, `high=18`
- Runtime-ops section heat:
  - high drift surfaces: `4 -> 3`
  - aligned surfaces: `8 -> 9`
  - raw utility colors: `678 -> 610`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/PrefetchQueryJourneyPanel.tsx`:
    - `rawColor=68 -> 0`
    - `high -> aligned`

### Mapping applied
- Replaced remaining Query Journey utility color bundles with semantic primitives/token roles:
  - header/storyline/summary text roles: `sf-text-*`, `sf-summary-toggle`
  - table and row-state roles: `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-table-row-active`, `sf-border-soft`
  - status/tone roles: `sf-status-text-*`, `sf-chip-*`, `sf-callout-*`
  - drawer/list tokenization: semantic chips/text roles only

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `PrefetchQueryJourneyPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
  - `npm --prefix tools/gui-react run build` (passing)

## Batch 22 - LLM Output Semantic Cutover (2026-03-02)

### GUI panel
- `LLM Output Review (All Phases)`

### Drift metrics
- Full panel matrix summary:
  - `aligned=19`, `high=12` -> `aligned=20`, `high=11`
- Indexing section heat:
  - high drift surfaces: `4 -> 3`
  - aligned surfaces: `3 -> 4`
  - raw utility colors: `964 -> 868`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/LlmOutputPanel.tsx`:
    - `colorCount=0`
    - `driftGrade=aligned`
    - `sfCount=108`

### Mapping applied
- Replaced remaining LLM Output panel utility color/radius bundles with semantic primitives/token roles:
  - text/tone roles: `sf-text-*`
  - table roles: `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-table-row-active`, `sf-table-empty-state`, `sf-border-soft`
  - chip/callout/pre roles: `sf-chip-*`, `sf-callout-*`, `sf-pre-block`
- Preserved trace row selected-vs-hover behavior by using semantic active row class (`sf-table-row-active`) instead of inline blue hover bundles.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `LlmOutputPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Build:
  - `npm --prefix tools/gui-react run build` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3355`, `pass=3355`, `fail=0`)

## Batch 23 - Phase 06 Semantic Cutover (2026-03-02)

### GUI panel
- `Evidence Index & Dedupe (Phase 06A)`

### Drift metrics
- Full panel matrix summary:
  - `aligned=20`, `high=11` -> `aligned=21`, `high=10`
- Indexing section heat:
  - high drift surfaces: `3 -> 2`
  - aligned surfaces: `4 -> 5`
  - raw utility colors: `868 -> 775`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/Phase06Panel.tsx`:
    - `colorCount=0`
    - `driftGrade=aligned`
    - `sfCount=106`

### Mapping applied
- Replaced remaining Phase 06 utility color/radius bundles with semantic primitives/token roles:
  - text/tone roles: `sf-text-*`
  - table roles: `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-table-empty-state`, `sf-border-soft`
  - control roles: `sf-input`, `sf-action-button`
- Kept panel behavior unchanged while moving all table/card/search controls to semantic class contracts.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `Phase06Panel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Build:
  - `npm --prefix tools/gui-react run build` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3355`, `pass=3355`, `fail=0`)

## Batch 24 - Event Stream Semantic Cutover (2026-03-02)

### GUI panel
- `IndexLab Event Stream`

### Drift metrics
- Full panel matrix summary:
  - `aligned=21`, `high=10` -> `aligned=22`, `high=9`
- Indexing section heat:
  - high drift surfaces: `2 -> 1`
  - aligned surfaces: `5 -> 6`
  - raw utility colors: `775 -> 688`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/EventStreamPanel.tsx`:
    - `colorCount=0`
    - `driftGrade=aligned`
    - `sfCount=96`

### Mapping applied
- Replaced remaining Event Stream utility color/radius bundles with semantic primitives/token roles:
  - nested details/header tone roles: `sf-text-*`, `sf-icon-button`, `sf-surface-elevated`
  - selector/control roles: `sf-select`
  - table roles: `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-table-empty-state`, `sf-border-soft`
  - chip roles: `sf-chip-warning`
- Kept run/event behavior unchanged while moving nested sections, stage timeline, and URL jobs table to semantic class contracts.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `EventStreamPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Build:
  - `npm --prefix tools/gui-react run build` (failing; unrelated pre-existing RuntimeDraft contract mismatch in `tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx:519`)
- Full regression sweep:
  - `npm test` (passing; `tests=3356`, `pass=3356`, `fail=0`)

## Batch 25 - Batch Processing Semantic Cutover (2026-03-02)

### GUI panel
- `Batch Processing`

### Drift metrics
- Full panel matrix summary:
  - `aligned=22`, `high=9` -> `aligned=23`, `high=8`
- Indexing section heat:
  - high drift surfaces: `1 -> 0`
  - aligned surfaces: `6 -> 7`
  - raw utility colors: `688 -> 613`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/BatchPanel.tsx`:
    - `rawColor=75 -> 0`
    - `driftGrade=aligned`
    - semantic table/chip/status token coverage applied

### Mapping applied
- Replaced remaining Batch Processing utility color bundles with semantic primitives/token roles:
  - summary/status chips -> `sf-chip-*`
  - text/status tones -> `sf-text-*`, `sf-status-text-*`
  - table roles -> `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-border-soft`
  - progress bars -> token-driven inline colors (`--sf-state-*`, `--sf-color-border-default-rgb`)

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `BatchPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Build:
  - `npm --prefix tools/gui-react run build` (failing; pre-existing runtime-settings contract/type drift in `IndexingPage.tsx` and `RuntimeSettingsFlowCard.tsx`)
- Full regression sweep:
  - `npm test` (failing; suite instability with unrelated runtime-settings coverage and intermittent pipeline micro-text guard)

## Batch 26 - Learning Feed Semantic Cutover (2026-03-02)

### GUI panel
- `Learning Feed (Phase 10)`

### Drift metrics
- Full panel matrix summary:
  - `aligned=23`, `high=8` -> `aligned=24`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `7 -> 8`
  - raw utility colors: `613 -> 560`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/LearningPanel.tsx`:
    - `rawColor=53 -> 0`
    - `driftGrade=aligned`
    - `sfCount=44`

### Mapping applied
- Replaced remaining Learning Feed utility color bundles with semantic primitives/token roles:
  - chips/status reasons -> `sf-chip-*`
  - table roles -> `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-border-soft`
  - text tones -> `sf-text-primary`, `sf-text-muted`, `sf-text-subtle`
  - confidence meter bars -> token-driven inline colors (`--sf-state-success-fg`, `--sf-state-warning-fg`, `--sf-state-danger-fg`)

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `LearningPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Build:
  - `npm --prefix tools/gui-react run build` (failing; pre-existing runtime-settings contract/type drift in `IndexingPage.tsx` and `RuntimeSettingsFlowCard.tsx`)
- Full regression sweep:
  - `npm test` (failing; latest run `tests=3357`, `pass=3355`, `fail=2`)
  - failing tests:
    - `test/pipelineSettingsThemeDriftGuard.test.js` (`pipeline settings avoid arbitrary micro text utilities`; intermittent in full-suite context, passes in isolated run)
    - `test/runtimeSettingsKeyCoverageMatrix.test.js` (`runtime PUT keys are fully represented in IndexingPage collect payload and run-start payload`)

## Batch 27 - LLM Runtime Metrics Semantic Cutover (2026-03-02)

### GUI panel
- `LLM Runtime Metrics`

### Drift metrics
- Full panel matrix summary:
  - `aligned=24`, `low=14`, `moderate=37`, `high=8` -> `aligned=24`, `low=15`, `moderate=36`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `8 -> 9`
  - raw utility colors: `560 -> 514`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/LlmMetricsPanel.tsx`:
    - `rawColor=46 -> 0`
    - `driftGrade=aligned`
    - `sfCount=91`

### Mapping applied
- Replaced remaining LLM Runtime Metrics utility color bundles with semantic primitives/token roles:
  - header/summary text tones -> `sf-text-*`
  - section/card roles -> `sf-surface-elevated`
  - table roles -> `sf-table-shell`, `sf-table-head`, `sf-table-head-cell`, `sf-table-row`, `sf-border-soft`
  - model/cap badges -> `sf-chip-success|warning`
  - provider links -> `sf-link-accent`

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `LlmMetricsPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3357`, `pass=3357`, `fail=0`)

## Batch 28 - Need Set Semantic Cutover (2026-03-02)

### GUI panel
- `NeedSet (Phase 01)`

### Drift metrics
- Full panel matrix summary:
  - `aligned=24`, `low=15`, `moderate=36`, `high=8` -> `aligned=25`, `low=15`, `moderate=35`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `9 -> 10`
  - raw utility colors: `514 -> 470`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/NeedSetPanel.tsx`:
    - `rawColor=44 -> 0`
    - `driftGrade=aligned`
    - `sfCount=65`

### Mapping applied
- Replaced remaining NeedSet utility color bundles with semantic primitives/token roles:
  - text/status tones -> `sf-text-*`, `sf-status-text-*`
  - table roles -> `sf-table-shell`, `sf-table-head`, `sf-table-row`, `sf-border-soft`
  - badge/chip roles kept semantic through `sf-chip-*` and helper-mapped semantic classes
- Kept capped table-scroll contract while moving classes to semantic styling.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `NeedSetPanel.tsx`
- Updated `test/needsetPanelScrollCap.test.js` selector to allow semantic table typography classes while preserving capped-scroll assertions.

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
  - `node --test test/needsetPanelScrollCap.test.js test/indexingRuntimeOpsImmediateRunSyncGui.test.js` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3357`, `pass=3357`, `fail=0`)

## Batch 29 - Overview Semantic Cutover (2026-03-02)

### GUI panel
- `Overview`

### Drift metrics
- Full panel matrix summary:
  - `aligned=25`, `low=15`, `moderate=35`, `high=8` -> `aligned=26`, `low=15`, `moderate=34`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `10 -> 11`
  - raw utility colors: `470 -> 415`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/OverviewPanel.tsx`:
    - `rawColor=55 -> 0`
    - `driftGrade=aligned`
    - `sfCount=51`

### Mapping applied
- Replaced remaining Overview utility color bundles with semantic primitives/token roles:
  - text/status tones -> `sf-text-*`, `sf-status-text-*`
  - callout/state lane -> `sf-callout-success|neutral`
  - payload panes -> `sf-pre-block`
  - controls -> `sf-icon-button`
- Replaced inline bar color utility classes with token-driven meter styles:
  - track uses `--sf-color-border-default-rgb`
  - fill uses `--sf-state-success-fg`

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `OverviewPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3357`, `pass=3357`, `fail=0`)

## Batch 30 - URL Health Semantic Cutover (2026-03-02)

### GUI panel
- `URL Health & Repair (Phase 04)`

### Drift metrics
- Full panel matrix summary:
  - `aligned=26`, `low=15`, `moderate=34`, `high=8` -> `aligned=27`, `low=15`, `moderate=33`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `11 -> 12`
  - raw utility colors: `415 -> 361`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/UrlHealthPanel.tsx`:
    - `rawColor=54 -> 0`
    - `driftGrade=aligned`
    - `sfCount=86`

### Mapping applied
- Replaced remaining URL Health utility color bundles with semantic primitives/token roles:
  - header/summary text tones -> `sf-text-*`
  - table roles -> `sf-table-shell`, `sf-table-head`, `sf-table-row`, `sf-border-soft`
  - empty states and row text -> semantic text tones (`sf-text-muted`, `sf-text-subtle`, `sf-text-primary`)
- Preserved existing budget-state badge semantics via `hostBudgetStateBadgeClasses` and retained runtime cooldown calculations.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `UrlHealthPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - `npm test` (failing; latest run `tests=3357`, `pass=3355`, `fail=2`)
  - failing tests (unrelated runtime-settings contract drift):
    - `test/runtimeObservabilityKnobWiring.test.js` (`runtime observability knobs are defaulted, contract-backed, and surfaced in pipeline runtime flow`)
    - `test/runtimeSettingsKeyCoverageMatrix.test.js` (`runtime PUT keys are fully represented in IndexingPage collect payload and run-start payload`)

## Batch 31 - Phase 08 Semantic Cutover (2026-03-02)

### GUI panel
- `Extraction Context Matrix (Phase 08)`

### Drift metrics
- Full panel matrix summary:
  - `aligned=27`, `low=15`, `moderate=33`, `high=8` -> `aligned=28`, `low=15`, `moderate=32`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `12 -> 13`
  - raw utility colors: `361 -> 309`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/Phase08Panel.tsx`:
    - `rawColor=52 -> 0`
    - `driftGrade=aligned`
    - `sfCount=83`

### Mapping applied
- Replaced remaining Phase 08 utility text/border bundles with semantic primitives/token roles:
  - header/summary tones -> `sf-text-*`
  - table roles -> `sf-table-shell`, `sf-table-head`, `sf-table-row`, `sf-border-soft`
  - row/empty-state text -> semantic text roles (`sf-text-primary`, `sf-text-subtle`, `sf-text-muted`)
- Kept status-chip behavior and extraction context counters unchanged while migrating styling only.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `Phase08Panel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3357`, `pass=3357`, `fail=0`)

## Batch 32 - Phase 07 Semantic Cutover (2026-03-02)

### GUI panel
- `Tier Retrieval & Prime Sources (Phase 07)`

### Drift metrics
- Full panel matrix summary:
  - `aligned=28`, `low=15`, `moderate=32`, `high=8` -> `aligned=29`, `low=15`, `moderate=31`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `13 -> 14`
  - raw utility colors: `309 -> 257`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/Phase07Panel.tsx`:
    - `rawColor=52 -> 0`
    - `driftGrade=aligned`
    - `sfCount=83`

### Mapping applied
- Replaced remaining Phase 07 utility color bundles with semantic primitives/token roles:
  - header/summary text tones -> `sf-text-*`
  - table roles -> `sf-table-shell`, `sf-table-head`, `sf-table-row`, `sf-border-soft`
  - caution marker tone -> `sf-status-text-warning`
  - row/empty-state text -> semantic text roles (`sf-text-primary`, `sf-text-subtle`, `sf-text-muted`)
- Kept retrieval/prime-source behavior and selected/deficit chip semantics unchanged.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `Phase07Panel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3357`, `pass=3357`, `fail=0`)

## Batch 33 - Phase 06B Semantic Cutover (2026-03-02)

### GUI panel
- `Automation Queue (Phase 06B)`

### Drift metrics
- Full panel matrix summary:
  - `aligned=29`, `low=15`, `moderate=31`, `high=8` -> `aligned=30`, `low=15`, `moderate=30`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `14 -> 15`
  - raw utility colors: `257 -> 209`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/Phase06bPanel.tsx`:
    - `rawColor=48 -> 0`
    - `driftGrade=aligned`
    - `sfCount=82`

### Mapping applied
- Replaced remaining Phase 06B utility color bundles with semantic primitives/token roles:
  - header/summary text tones -> `sf-text-*`
  - table roles -> `sf-table-shell`, `sf-table-head`, `sf-table-row`, `sf-border-soft`
  - row/empty-state text -> semantic text roles (`sf-text-primary`, `sf-text-subtle`, `sf-text-muted`)
- Preserved queue/job/action semantics and status chip mappings.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `Phase06bPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3357`, `pass=3357`, `fail=0`)

## Batch 34 - Phase 09 Semantic Cutover (2026-03-02)

### GUI panel
- `Convergence Round Summary (Phase 09)`

### Drift metrics
- Full panel matrix summary:
  - `aligned=30`, `low=15`, `moderate=30`, `high=8` -> `aligned=31`, `low=15`, `moderate=29`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `15 -> 16`
  - raw utility colors: `209 -> 174`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/Phase09Panel.tsx`:
    - `rawColor=35 -> 0`
    - `driftGrade=aligned`
    - `sfCount=45`

### Mapping applied
- Replaced remaining Phase 09 utility color bundles with semantic primitives/token roles:
  - header/summary text tones -> `sf-text-*`
  - table roles -> `sf-table-shell`, `sf-table-head`, `sf-table-row`, `sf-border-soft`
  - confidence meter bars -> token-driven inline colors (`--sf-state-success|warning|danger-fg`)
  - delta tones -> `sf-status-text-success|danger`
- Preserved convergence round/delta behavior and stop-reason semantics.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `Phase09Panel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js test/primitiveLayerWiring.test.js test/themeInfrastructureWiring.test.js test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - `npm test` (failing; stable pre-existing runtime-settings contract drift)
  - latest run: `tests=3358`, `pass=3355`, `fail=3`
  - failing tests:
    - `test/runtimeLlmBudgetKnobWiring.test.js` (`runtime llm budget/reasoning knobs are defaulted, contract-backed, and surfaced in pipeline runtime flow`)
    - `test/runtimeSettingsKeyCoverageMatrix.test.js` (`runtime PUT keys are fully represented in IndexingPage collect payload and run-start payload`)
    - `test/runtimeSettingsSerializerParity.test.js` (`runtime settings serializer parity: domain serializer covers runtime route PUT key contract`)

## Batch 35 - SERP Explorer Semantic Cutover + Title Consistency Guard (2026-03-02)

### GUI panel
- `SERP Explorer`

### Drift metrics
- Full panel matrix summary:
  - `aligned=31`, `low=15`, `moderate=29`, `high=8` -> `aligned=32`, `low=14`, `moderate=29`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `16 -> 17`
  - raw utility colors: `174 -> 144`
  - moderate surfaces: `5 -> 4`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/SerpExplorerPanel.tsx`:
    - `rawColor=30 -> 0`
    - `driftGrade=aligned`
    - `sfCount=37`

### Mapping applied
- Replaced remaining SERP Explorer utility color bundles with semantic primitives/token roles:
  - header/summary text tones -> `sf-text-primary|muted|caption`
  - table roles -> `sf-table-shell`, `sf-table-head`, `sf-table-row`, `sf-border-soft`
  - empty-state text -> `sf-text-muted`
- Removed phase suffix labels from indexing panel titles and nested phase-labeled subheaders for naming consistency (for example `SearchProfile JSON` instead of `SearchProfile JSON (Phase 02)`).

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` updates:
  - migrated-panel raw-color guard expanded to include:
    - `SerpExplorerPanel.tsx`
  - new title consistency guard:
    - `indexing panel titles avoid phase suffix labels`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js` (passing)
  - `node --test test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - `npm test` (passing; `tests=3362`, `pass=3362`, `fail=0`)

## Batch 36 - Session Data Semantic Cutover (2026-03-02)

### GUI panel
- `Session Data`

### Drift metrics
- Full panel matrix summary:
  - `aligned=32`, `low=14`, `moderate=29`, `high=8` -> `aligned=33`, `low=14`, `moderate=28`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - aligned surfaces: `17 -> 18`
  - raw utility colors: `144 -> 122`
  - moderate surfaces: `4 -> 3`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/SessionDataPanel.tsx`:
    - `rawColor=22 -> 0`
    - `driftGrade=aligned`
    - `sfCount=17`

### Mapping applied
- Replaced remaining Session Data utility color bundles with semantic primitives/token roles:
  - label/value tones -> `sf-text-muted`, `sf-text-primary`, `sf-status-text-warning`
  - run metadata text -> `sf-text-caption sf-text-muted`
  - details summary title tone -> `sf-text-primary`
  - collapse glyph shell -> `sf-icon-button`

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `SessionDataPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js` (passing)
  - `node --test test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - not run in this batch (focused theme/drift coverage only)

## Batch 37 - Picker Semantic Cutover (2026-03-02)

### GUI panel
- `Product Picker`

### Drift metrics
- Full panel matrix summary:
  - `aligned=33`, `low=14`, `moderate=28`, `high=8` -> `aligned=34`, `low=14`, `moderate=27`, `high=8`
- Indexing section heat:
  - aligned surfaces: `18 -> 19`
  - raw utility colors: `122 -> 80`
  - moderate surfaces: `3 -> 2`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/PickerPanel.tsx`:
    - `rawColor=42 -> 0`
    - `driftGrade=aligned`
    - `sfCount=31`

### Mapping applied
- Replaced Product Picker utility color bundles with semantic primitives/token roles:
  - panel shell -> `sf-surface-panel`
  - select controls -> `sf-select`
  - meter/status text -> `sf-text-*`, `sf-status-text-*`
  - ambiguity badge and meter fill -> semantic chip/status mapping via token-driven helper functions
  - action buttons -> `sf-primary-button`, `sf-danger-button`, `sf-icon-button`, `sf-action-button`
- Removed decorative `Start Here` header badge to keep header state/action-only.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `PickerPanel.tsx`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js` (passing)
  - `node --test test/themeProfileRuntimeWiring.test.js` (passing)

## Batch 38 - Worker Lanes Semantic Cutover (2026-03-02)

### GUI panel
- `Worker Lanes`

### Drift metrics
- Full panel matrix summary:
  - `aligned=34`, `low=14`, `moderate=27`, `high=8` -> `aligned=35`, `low=14`, `moderate=26`, `high=8`
- Indexing section heat:
  - aligned surfaces: `19 -> 20`
  - raw utility colors: `80 -> 54`
  - moderate surfaces: `2 -> 1`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/WorkerPanel.tsx`:
    - `rawColor=26 -> 0`
    - `driftGrade=aligned`
    - `sfCount=27`

### Mapping applied
- Replaced lane bar color utility classes with token-driven inline colors.
- Migrated header/body/budget text to semantic roles.
- Replaced paused and budget violation visuals with semantic chip/status classes.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `WorkerPanel.tsx`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js` (passing)
  - `node --test test/themeProfileRuntimeWiring.test.js` (passing)

## Batch 39 - Indexing Page Shell Semantic Cutover (2026-03-02)

### GUI surface
- `IndexingPage` container shell/runtime wiring surface

### Drift metrics
- Full panel matrix summary:
  - `aligned=35`, `low=14`, `moderate=26`, `high=8` -> `aligned=36`, `low=14`, `moderate=25`, `high=8`
- Indexing section heat:
  - aligned surfaces: `20 -> 21`
  - raw utility colors: `54 -> 12`
  - moderate surfaces: `1 -> 0`
- Migrated surface delta:
  - `tools/gui-react/src/pages/indexing/IndexingPage.tsx`:
    - `rawColor=42 -> 0`
    - `driftGrade=aligned`
    - `sfCount=17`

### Mapping applied
- Replaced ambiguity meter preset class literals with semantic chip/status token classes.
- Replaced action-error banner utility bundle with `sf-callout sf-callout-danger`.

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` new guard:
  - `indexing page shell avoids raw utility color classes`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js` (passing)
  - `node --test test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - not run in this batch (focused theme/drift coverage only)

## Batch 40 - Panel Controls Semantic Cutover (2026-03-02)

### GUI panel
- `Panel Controls`

### Drift metrics
- Full panel matrix summary:
  - `aligned=36`, `low=14`, `moderate=25`, `high=8` -> `aligned=37`, `low=13`, `moderate=25`, `high=8`
- Indexing section heat:
  - high drift surfaces: `0 -> 0`
  - moderate surfaces: `0 -> 0`
  - low surfaces: `1 -> 0`
  - aligned surfaces: `21 -> 22`
  - raw utility colors: `12 -> 0`
- Migrated panel delta:
  - `tools/gui-react/src/pages/indexing/panels/PanelControlsPanel.tsx`:
    - `rawColor=12 -> 0`
    - `driftGrade=aligned`
    - `sfCount=12`

### Mapping applied
- Replaced remaining panel-controls utility color bundles with semantic primitives/token roles:
  - summary/header text -> `sf-text-primary`, `sf-text-caption`
  - row labels/detail text -> `sf-text-muted`, `sf-text-subtle`
  - collapse glyph shell -> `sf-icon-button`

### Enforcement
- `test/indexingPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `PanelControlsPanel.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/indexingPanelThemeDriftGuard.test.js` (passing)
  - `node --test test/themeProfileRuntimeWiring.test.js` (passing)
- Full regression sweep:
  - not run in this batch (focused theme/drift coverage only)

## Batch 41 - Runtime Ops LLM Call Panel Semantic Cutover (2026-03-02)

### GUI panel
- `LLM Call Details`

### Drift metrics
- Full panel matrix summary:
  - `aligned=39`, `low=13`, `moderate=23`, `high=8` -> `aligned=40`, `low=13`, `moderate=22`, `high=8`
- Runtime Ops section heat:
  - aligned surfaces: `14 -> 15`
  - moderate surfaces: `8 -> 7`
  - raw utility colors: `263 -> 221`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/PrefetchLlmCallPanel.tsx`:
    - `rawColor=42 -> 0`
    - `driftGrade=aligned`
    - `sfCount=36`

### Mapping applied
- Replaced raw gray/red/blue utility bundles with semantic primitives/token roles:
  - card + stats surfaces -> `sf-surface-card`
  - text roles -> `sf-text-primary`, `sf-text-muted`, `sf-text-subtle`
  - link/button text -> `sf-link-accent`
  - error line -> `sf-status-text-danger`
  - expanded I/O block -> `sf-border-soft`, `sf-pre-block`

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `PrefetchLlmCallPanel.tsx`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)

## Batch 42 - Runtime Ops Pre-Fetch Tab Row Semantic Cutover (2026-03-02)

### GUI panel
- `Pre-Fetch` tab strip

### Drift metrics
- Full panel matrix summary:
  - `aligned=40`, `low=13`, `moderate=22`, `high=8` -> `aligned=41`, `low=13`, `moderate=21`, `high=8`
- Runtime Ops section heat:
  - aligned surfaces: `15 -> 16`
  - moderate surfaces: `7 -> 6`
  - raw utility colors: `221 -> 185`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/PrefetchTabRow.tsx`:
    - `rawColor=36 -> 0`
    - `driftGrade=aligned`
    - `sfCount=13`

### Mapping applied
- Migrated tab strip shell, labels, selected/hover states, marker dots, and tooltip skin to semantic primitives/token roles:
  - row shell -> `sf-surface-shell`, `sf-border-default`
  - selected tab skin -> `sf-surface-elevated`
  - idle/hover text states -> `sf-text-muted`, `sf-row-hoverable`
  - marker dots -> `sf-chip-*` semantic variants
  - tooltip -> `sf-surface-elevated`, `sf-border-default`, semantic text roles

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `PrefetchTabRow.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`
- Generator sequencing fix (operational):
  - run matrix `--write` before queue `--write` to avoid stale queue snapshot summaries.

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)

## Batch 43 - Runtime Ops Overview Panel Semantic Cutover (2026-03-02)

### GUI panel
- `Overview`

### Drift metrics
- Full panel matrix summary:
  - `aligned=41`, `low=13`, `moderate=21`, `high=8` -> `aligned=42`, `low=13`, `moderate=20`, `high=8`
- Runtime Ops section heat:
  - aligned surfaces: `16 -> 17`
  - moderate surfaces: `6 -> 5`
  - raw utility colors: `185 -> 153`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/OverviewTab.tsx`:
    - `rawColor=32 -> 0`
    - `driftGrade=aligned`
    - `sfCount=20`

### Mapping applied
- Migrated card/shell/text/border/hover/error styles to semantic primitives/token roles:
  - cards -> `sf-surface-card`
  - text hierarchy -> `sf-text-primary`, `sf-text-muted`, `sf-text-subtle`
  - borders -> `sf-border-default`, `sf-border-soft`
  - row interactions -> `sf-row-hoverable`
  - error text -> `sf-status-text-danger`

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `OverviewTab.tsx`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)

## Batch 44 - Runtime Ops Metrics Rail Semantic Cutover (2026-03-02)

### GUI panel
- `Metrics Rail`

### Drift metrics
- Full panel matrix summary:
  - `aligned=42`, `low=13`, `moderate=20`, `high=8` -> `aligned=43`, `low=13`, `moderate=19`, `high=8`
- Runtime Ops section heat:
  - aligned surfaces: `17 -> 18`
  - moderate surfaces: `5 -> 4`
  - raw utility colors: `153 -> 121`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/MetricsRail.tsx`:
    - `rawColor=32 -> 0`
    - `driftGrade=aligned`
    - `sfCount=14`

### Mapping applied
- Replaced residual border/text/track/fill utility bundles with semantic primitives.
- Added shared meter primitives in theme layer:
  - `tools/gui-react/src/theme.css`
    - `.sf-meter-track`
    - `.sf-meter-fill`

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `MetricsRail.tsx`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)

## Batch 45 - Runtime Ops Pipeline Flow Strip Semantic Cutover (2026-03-02)

### GUI panel
- `Pipeline Flow`

### Drift metrics
- Full panel matrix summary:
  - `aligned=43`, `low=13`, `moderate=19`, `high=8` -> `aligned=44`, `low=13`, `moderate=18`, `high=8`
- Runtime Ops section heat:
  - aligned surfaces: `18 -> 19`
  - moderate surfaces: `4 -> 3`
  - raw utility colors: `121 -> 104`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/PipelineFlowStrip.tsx`:
    - `rawColor=17 -> 0`
    - `driftGrade=aligned`
    - `sfCount=12`

### Mapping applied
- Converted flow shell/cards/labels/arrows/active and fail text states to semantic primitives:
  - surfaces -> `sf-surface-card`, `sf-surface-elevated`
  - text states -> `sf-text-muted`, `sf-text-subtle`, `sf-status-text-info`, `sf-status-text-danger`
  - hover behavior -> `sf-row-hoverable`

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `PipelineFlowStrip.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/indexingPanelThemeDriftGuard.test.js test/themeProfileRuntimeWiring.test.js` (passing)

## Batch 51 - Runtime Ops Shared Component Semantic Drift Closure (2026-03-02)

### GUI panels affected
- `Search Results`
- `SERP Triage`
- `URL Predictor`
- `Search Planner`
- `NeedSet`
- `Domain Classifier`
- `Brand Resolver`

### Drift metrics
- Full panel matrix summary:
  - `aligned=50`, `low=10`, `moderate=15`, `high=8` -> `aligned=50`, `low=10`, `moderate=15`, `high=8`
- Runtime Ops section heat:
  - remains fully aligned (`high=0`, `moderate=0`, `low=0`, `aligned=25`, `rawColor=0`)
- New component guard coverage:
  - runtime-ops shared component raw-color offenders: `7 -> 0`
  - runtime-ops shared component micro-text offenders: `7 -> 0`

### Mapping applied
- Migrated runtime-ops shared components to semantic primitives/token roles:
  - `tools/gui-react/src/pages/runtime-ops/components/StatCard.tsx`
  - `tools/gui-react/src/pages/runtime-ops/components/StageCard.tsx`
  - `tools/gui-react/src/pages/runtime-ops/components/ScoreBar.tsx`
  - `tools/gui-react/src/pages/runtime-ops/components/StackedScoreBar.tsx`
  - `tools/gui-react/src/pages/runtime-ops/components/KanbanLane.tsx`
  - `tools/gui-react/src/pages/runtime-ops/components/VerticalStepper.tsx`
  - `tools/gui-react/src/pages/runtime-ops/components/PrefetchTooltip.tsx`
  - `tools/gui-react/src/pages/runtime-ops/components/ProgressRing.tsx`
- Added shared component primitives in `tools/gui-react/src/theme.css`:
  - `sf-meter-fill-success`, `sf-meter-fill-warning`, `sf-meter-fill-danger`
  - `sf-card-hover-accent`
  - `sf-tooltip-content`, `sf-tooltip-arrow`
  - `sf-step-index-badge`

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` expanded with:
  - `runtime-ops shared components avoid raw utility color classes`
  - `runtime-ops shared components avoid arbitrary micro text utilities`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)
  - `node --test test/searchResultsHelpers.test.js test/serpTriageHelpers.test.js test/urlPredictorHelpers.test.js` (passing)
  - `node --test test/themeProfileRuntimeWiring.test.js` (passing)

## Batch 52 - Component Review Panel + Page Semantic Cutover (2026-03-02)

### GUI panels
- `Component Review` panel strip/cards
- `Component Review` page shell/tabs/debug toggle

### Drift metrics
- Full panel matrix summary:
  - `aligned=50`, `low=10`, `moderate=15`, `high=8` -> `aligned=52`, `low=10`, `moderate=14`, `high=7`
- Component-review section heat:
  - `high=3`, `moderate=2`, `aligned=0`, `rawColor=388` -> `high=2`, `moderate=1`, `aligned=2`, `rawColor=268`
- Migrated panel delta:
  - `tools/gui-react/src/pages/component-review/ComponentReviewPanel.tsx`:
    - `rawColor=96 -> 0`
    - `driftGrade=aligned`
  - `tools/gui-react/src/pages/component-review/ComponentReviewPage.tsx`:
    - `rawColor=24 -> 0`
    - `driftGrade=aligned`

### Mapping applied
- Added component-review drift guard:
  - `test/componentReviewThemeDriftGuard.test.js`
- Migrated panel/page surfaces to semantic primitives:
  - chips: `sf-chip-*`
  - callouts/pre blocks: `sf-callout-*`, `sf-pre-block`
  - buttons: `sf-primary-button`, `sf-action-button`, `sf-icon-button`, `sf-nav-item`, `sf-nav-item-active`
  - text/status: `sf-text-*`, `sf-status-text-*`
  - meters: `sf-meter-track`, `sf-meter-fill-*`
- Removed residual arbitrary micro typography in both migrated files (`text-[10px]`, `text-[11px]`).

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/componentReviewThemeDriftGuard.test.js` (passing)
  - `node --test test/componentReviewDataLaneState.test.js test/guiPersistenceSessionScope.test.js test/componentReviewThemeDriftGuard.test.js` (passing)

## Batch 46 - Runtime Ops Worker Live Panel Semantic Cutover (2026-03-02)

### GUI panel
- `Worker Live`

### Drift metrics
- Full panel matrix summary:
  - `aligned=45`, `low=13`, `moderate=17`, `high=8` -> `aligned=46`, `low=13`, `moderate=16`, `high=8`
- Runtime Ops section heat:
  - aligned surfaces: `20 -> 21`
  - moderate surfaces: `1 -> 0`
  - raw utility colors: `85 -> 56`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/WorkerLivePanel.tsx`:
    - `rawColor=29 -> 0`
    - `driftGrade=aligned`
    - `sfCount=24`

### Mapping applied
- Migrated compact worker header rows, stage strip connectors, timer/meta text, error labels, and stuck banner to semantic primitives.
- Replaced connector color bundles with semantic meter primitives (`sf-meter-track` / `sf-meter-fill`).
- Removed non-ASCII separators from inline UI text for consistency.

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `WorkerLivePanel.tsx`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)

## Batch 47 - Runtime Ops Page Shell Semantic Cutover (2026-03-02)

### GUI surface
- `Runtime Ops` page shell (run selector, tabs, empty state wiring surface)

### Drift metrics
- Full panel matrix summary:
  - `aligned=45`, `low=13`, `moderate=17`, `high=8` -> `aligned=46`, `low=13`, `moderate=16`, `high=8`
- Runtime Ops section heat:
  - moderate surfaces: `1 -> 0`
  - residual runtime-ops drift is now low-only (`WorkersTab`, `ScreenshotPreview`, `BrowserStream`).

### Mapping applied
- Replaced page shell raw utility color bundles with semantic primitives/token roles:
  - header shell -> `sf-surface-shell`, `sf-border-default`
  - run select -> `sf-select`
  - tab nav -> `sf-nav-item`, `sf-nav-item-active`
  - empty-state text + command block -> semantic text + `sf-pre-block`

### Enforcement
- Added dedicated runtime-ops page guard in:
  - `test/runtimeOpsPanelThemeDriftGuard.test.js`
  - test: `runtime-ops page shell avoids raw utility color classes`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/indexingPanelThemeDriftGuard.test.js test/themeProfileRuntimeWiring.test.js` (passing)

## Batch 48 - Runtime Ops Workers Tab Shell Semantic Cutover (2026-03-02)

### GUI panel
- `Workers` tab shell

### Drift metrics
- Full panel matrix summary:
  - `aligned=46`, `low=13`, `moderate=16`, `high=8` -> `aligned=47`, `low=13`, `moderate=15`, `high=8`
- Runtime Ops section heat:
  - aligned surfaces: `21 -> 22`
  - low surfaces: `3 -> 2`
  - raw utility colors: `56 -> 44`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/WorkersTab.tsx`:
    - `rawColor=12 -> 0`
    - `driftGrade=aligned`
    - `sfCount=8`

### Mapping applied
- Replaced pool-filter strip, select shell, empty-state text, and prefetch overlay utility bundles with semantic primitives:
  - `sf-surface-shell`, `sf-border-default`, `sf-select`, `sf-text-*`, `sf-overlay-muted`

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `WorkersTab.tsx`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)

## Batch 49 - Runtime Ops Browser Stream Semantic Cutover (2026-03-02)

### GUI panel
- `Browser Stream`

### Drift metrics
- Full panel matrix summary:
  - `aligned=47`, `low=13`, `moderate=15`, `high=8` -> `aligned=48`, `low=12`, `moderate=15`, `high=8`
- Runtime Ops section heat:
  - aligned surfaces: `22 -> 23`
  - low surfaces: `2 -> 1`
  - raw utility colors: `44 -> 37`
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/BrowserStream.tsx`:
    - `rawColor=7 -> 0`
    - `driftGrade=aligned`
    - `sfCount=8`

### Mapping applied
- Replaced fallback/connecting/ended utility text bundles and LIVE badge utility bundle with semantic classes.
- Kept runtime visual emphasis while moving to token-driven states (`sf-chip-danger`, `sf-text-*`, `sf-surface-shell`).

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `BrowserStream.tsx`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)

## Batch 50 - Runtime Ops Screenshot Preview Semantic + Radius Normalization (2026-03-02)

### GUI panel
- `Screenshot Preview`

### Drift metrics
- Full panel matrix summary:
  - `aligned=48`, `low=11`, `moderate=15`, `high=8` -> `aligned=50`, `low=10`, `moderate=15`, `high=8`
- Runtime Ops section heat:
  - aligned surfaces: `23 -> 25`
  - low surfaces: `1 -> 0`
  - raw utility colors: `37 -> 0`
  - section state: fully aligned
- Migrated panel delta:
  - `tools/gui-react/src/pages/runtime-ops/panels/ScreenshotPreview.tsx`:
    - `rawColor=8 -> 0`
    - `driftGrade=aligned`
    - `sfCount=7`

### Mapping applied
- Removed residual gray/blue utility bundles from preview shell and loading indicator.
- Loading spinner migrated to semantic meter primitives (`sf-meter-track` + `sf-meter-fill`).
- Radius palette normalized (`rounded-b` -> `rounded`) to satisfy aligned threshold.

### Enforcement
- `test/runtimeOpsPanelThemeDriftGuard.test.js` migrated-panel raw-color guard expanded to include:
  - `ScreenshotPreview.tsx`

### Audit artifacts
- Regenerated with write mode:
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.md`
  - `implementation/ui-styling-system-standardization/panel-style-drift-matrix.snapshot.json`
  - `implementation/ui-styling-system-standardization/panel-style-remediation-queue.md`

### Validation run
- Focused:
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js` (passing)
  - `node --test test/runtimeOpsPanelThemeDriftGuard.test.js test/indexingPanelThemeDriftGuard.test.js test/themeProfileRuntimeWiring.test.js` (passing)

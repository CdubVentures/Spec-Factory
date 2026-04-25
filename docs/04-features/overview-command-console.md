# Overview Command Console

> **Purpose:** Document the Overview page bulk-action surface — row selection, the Command Console panel, the selection strip, the Score Card column, and the full-pipeline orchestrator.
> **Prerequisites:** [routing-and-gui.md](../03-architecture/routing-and-gui.md), [catalog-and-product-selection.md](./catalog-and-product-selection.md)
> **Last validated:** 2026-04-24 (Links column added)

## Entry Points

| Surface | Path | Role |
|--------|------|------|
| Overview page | `tools/gui-react/src/pages/overview/OverviewPage.tsx` | catalog table at `/`, hosts every console surface |
| Command Console panel | `tools/gui-react/src/pages/overview/CommandConsole.tsx` | top-right panel — bulk per-finder dispatch + smart-select + pipeline run/stop |
| Active & selected row | `tools/gui-react/src/pages/overview/ActiveAndSelectedRow.tsx` | two-group row above the filter bar — left group lists every product running any worker (CEF/PIF/RDF/SKU/KF/Pipeline) regardless of selection; right group lists selected-but-idle products |
| Score Card cell | `tools/gui-react/src/pages/overview/ScoreCardCell.tsx` | per-row letter grade (A+ through F) |
| Pipeline orchestrator | `tools/gui-react/src/pages/overview/usePipelineController.ts` | 7-stage barrier hook for the Run Full Pipeline button |

## Dependencies

- `tools/gui-react/src/pages/overview/overviewSelectionStore.ts` - Zustand selection slice, category-keyed `Set<productId>`.
- `tools/gui-react/src/pages/overview/bulkDispatch.ts` - pure fan-out helpers per module (CEF / PIF loop + eval / RDF / SKU / KF).
- `tools/gui-react/src/pages/overview/smartSelect.ts` - `pickBottomQuartileSample` and `pickNextBatch` pure helpers.
- `tools/gui-react/src/pages/overview/useSmartSelectHistory.ts` - 24h sliding-window history persisted in `localStorage`.
- `tools/gui-react/src/pages/overview/scoreCard.ts` - weighted-score calculator and letter-grade band.
- `tools/gui-react/src/pages/overview/activeAndSelectedRowDerivation.ts` - pure splitter that produces the row's two visible groups (Active / Selected-idle).
- `tools/gui-react/src/features/operations/hooks/useFireAndForget.ts` - dispatch transport for every bulk action.
- `tools/gui-react/src/features/operations/hooks/useFinderOperations.ts` - `useRunningProductIds(category)` and `useRunningModulesByProduct(category)` power the Active group's badge list and per-badge live indicators.
- `tools/gui-react/src/features/key-finder/api/keyFinderQueries.ts` - `useReservedKeysQuery(category)` filters the KF fan-out.

## SSOT

- **Selection state** lives only in `overviewSelectionStore`. It is ephemeral - not persisted across page reloads.
- **Smart-select 24h cooldown** is persisted in `localStorage` under `sf:overview:smartSelectHistory:<category>`.
- **No backend mutations** are introduced by this surface. Every button calls existing finder POST endpoints; the console is a composition layer.
- **Score Card** is fully derived from `CatalogRow` (no persisted score). Recomputed each render.

## Layout

```
┌─ OverviewPage ─────────────────────────────────────────────────┐
│ ┌─ MetricRow (3 cards) ──┐  ┌─ CommandConsole ─────────────┐   │
│ │ Products / Avg Conf /  │  │ Row 1: badge · Clear · Smart │   │
│ │ Keys Resolved          │  │ Row 2: CEF/PIF/RDF/SKU/KF    │   │
│ │                        │  │ Row 3: Pipeline stepper      │   │
│ └────────────────────────┘  └──────────────────────────────┘   │
│                                                                │
│ ┌─ ActiveAndSelectedRow (only when active > 0 OR selected > 0) ─┐│
│ │ [N active] [active badges…]  │  [M selected, idle] […] Clear ││
│ └───────────────────────────────────────────────────────────────┘│
│                                                                │
│ OverviewFilterBar                                              │
│                                                                │
│ DataTable                                                      │
│   ├─ select column (checkbox, tri-state header)                │
│   ├─ Brand · Base Model · Variant                              │
│   ├─ CEF · PIF · SKU · RDF · Keys                              │
│   ├─ Score · Coverage · Conf · Fields                          │
│   └─ Last Run · Links (paired chevron, slide open together)    │
└────────────────────────────────────────────────────────────────┘
```

## Surfaces

### 1. Row selection

- A `select` column is prepended in `OverviewPage.tsx::buildColumns`. Header is a tri-state checkbox bound to "all visible rows"; cell is a per-row checkbox writing to `overviewSelectionStore`.
- Selection lives in a Zustand slice keyed by category. Switching catalogs leaves selection untouched but the store is read by category, so the active page only sees its own selections.

### 2. Command Console panel

Three rows of fixed-height controls, all 22px tall for vertical alignment:

| Row | Contents |
|-----|----------|
| 1   | Selection badge with live count, Clear chip, "20 lowest" smart-select, "Next 20" smart-select |
| 2   | Five finder chips (CEF / PIF / RDF / SKU / KF) — each chip carries a signature SVG icon plus action buttons (Run / Loop / Eval / Run all / Loop all) |
| 3   | Pipeline label, 7-segment stepper, Run + Stop buttons |

Bulk buttons are disabled when `selection.size === 0` or while the pipeline is running. Operations exceeding 50 prompt a confirmation dialog.

### 3. Active & selected row

- Renders only when at least one product is active **or** at least one product is selected.
- One row, two side-by-side groups:
  - **Active** (left) — every product in the current category with any running op (CEF / PIF / RDF / SKU / KF / Pipeline), regardless of selection. Badges glow with an accent border and the per-worker mini-icons pulse. IndexLab-initiated pipeline runs surface here automatically with a `PL` label, since they share the operations channel.
  - **Selected, idle** (right) — selected products with no running op. Gray styling cues "Command Console will start ops here". Each badge has an inline `×` to deselect, and the group's right-hand `Clear` wipes the whole selection.
- A selected-and-active product appears **only in the Active group** during its run; on terminal status it migrates back into Selected-idle (the selection persists).
- Pure group derivation lives in `activeAndSelectedRowDerivation.ts::deriveActiveAndSelectedGroups` for direct unit testing. The component reads `useRunningProductIds(category)` for the active set and `useRunningModulesByProduct(category)` for the per-badge module indicators.

### 4. Smart-select

- **20 lowest (random):** `pickBottomQuartileSample` sorts ascending by coverage, takes `max(20, ceil(N * 0.25))` as the pool, shuffles, and returns 20.
- **Next 20:** `pickNextBatch` excludes anything still inside the 24h history window, then runs the same bottom-quartile pick over the remaining pool. The picks are appended to the persisted history.
- History is kept in `localStorage` under `sf:overview:smartSelectHistory:<category>` as `{ productId, selectedAt }[]`.

### 5. Score Card

- 13-band school grading (A+ through F) computed in `scoreCard.ts::computeScoreCard`.
- Weights total 100: Coverage 25, Confidence 20, Fields 15, PIF 15, CEF 10, SKU 7.5, RDF 7.5.
- The cell is a monospace tinted chip; tooltip shows the score plus per-axis percentages and weights.

### 6. Last Run + Links columns (paired chevron toggle)

Two adjacent collapsible columns share one persisted flag — `usePersistedToggle('overview:detail-cols:open', false)` — so clicking either chevron expands both, and clicking either chevron again collapses both. Each column renders its own chevron header for ergonomic affordance; the click handlers flip the same flag.

**Last Run** (`OverviewLastRunCell.tsx`) — collapsed = 36px arrow, expanded = ~200px column. Each row renders a vertical stack of five `[CEF · {datetime}] [PIF · {datetime}] [RDF · {datetime}] [SKU · {datetime}] [KF · {datetime}]` lines. Empty timestamp → `—`. Values are formatted with `pullFormatDateTime` (date + time in the user's timezone). Source: `CatalogRow.{cef|pif|rdf|sku|kf}LastRunAt` — projected once per category build by `catalogHelpers.js::buildLastRunMaps` from each finder's `*_finder` summary table (`latest_ran_at` column). Five batched queries per build; constant-time per-row read.

**Links** (`OverviewLinksCell.tsx`) — collapsed = 36px arrow (sibling of Last Run), expanded = ~80px column. Each row renders a vertical stack of five pill-shaped tinted buttons — `CEF / PIF / RDF / SKU / KF` — using the shared per-module tokens (`--sf-token-accent-strong`, `--sf-token-state-success-fg`, `--sf-token-state-warning-fg`, custom purple, `--sf-token-accent`) with `color-mix` for fills and borders. On click, atomically writes `pickerBrand`, `pickerModel`, `pickerProductId` into `indexlabStore` (bypassing the cascading individual setters), stamps the persisted tab key `indexing:tab:active:<productId>:<category>` with the target `FinderPanelId` via `useTabStore`, then `navigate('/indexing')`. The Indexing Lab lands on the chosen finder tab with the product preselected, zero extra clicks.

### 7. Full-pipeline orchestrator

- Seven stages in fixed order: `cef_1`, `cef_2`, `pif_loop`, `pif_eval`, `rdf_run`, `sku_run`, `kf_loop`.
- Global per-stage barrier: every selected product completes stage N before any starts stage N+1.
- `waitForOperationsTerminal(opIds, signal)` subscribes to `useOperationsStore` and resolves when every opId hits `done`, `error`, or `cancelled`. 15-minute hard timeout protects against silently broken ops.
- Fail-soft per product: if a product's op errors, that product is excluded from subsequent stages but the pipeline continues.
- Stop button calls `POST /operations/:id/cancel` for every opId in the current stage and aborts the controller.

## Server Concurrency

Verified in `bulkDispatch.ts` source: no client-side concurrency limiter. None of the per-product finder endpoints serialize across products on the server side. KF locks per-`(productId, fieldKey)` only — different products never collide. A 50ms stagger between dispatches keeps the optimistic stubs ordered and avoids burst POSTs but is cosmetic, not a hard cap.

## Side Effects

- Reads: `/catalog/:category`, `/colors`, `/key-finder/:cat/reserved-keys`, plus per-button finder POSTs.
- Writes: per-finder POSTs only. No new endpoints.
- `localStorage`: `sf:overview:smartSelectHistory:<category>` (smart-select cooldown).

## State Transitions

| Entity | Transition |
|--------|------------|
| Selection slice | empty -> populated (checkbox, smart-select, addMany) -> partially toggled -> cleared |
| Smart-select history | empty -> appended (Next 20) -> aged out after 24h -> cleared by user |
| Pipeline state | idle -> running (per-stage active) -> done | cancelled | error |
| Per-product pipeline status | active -> failed (excluded for remaining stages) |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/pages/overview/OverviewPage.tsx` | column layout and row composition |
| source | `tools/gui-react/src/pages/overview/CommandConsole.tsx` | three-row console structure and per-finder fan-out wiring |
| source | `tools/gui-react/src/pages/overview/SelectionStrip.tsx` | per-badge module indicators and remove/clear behavior |
| source | `tools/gui-react/src/pages/overview/scoreCard.ts` | weighted-score calculation and letter-grade banding |
| source | `tools/gui-react/src/pages/overview/usePipelineController.ts` | stage list, barrier semantics, fail-soft logic, cancel path |
| source | `tools/gui-react/src/pages/overview/smartSelect.ts` | bottom-quartile and next-batch pure helpers |
| source | `tools/gui-react/src/pages/overview/OverviewLinksCell.tsx` | arrow-toggled deep-link column (CEF/PIF/RDF/SKU/KF) — atomic pickerBrand/Model/ProductId setState + tabStore set + navigate('/indexing') |
| source | `tools/gui-react/src/pages/overview/__tests__/smartSelect.test.ts` | unit tests for the smart-select helpers |
| source | `tools/gui-react/src/features/operations/hooks/useFinderOperations.ts` | `useRunningModulesByProduct` selector |

## Related Documents

- [Catalog and Product Selection](./catalog-and-product-selection.md) - per-product CRUD and identity flows behind the Overview table.
- [Routing and GUI](../03-architecture/routing-and-gui.md) - `/` route ownership.
- [Feature Index](./feature-index.md) - feature lookup table.

# Overview Command Console

> **Purpose:** Document the Overview page bulk-action surface — row selection, the Command Console panel, the selection strip, the Score Card column, and the full-pipeline orchestrator.
> **Prerequisites:** [routing-and-gui.md](../03-architecture/routing-and-gui.md), [catalog-and-product-selection.md](./catalog-and-product-selection.md)
> **Last validated:** 2026-04-24

## Entry Points

| Surface | Path | Role |
|--------|------|------|
| Overview page | `tools/gui-react/src/pages/overview/OverviewPage.tsx` | catalog table at `/`, hosts every console surface |
| Command Console panel | `tools/gui-react/src/pages/overview/CommandConsole.tsx` | top-right panel — bulk per-finder dispatch + smart-select + pipeline run/stop |
| Selection strip | `tools/gui-react/src/pages/overview/SelectionStrip.tsx` | scrollable horizontal row of selected-product badges with live module indicators |
| Score Card cell | `tools/gui-react/src/pages/overview/ScoreCardCell.tsx` | per-row letter grade (A+ through F) |
| Pipeline orchestrator | `tools/gui-react/src/pages/overview/usePipelineController.ts` | 7-stage barrier hook for the Run Full Pipeline button |

## Dependencies

- `tools/gui-react/src/pages/overview/overviewSelectionStore.ts` - Zustand selection slice, category-keyed `Set<productId>`.
- `tools/gui-react/src/pages/overview/bulkDispatch.ts` - pure fan-out helpers per module (CEF / PIF loop + eval / RDF / SKU / KF).
- `tools/gui-react/src/pages/overview/smartSelect.ts` - `pickBottomQuartileSample` and `pickNextBatch` pure helpers.
- `tools/gui-react/src/pages/overview/useSmartSelectHistory.ts` - 24h sliding-window history persisted in `localStorage`.
- `tools/gui-react/src/pages/overview/scoreCard.ts` - weighted-score calculator and letter-grade band.
- `tools/gui-react/src/features/operations/hooks/useFireAndForget.ts` - dispatch transport for every bulk action.
- `tools/gui-react/src/features/operations/hooks/useFinderOperations.ts` - `useRunningModulesByProduct(category)` powers the strip's per-badge live indicators.
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
│ ┌─ SelectionStrip (only when selectedSize > 0) ─────────────┐  │
│ │ N selected · X active │ [badge][badge][badge]… │ Clear    │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                │
│ OverviewFilterBar                                              │
│                                                                │
│ DataTable                                                      │
│   ├─ select column (checkbox, tri-state header)                │
│   ├─ Brand · Base Model · Variant                              │
│   ├─ CEF · PIF · SKU · RDF · Keys                              │
│   └─ Score · Coverage · Conf · Fields                          │
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

### 3. Selection strip

- Renders only when `selection.size > 0`.
- Horizontally scrollable row of badges, one per selected product.
- Each badge shows `BRAND base_model variant` plus a strip of mini SVG indicators for any finder module currently running on that product. Active badges glow accent and the indicators pulse.
- Each badge has an inline `×` to deselect that product; the row's right-hand `Clear` wipes the whole selection.
- Live module set comes from `useRunningModulesByProduct(category)`, which derives `Map<productId, Set<moduleType>>` from the operations store with stable string serialization for Zustand equality.

### 4. Smart-select

- **20 lowest (random):** `pickBottomQuartileSample` sorts ascending by coverage, takes `max(20, ceil(N * 0.25))` as the pool, shuffles, and returns 20.
- **Next 20:** `pickNextBatch` excludes anything still inside the 24h history window, then runs the same bottom-quartile pick over the remaining pool. The picks are appended to the persisted history.
- History is kept in `localStorage` under `sf:overview:smartSelectHistory:<category>` as `{ productId, selectedAt }[]`.

### 5. Score Card

- 13-band school grading (A+ through F) computed in `scoreCard.ts::computeScoreCard`.
- Weights total 100: Coverage 25, Confidence 20, Fields 15, PIF 15, CEF 10, SKU 7.5, RDF 7.5.
- The cell is a monospace tinted chip; tooltip shows the score plus per-axis percentages and weights.

### 6. Full-pipeline orchestrator

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
| source | `tools/gui-react/src/pages/overview/__tests__/smartSelect.test.ts` | unit tests for the smart-select helpers |
| source | `tools/gui-react/src/features/operations/hooks/useFinderOperations.ts` | `useRunningModulesByProduct` selector |

## Related Documents

- [Catalog and Product Selection](./catalog-and-product-selection.md) - per-product CRUD and identity flows behind the Overview table.
- [Routing and GUI](../03-architecture/routing-and-gui.md) - `/` route ownership.
- [Feature Index](./feature-index.md) - feature lookup table.

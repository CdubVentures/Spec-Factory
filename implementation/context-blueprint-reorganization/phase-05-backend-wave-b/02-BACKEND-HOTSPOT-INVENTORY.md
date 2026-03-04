# Phase 05 Backend Hotspot Inventory

Snapshot date: 2026-03-02

## Wave B Contexts

| Context | Target Entrypoint | Primary Legacy Sources | Wave B Intent | State |
|---|---|---|---|---|
| `runtime-intelligence-orchestrator` | `src/features/runtime-intelligence/index.js` (planned) | `src/pipeline/runProduct.js`, `src/pipeline/runOrchestrator.js` | Extract runtime orchestration seams into bounded feature/app modules | `IN_PROGRESS` (`05-02` first seam landed) |
| `settings-authority-internals` | `src/features/settings-authority/*` | `src/api/services/settingsContract.js`, `src/api/services/userSettingsService.js` | Relocate settings internals under feature ownership while preserving legacy facades | `IN_PROGRESS` (`WA-A-SET-02` carried into Wave B) |
| `backend-composition-residuals` | `src/app/cli/*`, `src/app/api/*` + feature entrypoints | `src/cli/spec.js`, `src/api/guiServer.js` | Retire residual deep imports and close composition seam debt from prior phases | `SCOPED` |

## Hotspot Watchlist Baseline

| File | Approx lines | Wave B Role |
|---|---:|---|
| `src/pipeline/runProduct.js` | `3965` | Primary runtime-orchestration hotspot |
| `src/cli/spec.js` | `2632` | Residual CLI composition hotspot |
| `src/api/guiServer.js` | `1739` | Residual API composition hotspot |
| `src/api/services/settingsContract.js` | `614` | Settings internals relocation candidate |
| `src/api/services/userSettingsService.js` | `538` | Settings internals relocation candidate |

## Extraction Order

1. `05-01`: Wave B kickoff and hotspot seam seed.
2. `05-02`: `runProduct` orchestration seam extraction plan.
3. `05-03`: settings internals + composition seam cutover plan.
4. `05-04`: Wave B guardrail closure and Phase 06 handoff packet.

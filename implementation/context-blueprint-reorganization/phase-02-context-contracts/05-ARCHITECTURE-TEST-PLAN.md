# Phase 02 Architecture Test Plan

## Objective

Define architecture guardrails that verify feature-boundary imports and contract-only cross-context usage.

## Guardrail Coverage (Warn Mode Specification)

### Backend import guard (warn mode)

- Detect `src/features/<A>/**` importing `src/features/<B>/**` where `A != B`.
- Allow only imports targeting `src/features/<B>/index.js`.
- Flag legacy mixed-path exceptions with adapter reference.
- Transitional overlay while pre-slice:
  - map legacy ownership groups from `02-CONTEXT-OWNERSHIP-MATRIX.md`
  - flag legacy cross-group imports as warnings tied to adapter seam IDs in `04-CONTRACT-ENTRYPOINT-INVENTORY.md`

### Frontend import guard (warn mode)

- Detect `tools/gui-react/src/features/<A>/**` importing `.../features/<B>/**` where `A != B`.
- Allow only imports targeting `tools/gui-react/src/features/<B>/index.ts`.
- Flag page/store-level legacy imports that bypass contracts.
- Transitional overlay while pre-slice:
  - map legacy page/store ownership groups from `02-CONTEXT-OWNERSHIP-MATRIX.md`
  - flag cross-group imports as warnings tied to adapter seam IDs

### Hotspot drift watchlist

- `src/cli/spec.js`
- `src/api/guiServer.js`
- `src/pipeline/runProduct.js`
- `tools/gui-react/src/pages/studio/StudioPage.tsx`
- `tools/gui-react/src/pages/indexing/IndexingPage.tsx`

## Assertion Matrix

| Guardrail | Primary Assertion | Warn Payload Fields |
|---|---|---|
| backend boundary guard | no cross-context backend internal import without contract entrypoint | `caller_path`, `target_path`, `expected_contract`, `seam_id` (if adapter) |
| frontend boundary guard | no cross-context frontend internal import without contract entrypoint | `caller_path`, `target_path`, `expected_contract`, `seam_id` (if adapter) |
| exception registry guard | every active adapter seam has owner + expiry + replacement contract | `seam_id`, `owner`, `expiry_phase`, `replacement_contract` |
| hotspot watchlist guard | watchlist files report warning count trend and unresolved seam mappings | `path`, `warning_count`, `linked_seams` |

## Planned Test Artifacts (Finalized Scope)

- `test/architectureBoundaryBackendWarnMode.test.js`
- `test/architectureBoundaryFrontendWarnMode.test.js`
- `test/architectureBoundaryExceptionRegistry.test.js`
- `test/architectureBoundaryHotspotWatchlist.test.js`

Current status in Phase 02: specification complete, implementation deferred to Phase 03 extraction kickoff.

## Execution Policy

1. Run guardrails during CI as advisory in Phase 02.
2. Reduce warning count as migrations land in Phases 03-06.
3. Promote to blocking mode in Phase 07 once warnings are resolved or formally exempted.

## Exception Registry Source

- Adapter seam registry: `04-CONTRACT-ENTRYPOINT-INVENTORY.md` (`## Transitional Adapter Seams`)
- Rule exception schema: `06-RISK-REGISTER.md` (`## Exception Log`)

## Validation Command (Planned)

```bash
node --test test/architectureBoundaryBackendWarnMode.test.js test/architectureBoundaryFrontendWarnMode.test.js test/architectureBoundaryExceptionRegistry.test.js test/architectureBoundaryHotspotWatchlist.test.js
```

## Phase 02 Audit Evidence Run

While architecture guardrail tests remain planned artifacts, Phase 02 documentation closure validation included:

```bash
node --test test/settingsContract.test.js test/dataAuthorityRoutes.test.js
```

Result: `12/12` passing.

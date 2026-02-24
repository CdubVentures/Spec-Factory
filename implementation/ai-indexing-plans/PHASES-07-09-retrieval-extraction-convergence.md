# Phase Bundle 07-09 - Retrieval, Extraction, and Convergence

## Canonical Status
- Consolidated on 2026-02-24 from `PHASE-07`, `PHASE-08`, `PHASE-08B`, and `PHASE-09` split docs.
- This file is the canonical plan for these phases.
- Audit basis includes source inspection and focused tests.

## Audit Evidence
- Passing focused audits:
  - `node --test test/ftsRetrieval.test.js`
  - `node --test test/runtimeBridgeEventAudit.test.js`
  - `node --test test/phase01NeedSetEngine.test.js`

## Status Matrix
| Phase | Status | Audit Result |
|---|---|---|
| Phase 07 | complete | FTS retrieval wiring and prime source selection path are present and tested. |
| Phase 08 | complete | Extraction context wiring and identity gating are implemented for text evidence paths. |
| Phase 08B | partial | Screenshot queue baseline is present; quality gates, derivative pipeline, and context wiring for visual refs are still incomplete. |
| Phase 09 | complete | Convergence loop with stop conditions is implemented and tested. |

## Phase 07 - Tier Retrieval and Prime Sources
### Implemented
- Field-level tier preference routing.
- FTS-backed retrieval adapter and evidence pool conversion.
- Prime source construction and miss diagnostics.

### Remaining
- No blocking implementation gaps found in this phase during audit.

## Phase 08 - Extraction Context Wiring
### Implemented
- Context assembler with rule and identity-aware field processing.
- Structured output handling and tracing.
- Candidate gating path for identity uncertainty.

### Remaining
- Visual evidence references (`image_asset_refs`) are not yet fully wired for production ambiguity routing because 08B prerequisites are incomplete.

## Phase 08B - Visual Asset Capture Proof
### Implemented
- Playwright screenshot capture queue (`src/extract/screenshotCapture.js`).
- Visual capture event emission and basic runtime controls.

### Remaining
1. Implement target-first visual discovery and manifest generation (`src/extract/visualAssetCapture.js`).
2. Add quality gate and target-match gate before visual eligibility.
3. Wire approved `image_asset_refs` into Phase 08 extraction context when ambiguity threshold is met.
4. Add dedicated visual assets panel with quality and target badges.

## Phase 09 - Convergence Loop and Stop Conditions
### Implemented
- Explicit round orchestration with stop reasons and guards.
- Round summary exposure in API and GUI.
- Query dedupe and escalation path integration.

### Remaining
- No blocking implementation gaps found in this phase during audit.

## Remaining Work From Bundle 07-09
1. Complete Phase 08B visual pipeline and wire it into Phase 08 context consumption.

## Superseded Files
- `PHASE-07-tier-retrieval-prime-sources.md`
- `PHASE-08-extraction-context-wiring.md`
- `PHASE-08B-visual-asset-capture-proof.md`
- `PHASE-09-convergence-loop-stop-conditions.md`

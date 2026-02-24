# Critical Path - Remaining Implementation (Canonical)

## Canonical Status
- Created on 2026-02-24 after full plan audit and test-backed verification.
- This file replaces CSV backlog tracking under `implementation/ai-indexing-plans/`.
- Scope is only work that is still missing or failing now.

## Audit Basis
- Full suite baseline:
  - `npm test` -> `2726` pass, `1` fail.
  - Failing test: `test/reviewLaneContractGui.test.js` (deterministic timeout).
- Focused verification:
  - `node --test test/phase03SerpTriage.test.js`
  - `node --test test/indexingDomainChecklistApi.test.js`
  - `node --test test/indexlabAutomationQueueApi.test.js`
  - `node --test test/automationWorker.test.js`
  - `node --test test/ftsRetrieval.test.js`
  - `node --test test/learningTwoProductProof.test.js`
  - `node --test test/noDeadConfig.test.js`
  - `node --test test/runtimeBridgeEventAudit.test.js`

## Stale Backlog Items Removed
- Phase 03 deterministic triage score decomposition is already implemented and tested.
- Phase 04 domain checklist field completeness is already implemented and tested.
- Phase 11 knob governance registry and CI guardrails are implemented (`capabilities.json` + `noDeadConfig` tests).

## Critical Path Items
| ID | Priority | Item | Depends On | Done When |
|---|---|---|---|---|
| CP-0 | P0 | Fix deterministic GUI lane contract timeout (`test/reviewLaneContractGui.test.js`) | none | test passes consistently in CI and local runs. |
| CP-1 | P0 | Wire Phase 04 `repair_query_enqueued` into Phase 06B durable queue + worker execution | none | repair signal enters `AutomationQueue`, runs through `AutomationWorker`, and emits terminal state in one end-to-end test. |
| CP-2 | P1 | Implement Phase 08B visual capture pipeline (`visualAssetCapture.js`) with target-first discovery + manifest + derivatives | CP-1 optional, independent technically | capture manifest exists per run with deterministic asset ids, target metadata, and derivative records. |
| CP-3 | P1 | Add visual quality and target-match gates before any visual evidence is eligible | CP-2 | assets carry `quality_gate_passed` and `target_match_passed`; failing assets are excluded from extraction context eligibility. |
| CP-4 | P1 | Implement Parsing 08 image OCR worker pipeline consuming visual manifests | CP-2, CP-3 | image OCR emits region-level candidates with bbox/confidence and evidence refs. |
| CP-5 | P1 | Wire `image_asset_refs` into Phase 08 extraction context for ambiguous fields and add visual assets GUI panel | CP-2, CP-3, CP-4 | ambiguous fields include gated visual refs; GUI shows thumbnails, badges, and preview drill-down. |
| CP-6 | P2 | Parsing 07 OCR preprocess + fixture accuracy suite | none | preprocess stages configurable and measurable with fixture coverage proving accuracy lift or no-regression bounds. |
| CP-7 | P2 | Parsing 09 full chart extraction stack (payload -> config -> svg -> vision fallback) | none | deterministic ordered extraction path exists with fallback and coverage. |
| CP-8 | P2 | Parsing 10 mixed-office ingestion router (DOCX/XLSX/PPTX) | none | unified ingest path with parser routing, evidence normalization, and tests. |
| CP-9 | P2 | Phase 11 per-run knob usage telemetry event | none | run artifacts include emitted knob usage snapshot and regression tests. |
| CP-10 | P3 | Phase 01 NeedSet snippet timestamp lineage + GUI sort | none | NeedSet rows include snippet capture timestamp and GUI supports evidence-age sorting. |

## Execution Waves
1. Wave A (blocking): CP-0, CP-1.
2. Wave B (visual foundation): CP-2, CP-3.
3. Wave C (visual extraction): CP-4, CP-5.
4. Wave D (parallel capability gaps): CP-6, CP-7, CP-8, CP-9.
5. Wave E (polish and lineage): CP-10.

## Exit Gates
1. All CP-0 through CP-5 tests pass in CI.
2. No deterministic GUI contract failures remain.
3. New visual evidence paths are gated by quality + target checks.
4. Queue handoff from repair signal to worker completion is proven end-to-end.

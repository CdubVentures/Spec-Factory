# Phase Bundle 04-06 - Core Ingestion and Evidence

## Canonical Status
- Consolidated on 2026-02-24 from `PHASE-04`, `PHASE-05`, `PHASE-06A`, and `PHASE-06B` split docs.
- This file is the canonical plan for these phases.
- Audit basis includes targeted test execution and pipeline module review.

## Audit Evidence
- Passing focused audits:
  - `node --test test/indexingDomainChecklistApi.test.js`
  - `node --test test/indexlabAutomationQueueApi.test.js`
  - `node --test test/automationWorker.test.js`
  - `node --test test/phase05FetchScheduler.integration.test.js`

## Status Matrix
| Phase | Status | Audit Result |
|---|---|---|
| Phase 04 | partial | URL health and checklist API are working; queue handoff to durable worker loop is not fully wired end-to-end. |
| Phase 05 | complete | Bounded scheduler, host pacing, and fallback policy are implemented with test coverage. |
| Phase 06A | complete | Evidence index with FTS and dedupe outcomes is implemented and exercised. |
| Phase 06B | partial | Durable queue and worker exist; repair signal production is not yet consumed through full queue lifecycle from run pipeline. |

## Phase 04 - URL Health and Self-Healing
### Implemented
- Cooldown and host budget telemetry are emitted.
- Domain checklist API returns live fields including `host_budget_score` and `cooldown_seconds_remaining`.
- Repair query events are emitted (`repair_query_enqueued`).

### Verified as Complete (stale CSV items removed)
- Domain checklist API field population is implemented and tested.

### Remaining
- Wire `repair_query_enqueued` events into the Phase 06B durable queue and consume them with the automation worker using deterministic dedupe keys and field targets.
- Add end-to-end proof test for Phase 04 -> Phase 06B handoff.

## Phase 05 - Parallel Fetch and Parse
### Implemented
- Bounded concurrent scheduler (`HostPacer`, `FetchScheduler`, `FallbackPolicy`).
- Multi-mode fallback on fetch errors (403/timeout/5xx/network).
- Runtime events for fallback start/success/exhausted.
- GUI scheduler/fallback proof surfaces.

### Remaining
- No blocking implementation gaps found in this phase during audit.

## Phase 06A - Evidence Index Database
### Implemented
- SQLite evidence index with FTS5 retrieval.
- Stable snippet identifiers and dedupe outcomes.
- API and GUI query surfaces for evidence lookup.

### Remaining
- No blocking implementation gaps found in this phase during audit.

## Phase 06B - Refetch Scheduler and Continuous Repair
### Implemented
- `AutomationQueue` durable table/state model.
- `AutomationWorker` consume/TTL/backoff lifecycle.
- Queue inspection API and runtime ops queue diagnostics.

### Remaining
- Integrate Phase 04 repair signal emission with queue enqueue + worker execution path in production runtime flow.

## Remaining Work From Bundle 04-06
1. Implement and test full Phase 04 -> Phase 06B repair handoff.

## Superseded Files
- `PHASE-04-url-health-self-healing.md`
- `PHASE-05-parallel-fetch-parse.md`
- `PHASE-06A-evidence-index-database.md`
- `PHASE-06B-refetch-scheduler-continuous-repair.md`

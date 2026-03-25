# Monitoring and Logging

> **Purpose:** Document the verified health checks, log sinks, WebSocket telemetry channels, and observability counters used by the live runtime.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md)
> **Last validated:** 2026-03-24

## Health And Status Endpoints

| Surface | Path | What it reports | Source |
|---------|------|-----------------|--------|
| GUI/API health | `/health`, `/api/v1/health` | API process identity, dist root, cwd, pkg mode | `src/app/api/routes/infra/healthRoutes.js` |
| Process status | `/api/v1/process/status` | active child-process status, last run id, pid, exit code, relocation state | `src/app/api/routes/infra/processRoutes.js`, `src/app/api/processRuntime.js` |
| SearXNG status | `/api/v1/searxng/status` | Docker/process/http probe status for SearXNG | `src/app/api/routes/infra/searxngRoutes.js`, `src/app/api/processRuntime.js` |
| Authority snapshot | `/api/v1/data-authority/:category/snapshot` | compile/map/sync freshness plus observability counters | `src/features/category-authority/api/dataAuthorityRoutes.js` |

## Log And Event Sinks

| Sink | Path | Producer | Notes |
|------|------|----------|-------|
| Runtime NDJSON log | `_runtime/events.jsonl` under the active output root | `src/logger.js` via `EventLogger` | append-only NDJSON event stream |
| SQLite runtime telemetry | `runtime_events` table in the category SpecDb | `src/logger.js`, `src/db/specDb.js` | best-effort mirror of runtime events |
| Per-run IndexLab events | `run_events.ndjson` under each IndexLab run directory | IndexLab runtime builders/readers | replayed by `indexlabRoutes` and Runtime Ops |
| Process log broadcast | WebSocket `process` channel | `src/app/api/processRuntime.js` | child stdout/stderr lines while a process is active |
| Launcher setup logs | in-memory launcher state via `/api/install/state` | `tools/specfactory-launcher.mjs` | setup/bootstrap console only |

## WebSocket Channels

| Channel | Producer | Payload |
|---------|----------|---------|
| `process-status` | `src/app/api/processRuntime.js`, `src/app/api/realtimeBridge.js` | active child-process snapshot |
| `process` | `src/app/api/processRuntime.js` | streamed child stdout/stderr lines |
| `events` | `src/app/api/realtimeBridge.js` | appended rows from `_runtime/events.jsonl` |
| `indexlab-event` | `src/app/api/realtimeBridge.js` | appended rows from run-scoped `run_events.ndjson` |
| `data-change` | `src/core/events/dataChangeContract.js` | normalized mutation/refresh event payloads |
| `screencast` / `screencast-*` | `src/app/api/processRuntime.js` | retained or synthetic runtime screenshots for workers |

## Data-Change Event Contract

`src/core/events/dataChangeContract.js` normalizes every broadcast into:

- `type: "data-change"`
- `event`
- `category` and `categories`
- `domains`
- `version`
- `entities.productIds` and `entities.fieldKeys`
- `meta`
- `ts`

The domain map in that file is the live source of truth for event-to-domain fan-out. It also increments the broadcast counters consumed by the authority snapshot route.

## Observability Counters

| Counter group | File | What it tracks | Exposed through |
|---------------|------|----------------|-----------------|
| Data propagation | `src/observability/dataPropagationCounters.js` | `data-change` broadcasts and queue cleanup outcomes | `src/features/category-authority/api/dataAuthorityRoutes.js` |
| Settings persistence | `src/observability/settingsPersistenceCounters.js` | settings write attempts, failures, stale reads, migrations | `src/features/category-authority/api/dataAuthorityRoutes.js` |

## Alerting Reality

- No external metrics backend, pager, or alerting service was verified.
- The live observability posture is local-first:
  - inspect `/api/v1/health` and `/api/v1/process/status`,
  - inspect Runtime Ops,
  - inspect `_runtime/events.jsonl`,
  - inspect `runtime_events` and other SpecDb telemetry tables.
- Observed on 2026-03-16: `/api/v1/process/status` returned `running: false` plus the last completed run id, command, and `exitCode: 0`. Do not assume the idle shape clears those fields.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/routes/infra/healthRoutes.js` | health endpoints |
| source | `src/app/api/routes/infra/processRoutes.js` | process status endpoint |
| source | `src/app/api/processRuntime.js` | process-state broadcasts, log fan-out, SearXNG probing |
| source | `src/app/api/realtimeBridge.js` | WebSocket channels and file watchers |
| source | `src/logger.js` | NDJSON + SQLite event logging |
| source | `src/core/events/dataChangeContract.js` | normalized data-change payload shape |
| source | `src/observability/dataPropagationCounters.js` | data-change and queue cleanup counters |
| source | `src/observability/settingsPersistenceCounters.js` | settings persistence counters |
| runtime | `http://127.0.0.1:8788/api/v1/process/status` | idle process-status shape retains last-run metadata |

## Related Documents

- [Deployment](./deployment.md) - Startup and packaging paths for the monitored runtime.
- [Background Jobs](../06-references/background-jobs.md) - Long-running loops that generate many of these events.
- [Runtime Ops](../04-features/runtime-ops.md) - GUI surface that reads this telemetry.

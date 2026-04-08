# Monitoring and Logging

> **Purpose:** Document the verified health checks, telemetry sinks, WebSocket channels, and observability counters used by the live runtime.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md)
> **Last validated:** 2026-04-07

## Health And Status Endpoints

| Surface | Path | What it reports | Source |
|---------|------|-----------------|--------|
| GUI/API health | `/health`, `/api/v1/health` | API process identity, dist root, cwd, pkg mode, ffmpeg availability | `src/app/api/routes/infra/healthRoutes.js` |
| Process status | `/api/v1/process/status` | active child-process status, last run id, pid, exit code, and derived `storage_destination` | `src/app/api/routes/infra/processRoutes.js`, `src/app/api/processRuntime.js` |
| SearXNG status | `/api/v1/searxng/status` | Docker/process/http probe status for SearXNG | `src/app/api/routes/infra/searxngRoutes.js`, `src/app/api/processRuntime.js` |
| Authority snapshot | `/api/v1/data-authority/:category/snapshot` | compile/map/sync freshness plus observability counters | `src/features/category-authority/api/dataAuthorityRoutes.js` |

## Telemetry And Log Sinks

| Sink | Path | Producer | Notes |
|------|------|----------|-------|
| In-memory event stream | `EventLogger.events` | `src/logger.js` consumers such as `src/pipeline/runProduct.js` | live logger keeps an in-memory queue and optional stderr echo; no audited `_runtime/events.jsonl` file sink was verified in current source |
| Runtime event rows | SpecDb `bridge_events` | `src/indexlab/runtimeBridgeArtifacts.js` `emit()` | canonical persisted runtime-event stream when `specDb` is available |
| Run metadata | SpecDb `runs` | `src/indexlab/runtimeBridgeArtifacts.js` `writeRunMeta()` | canonical run status / identity metadata |
| Run artifacts | SpecDb `run_artifacts` | `src/indexlab/runtimeBridgeArtifacts.js` `writeNeedSet()`, `writeSearchProfile()`, `writeRunSummaryArtifact()` | canonical persisted `needset`, `search_profile`, and `run_summary` payloads |
| Telemetry indexes | SpecDb `knob_snapshots`, `query_index`, `url_index` | `src/pipeline/runProduct.js` via `bootstrapRunEventIndexing()` | summary/index surfaces used by IndexLab analytics and product history |
| Process stdout/stderr stream | WebSocket `process` | `src/app/api/processRuntime.js` | child stdout/stderr lines while a GUI-started child process is active |
| Launcher setup state | `/api/install/state` | `tools/specfactory-launcher.mjs` | separate setup/bootstrap runtime, not `src/app/api/guiServer.js` |

## WebSocket Channels

WebSocket upgrade path: `/ws`

| Channel | Producer | Payload | Notes |
|---------|----------|---------|-------|
| `process-status` | `src/app/api/processRuntime.js` | normalized child-process snapshot | pushed on lifecycle changes; also sent immediately when a client subscribes to `process-status` |
| `process` | `src/app/api/processRuntime.js` | child stdout/stderr lines | only present while a GUI-started child process is running |
| `indexlab-event` | `src/app/api/processRuntime.js` | `[{ type: 'runtime-update', run_id, stage, event }]` | lightweight invalidation/update envelopes forwarded from child IPC `__runtime_event` messages |
| `data-change` | `src/core/events/dataChangeContract.js` | normalized mutation payload | category-aware invalidation/event contract |
| `test-import-progress` | no audited live producer in current source | progress frames with `step`, `status`, and optional `detail` / `summary` | subscribed by GUI WebSocket bridge; no backend file currently broadcasts to this channel |
| `screencast-*` | `src/app/api/processRuntime.js` | retained or live screencast frame payloads keyed by worker subscription | frames are cached in `src/app/api/realtimeBridge.js` for `runtime/screencast/:workerId/last` |
| `events` | no audited live producer in current source | legacy runtime-event array shape | still filtered by `src/app/api/realtimeBridge.js` and still subscribed by GUI bridge code, but no source file currently broadcasts it outside tests |

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
| Data propagation | `src/core/events/dataPropagationCounters.js` | `data-change` broadcasts and queue cleanup outcomes | `src/features/category-authority/api/dataAuthorityRoutes.js` |
| Settings persistence | `src/core/events/settingsPersistenceCounters.js` | settings write attempts, failures, stale reads, migrations | `src/features/category-authority/api/dataAuthorityRoutes.js` |

## Alerting Reality

- No external metrics backend, pager, or alerting service was verified.
- `src/app/api/realtimeBridge.js` no longer installs filesystem watchers. `setupWatchers()` returns `null`.
- Current observability is local-first:
  - inspect `/health` and `/api/v1/process/status`,
  - inspect Runtime Ops,
  - inspect WebSocket `process-status`, `process`, `indexlab-event`, and `data-change`,
  - inspect SpecDb telemetry tables such as `bridge_events`, `runs`, `run_artifacts`, `query_index`, `url_index`, and `knob_snapshots`.
- Observed during live validation on 2026-04-04 local time (re-validated 2026-04-07):
  - `/api/v1/process/status` returned `running: false` while still retaining the last completed run metadata.
  - `/api/v1/storage/overview` returned `storage_backend: "local"`.
  - startup emitted `[auto-seed] ... field_studio_map re-seed failed ...` warnings without preventing the API from serving health and categories endpoints.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/routes/infra/healthRoutes.js` | health endpoints |
| source | `src/app/api/routes/infra/processRoutes.js` | process status endpoint |
| source | `src/app/api/routes/infra/searxngRoutes.js` | SearXNG status/start HTTP surface |
| source | `src/app/api/processRuntime.js` | process-state broadcasts, IPC runtime-update forwarding, screencast forwarding, and SearXNG integration |
| source | `src/app/api/realtimeBridge.js` | WebSocket bridge behavior, category/product filtering, screencast cache, and removed watcher setup |
| source | `src/indexlab/runtimeBridgeArtifacts.js` | SQL-first `bridge_events`, `runs`, and `run_artifacts` persistence |
| source | `src/pipeline/runProduct.js` | telemetry indexing into `knob_snapshots`, `query_index`, and `url_index` |
| source | `src/logger.js` | in-memory logger and optional stderr echo behavior |
| source | `src/core/events/dataChangeContract.js` | normalized data-change payload shape |
| source | `src/core/events/dataPropagationCounters.js` | data-change and queue cleanup counters |
| source | `src/core/events/settingsPersistenceCounters.js` | settings persistence counters |
| source | `src/app/api/routes/testModeRoutes.js` | `test-import-progress` WebSocket broadcasts during test-mode setup |
| source | `tools/specfactory-launcher.mjs` | launcher-only `/api/install/state` setup-state surface |
| source | `tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts` | GUI still subscribes to `events`, `process`, `process-status`, `data-change`, `test-import-progress`, and `indexlab-event` |
| runtime | `http://127.0.0.1:8788/api/v1/process/status` | idle process-status shape retains last-run metadata |
| runtime | `http://127.0.0.1:8788/api/v1/storage/overview` | live storage backend reports local mode |

## Related Documents

- [Deployment](./deployment.md) - Startup and packaging paths for the monitored runtime.
- [Background Jobs](../06-references/background-jobs.md) - Long-running loops and child processes that emit this telemetry.
- [Runtime Ops](../04-features/runtime-ops.md) - GUI surface that reads these streams and persisted artifacts.

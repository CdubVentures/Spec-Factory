# Background Jobs

> **Purpose:** Inventory the verified long-running loops, child-process jobs, and batch workers used by the live runtime.
> **Prerequisites:** [../05-operations/deployment.md](../05-operations/deployment.md), [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md)
> **Last validated:** 2026-03-16

## Job Inventory

| Job | Trigger | Schedule | File | Purpose |
|-----|---------|----------|------|---------|
| Import watch loop | CLI `watch-imports` | polls every `importsPollSeconds` | `src/daemon/daemon.js`, `src/cli/spec.js` | ingest incoming CSVs from the configured imports root into category-authority inputs |
| Daemon queue runner | CLI `daemon` | polls imports, stale queue state, and queue availability continuously | `src/daemon/daemon.js`, `src/cli/spec.js` | synchronize the configured imports root, claim queued products, and run them to completion |
| Drift scan inside daemon | daemon loop when enabled | every `driftPollSeconds` per category | `src/daemon/daemon.js`, `src/publish/driftScheduler.js` | detect drifted products and enqueue republishing |
| GUI process child run | `POST /api/v1/process/start` | on demand | `src/app/api/processRuntime.js`, `src/app/api/routes/infra/processRoutes.js` | spawn `src/cli/spec.js` commands such as IndexLab or compile-rules |
| Component review batch | `POST /api/v1/review-components/:category/run-component-review-batch` | on demand | `src/pipeline/componentReviewBatch.js`, `src/features/review/api/reviewRoutes.js` | run queued component-review decisions |
| Test-mode run | `POST /api/v1/test-mode/run` | on demand | `src/app/api/routes/testModeRoutes.js` | execute synthetic product runs and optional AI review |
| Intel Graph API server | CLI `intel-graph-api` | long-running local process | `src/api/intelGraphApi.js`, `src/cli/spec.js` | local GraphQL helper API on port `8787` |

## Scheduling Reality

- No external queue broker, cron service, or job orchestrator was verified.
- Every background activity is one of:
  - a polling loop inside the local CLI daemon,
  - an on-demand child process spawned from the GUI API,
  - a batch worker called directly from an API route,
  - a standalone local helper server started from the CLI.

## Inputs, Outputs, And State

| Job family | Reads | Writes |
|------------|-------|--------|
| Import watch / daemon | configured imports root (`config.importsRoot`, default `imports/`), category config, queue state, authority files | category-authority outputs, queue state, runtime events |
| GUI child process | HTTP request body + live config | child stdout/stderr broadcasts, runtime artifacts, process status |
| Review/component batches | SpecDb, authority artifacts, review queues | SpecDb review tables, suggestions, component review outputs |
| Test mode | `_test_*` authority categories, fixture inputs | synthetic fixtures, outputs, suggestions, optional SpecDb sync |

## Worker Boundaries

- `src/daemon/daemon.js` is the only verified recurring scheduler.
- `src/app/api/processRuntime.js` is the only verified GUI-side child-process manager.
- `src/pipeline/componentReviewBatch.js` is a batch processor, not a general-purpose worker framework.
- The default imports root is still `imports/` via `src/shared/settingsDefaults.js` and `src/config.js`, but that directory is created or supplied by operators as needed and is not currently checked into the repo root.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/daemon/daemon.js` | import watcher, daemon loop, drift scan, queue runner |
| source | `src/cli/spec.js` | CLI command entrypoints for `watch-imports`, `daemon`, and `intel-graph-api` |
| source | `src/app/api/processRuntime.js` | GUI child-process lifecycle manager |
| source | `src/app/api/routes/infra/processRoutes.js` | process start/stop/status HTTP endpoints |
| source | `src/features/review/api/reviewRoutes.js` | component review batch trigger |
| source | `src/app/api/routes/testModeRoutes.js` | test-mode run lifecycle |
| source | `src/api/intelGraphApi.js` | local GraphQL helper server |

## Related Documents

- [Deployment](../05-operations/deployment.md) - Shows how these jobs are started.
- [API Surface](./api-surface.md) - Lists the HTTP endpoints that trigger on-demand jobs.
- [Monitoring and Logging](../05-operations/monitoring-and-logging.md) - Shows where job telemetry is emitted.

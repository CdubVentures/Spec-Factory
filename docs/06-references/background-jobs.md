# Background Jobs

> **Purpose:** Inventory the verified long-running loops, child-process jobs, and batch workers used by the live runtime.
> **Prerequisites:** [../05-operations/deployment.md](../05-operations/deployment.md), [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md)
> **Last validated:** 2026-04-10

## Job Inventory

| Job | Trigger | Schedule | File | Purpose |
|-----|---------|----------|------|---------|
| GUI IndexLab child run | `POST /api/v1/process/start` | on demand | `src/app/api/routes/infra/processRoutes.js`, `src/features/indexing/api/builders/processStartLaunchPlan.js`, `src/app/api/processRuntime.js` | starts `node src/app/cli/spec.js indexlab ...` for the selected category / product |
| Studio compile-rules child run | `POST /api/v1/studio/:category/compile` | on demand | `src/features/studio/api/studioRoutes.js`, `src/app/api/processRuntime.js`, `src/app/api/services/compileProcessCompletion.js` | runs `compile-rules`, then invalidates caches, re-syncs field-studio-map SQL, syncs SpecDb, and emits `process-completed` |
| Studio validate-rules child run | `POST /api/v1/studio/:category/validate-rules` | on demand | `src/features/studio/api/studioRoutes.js`, `src/app/api/processRuntime.js` | runs `validate-rules` for one category |
| Test-mode field contract audit | `POST /api/v1/test-mode/validate` | on demand | `src/app/api/routes/testModeRoutes.js`, `src/tests/fieldContractTestRunner.js` | runs field contract test suite against compiled rules + discovered enums, persists results to `field_audit_cache` in SpecDb |
| SearXNG local sidecar | `POST /api/v1/searxng/start` or manual Docker Compose start | long-running until stopped | `src/app/api/routes/infra/searxngRoutes.js`, `src/app/api/processRuntime.js`, `tools/searxng/docker-compose.yml` | optional local search sidecar used by search workflows |

## Scheduling Reality

- No external queue broker, cron service, or hosted job orchestrator was verified.
- Every background activity is one of:
  - an on-demand child process spawned from the GUI API,
  - a batch worker called directly from an API route,
  - a CLI command launched by an operator,
  - a local sidecar process started on demand.

## Execution Boundaries

| Job family | Reads | Writes |
|------------|-------|--------|
| GUI IndexLab child run | request body -> runtime settings snapshot, generated field rules, category authority, SpecDb | child stdout/stderr WS, `process-status`, `indexlab-event`, runtime artifacts, SpecDb telemetry |
| Studio compile / validate | category authority inputs, compiled rules, SpecDb | process status, cache invalidation, optional SpecDb sync, `data-change` `process-completed` on successful compile |
| Test-mode field contract audit | compiled field rules, known values, component DBs, discovered enums from SpecDb | `field_audit_cache` row in SpecDb |

## Constraints

- `src/app/api/processRuntime.js` is the only verified GUI-side child-process manager.
- `POST /api/v1/process/start` only supports `mode === 'indexlab'`; it is not a generic arbitrary-command launcher.
- The compile endpoints do not use `/api/v1/process/start`; they call `startProcess()` directly from `src/features/studio/api/studioRoutes.js`.
- No time-based schedule was verified for any job in this repo.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/processRuntime.js` | GUI child-process lifecycle manager, WS broadcasts, and sidecar integration |
| source | `src/app/api/routes/infra/processRoutes.js` | process start/stop/status HTTP endpoints |
| source | `src/features/indexing/api/builders/processStartLaunchPlan.js` | GUI `/process/start` supports IndexLab only and writes runtime snapshot env |
| source | `src/features/studio/api/studioRoutes.js` | compile-rules and validate-rules process triggers |
| source | `src/app/api/services/compileProcessCompletion.js` | compile completion invalidation and SpecDb sync side effects |
| source | `src/app/api/routes/testModeRoutes.js` | test-mode field contract audit endpoints |
| source | `src/app/api/routes/testModeRouteContext.js` | test-mode route context wiring |
| source | `src/tests/fieldContractTestRunner.js` | field contract test runner used by the validate endpoint |
| source | `src/app/cli/spec.js` | CLI command entrypoints (batch and intel-graph-api commands removed) |
| source | `src/app/api/routes/infra/searxngRoutes.js` | SearXNG start/status route surface |
| config | `tools/searxng/docker-compose.yml` | local SearXNG sidecar definition |

## Related Documents

- [Deployment](../05-operations/deployment.md) - Shows how these jobs are started.
- [API Surface](./api-surface.md) - Lists the HTTP endpoints that trigger on-demand jobs.
- [Monitoring and Logging](../05-operations/monitoring-and-logging.md) - Shows where job telemetry is emitted.

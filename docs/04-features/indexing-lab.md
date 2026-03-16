# Indexing Lab

> **Purpose:** Trace the verified end-to-end indexing run flow from GUI launch through process orchestration, artifact generation, and run replay APIs.
> **Prerequisites:** [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md), [../03-architecture/routing-and-gui.md](../03-architecture/routing-and-gui.md)
> **Last validated:** 2026-03-15

## Entry Points

| Surface | Path | Role |
|--------|------|------|
| Indexing page | `tools/gui-react/src/features/indexing/components/IndexingPage.tsx` | run creation, run selection, and artifact replay |
| Process launcher | `src/app/api/routes/infra/processRoutes.js` | `/api/v1/process/start|stop|status` |
| Process runtime | `src/app/api/processRuntime.js` | spawns CLI runs and tracks active process state |
| CLI entrypoint | `src/cli/spec.js` | executes `indexlab`, `run-one`, `run-batch`, compile, and daemon flows |
| Replay API | `src/features/indexing/api/indexlabRoutes.js` | serves run meta, needset, search profile, extraction, analytics, and live-crawl reference surfaces |

## Dependencies

- `src/features/indexing/orchestration/index.js`
- `src/indexlab/needsetEngine.js`
- `src/runner/runUntilComplete.js`
- `src/logger.js`
- `src/db/specDb.js`
- `src/app/api/realtimeBridge.js`
- local IndexLab root from `src/core/config/runtimeArtifactRoots.js`

## Flow

1. The user fills the run form in `tools/gui-react/src/features/indexing/components/IndexingPage.tsx`.
2. The page posts a launch request to `/api/v1/process/start`.
3. `src/app/api/routes/infra/processRoutes.js` builds a launch plan with `buildProcessStartLaunchPlan()` and rejects invalid or incomplete inputs.
4. `src/app/api/processRuntime.js` spawns `node src/cli/spec.js ...` with the computed CLI args and env overrides.
5. The CLI run writes runtime events, IndexLab run files, output artifacts, and SpecDb changes while `src/app/api/realtimeBridge.js` streams `process` and `indexlab-event` updates to the GUI.
6. The GUI replays run artifacts through `/api/v1/indexlab/run/:runId/*` endpoints in `src/features/indexing/api/indexlabRoutes.js`.
7. On process exit, `src/api/services/indexLabProcessCompletion.js` finalizes run-data relocation/archive behavior.

## Side Effects

- Writes IndexLab run folders under the configured IndexLab root.
- Writes output artifacts under the configured output root or mirrored storage destination.
- Appends runtime telemetry through `EventLogger` to NDJSON and/or `runtime_events` SQLite rows.
- May update queue, billing, learning, evidence, and source-intel tables during a run.

## Error Paths

- Missing generated field rules: `409 missing_generated_field_rules` before launch.
- Existing active process with no replacement allowed: `409 process_already_running`.
- Missing run artifacts on replay: `404 run_not_found` or feature-specific `*_not_found` errors.
- If a child process exits with an error event, run meta is normalized to `failed` when replayed.

## State Transitions

| State | Trigger | Result |
|-------|---------|--------|
| no active run | initial idle state | `/process/status` reports `running=false` |
| launching | `/process/start` accepted | process runtime holds pid + run_id |
| running | child CLI active | websocket channels stream logs and events |
| completed/failed | child exits | run meta and relocation handlers finalize artifacts |

## Diagram

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '20px', 'actorWidth': 250, 'actorMargin': 200, 'boxMargin': 20 }}}%%
sequenceDiagram
  autonumber
  box Client
    participant IndexingPage as IndexingPage<br/>(tools/gui-react/src/features/indexing/components/IndexingPage.tsx)
  end
  box Server
    participant ProcessRoute as processRoutes<br/>(src/app/api/routes/infra/processRoutes.js)
    participant Runtime as processRuntime<br/>(src/app/api/processRuntime.js)
    participant Replay as indexlabRoutes<br/>(src/features/indexing/api/indexlabRoutes.js)
  end
  box Worker
    participant CLI as spec.js<br/>(src/cli/spec.js)
  end
  IndexingPage->>ProcessRoute: POST /api/v1/process/start
  ProcessRoute->>Runtime: startProcess('src/cli/spec.js', cliArgs)
  Runtime->>CLI: spawn child process
  CLI-->>Runtime: stdout/stderr + IPC screencast events
  Runtime-->>IndexingPage: WebSocket process/indexlab-event updates
  IndexingPage->>Replay: GET /api/v1/indexlab/run/:runId/*
  Replay-->>IndexingPage: run artifacts and analytics
```

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/routes/infra/processRoutes.js` | launch/stop/status endpoints |
| source | `src/app/api/processRuntime.js` | child process lifecycle |
| source | `src/features/indexing/api/indexlabRoutes.js` | replay/read endpoints |
| source | `src/cli/spec.js` | CLI command ownership |
| source | `tools/gui-react/src/features/indexing/components/IndexingPage.tsx` | GUI run control surface |

## Related Documents

- [Runtime Ops](./runtime-ops.md) - Runtime Ops reads the same run event/artifact surfaces with a worker-centric lens.
- [Storage and Run Data](./storage-and-run-data.md) - Completed run output may be relocated or mirrored after exit.

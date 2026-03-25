## Purpose

HTTP server composition root: bootstraps the DI context, wires feature route handlers, and serves the API + static GUI assets over a single `http.createServer()` instance.

## Public API (The Contract)

- `serverBootstrap.js` → `bootstrapServer({ projectRoot })` — returns grouped DI context (env, storage, session, realtime, process, http, helpers, domain). `BOOTSTRAP_RETURN_GROUPS` documents the shape contract.
- `bootstrap/` — phase modules: environment → session → domain runtimes (see `bootstrap/README.md`)
- `guiServer.js` — HTTP server entry point; not imported by other modules (top-level script)
- `guiServerHttpAssembly.js` → `createGuiServerHttpAssembly(...)` — assembles route pipeline
- `guiServerRuntimeConfig.js` → `resolveProjectPath`, `envToken`, `envBool`, `resolveStorageBackedWorkspaceRoots`, `resolveRunDataDestinationType`, `createRunDataArchiveStorage`
- `helpers/httpPrimitives.js` → `jsonRes`, `corsHeaders`, `readJsonBody`, `safeJoin`
- `helpers/valueNormalizers.js` → `toInt`, `toFloat`, `toUnitRatio`, `hasKnownValue`, `normalizePathToken`
- `helpers/fileHelpers.js` → `safeReadJson`, `safeStat`, `listDirs`, `listFiles`, `readJsonlEvents`, `parseNdjson`
- `reviewCandidateRuntime.js` → `createReviewCandidateRuntime`
- `reviewGridStateRuntime.js` → `createReviewGridStateRuntime`
- Event infrastructure moved to `src/core/events/dataChangeContract.js`
- Review mutation routes moved to `src/features/review/api/` (itemMutationRoutes, componentMutationRoutes, enumMutationRoutes, routeSharedHelpers, mutationResolvers)

## Dependencies (Allowed Imports)

- Node builtins (`http`, `fs`, `path`, `child_process`, `url`)
- `src/config.js` (config loading at bootstrap)
- `src/core/config/*` (manifest, artifact roots)
- `src/shared/settingsDefaults.js` (SSOT for defaults)
- `src/db/specDb.js` (database — instantiated in bootstrap, passed via DI)
- `src/features/*/api/*` (route registrars + context factories — all 12 features)
- `src/app/api/*` (request dispatch, route registry, pipeline, static server)
- `src/s3/storage.js`, `src/categories/loader.js`, `src/queue/queueState.js`
- `src/features/catalog/index.js`, `src/features/settings-authority/index.js`
- `src/utils/candidateIdentifier.js` (to be moved to shared in Phase 4)

**Forbidden:** Direct imports from `src/features/*/` internal paths (non-API, non-index).

## Mutation Boundaries

- `bootstrapServer()` creates: HTTP server, WebSocket, file watchers, child processes, SpecDb instances
- Route handlers write to: SpecDb (SQLite), filesystem (review artifacts, run data), S3 (if configured)
- `broadcastWs()` pushes events to all connected WebSocket clients
- `startProcess()` / `stopProcess()` manage CLI child processes

## Domain Invariants

- `bootstrapServer()` is called exactly once at server startup.
- Route handlers receive all dependencies via context objects — no global imports of DB or storage.
- CORS is fully open (`*`) — this is a local-only tool, not a public API.
- First-match routing: handlers return `false` to skip, truthy to handle.
- Request body limit: 2 MB default via `readJsonBody()`.

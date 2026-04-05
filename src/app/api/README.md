## Purpose

Unified HTTP server boundary: bootstraps the DI context, wires feature route handlers, dispatches requests, and serves the API + static GUI assets over a single `http.createServer()` instance.

## Public API (The Contract)

- `guiServer.js` -- HTTP server entry point (top-level script, not imported by other modules)
- `guiServerRuntime.js` -- `createGuiServerRuntime()` -- composition root: bootstrap -> route context assembly -> HTTP assembly
- `serverBootstrap.js` -- `bootstrapServer({ projectRoot })` -- returns grouped DI context (`BOOTSTRAP_RETURN_GROUPS` documents the shape)
- `guiServerHttpAssembly.js` -- `createGuiServerHttpAssembly(...)` -- assembles route pipeline
- `guiServerRuntimeConfig.js` -- `resolveProjectPath`, `envToken`, `envBool`, `normalizeRuntimeArtifactWorkspaceDefaults`
- `httpPrimitives.js` -- `jsonRes`, `corsHeaders`, `readJsonBody`
- `requestDispatch.js` -- `createApiPathParser`, `createApiRouteDispatcher`, `createApiHttpRequestHandler`
- `routeRegistry.js` -- `GUI_API_ROUTE_ORDER`, `createGuiApiRouteRegistry`
- `guiRouteRegistration.js` -- `createRegisteredGuiApiRouteHandlers`
- `guiApiPipeline.js` -- `createGuiApiPipeline`
- `infraRouteContext.js` -- `createInfraRouteContext`
- `staticFileServer.js` -- `createGuiStaticFileServer`
- `processRuntime.js` -- `createProcessRuntime` (child process manager)
- `realtimeBridge.js` -- `createRealtimeBridge` (WebSocket)
- `specDbRuntime.js` -- `createSpecDbRuntime` (lazy SpecDb cache)
- `categoryAlias.js` -- `createCategoryAliasResolver`, `normalizeCategoryToken`
- `catalogHelpers.js` -- `createCatalogBuilder`, `createCompiledComponentDbPatcher`
- `intelGraphApi.js` -- `startIntelGraphApi()` (standalone GraphQL server)
- `bootstrap/` -- phase modules (environment -> session -> domain runtimes)
- `services/` -- process-lifecycle hooks (compile completion, IndexLab completion, SpecDb sync)

## Dependencies

- Node builtins (`http`, `fs`, `path`, `child_process`, `url`)
- `src/config.js`, `src/core/*` (config, storage, llm, events, native module guard)
- `src/shared/*` (settings defaults, file helpers, value normalizers, storage key prefixes)
- `src/db/*` (SpecDb, AppDb, seeding)
- `src/features/*/api/*` (route registrars + context factories)
- `src/features/*/index.js` (public APIs)
- `src/categories/loader.js`, `src/field-rules/*`

**Forbidden:** Direct imports from `src/features/*/` internal paths (non-API, non-index).

## Domain Invariants

- `bootstrapServer()` is called exactly once at server startup.
- Route handlers receive all dependencies via context objects -- no global imports of DB or storage.
- CORS is fully open (`*`) -- this is a local-only tool, not a public API.
- First-match routing: handlers return `false` to skip, truthy to handle.
- Request body limit: 2 MB default via `readJsonBody()`.
- The mounted route order is the `routeDefinitions` array in `guiServerRuntime.js`.

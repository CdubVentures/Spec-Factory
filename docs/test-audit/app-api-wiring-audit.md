# App API Wiring Audit

## Scope

- `src/app/api/tests/guiStaticFileServerWiring.test.js`
- `src/app/api/tests/guiServerRouteRegistryWiring.test.js`
- `src/app/api/tests/apiSpecDbRuntimeWiring.test.js`
- `src/app/api/tests/apiRealtimeBridgeWiring.test.js`
- `src/app/api/tests/apiProcessRuntimeWiring.test.js`
- `src/app/api/tests/apiCategoryAliasWiring.test.js`
- `src/app/api/tests/apiCatalogHelpersWiring.test.js`

## File Audit

| Test file | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `src/app/api/tests/guiStaticFileServerWiring.test.js` | COLLAPSE | Previous coverage asserted stream plumbing and file-path internals instead of the response contract. | Rewritten to stream real files from a temp dist root and assert response body, mime type, cache headers, SPA fallback, and 404 behavior. | Targeted app API cluster green on 2026-03-24. | Kept as a smaller response-level contract test file. |
| `src/app/api/tests/guiServerRouteRegistryWiring.test.js` | COLLAPSE | Exact `GUI_API_ROUTE_ORDER` and named context coupling pinned internal assembly details already covered elsewhere. | Retired the canonical-order/context-name assertions; kept parser, dispatcher, HTTP handler, and generic registry-order/validation contracts. | Targeted app API cluster green on 2026-03-24. | Kept with the internal-only assertions removed. |
| `src/app/api/tests/apiSpecDbRuntimeWiring.test.js` | KEEP | `getSpecDb` / `getSpecDbReady` protect public runtime behavior: seeded-handle reuse and readiness after alias resolution. | Rewritten to assert readiness behavior directly instead of helper call counts. | Targeted app API cluster green on 2026-03-24. | Kept as contract coverage. |
| `src/app/api/tests/apiRealtimeBridgeWiring.test.js` | KEEP | Websocket filtering, watcher fanout, and screencast frame caching are runtime-visible behavior. | Consolidated around shared builders and behavior-level websocket assertions. | Targeted app API cluster green; live websocket validation green on 2026-03-24. | Kept as contract coverage. |
| `src/app/api/tests/apiProcessRuntimeWiring.test.js` | COLLAPSE | Several cases pinned spawn options, signal sequences, and orphan-scan mechanics already protected by narrower route/process helper tests. | Retired cwd/windowsHide/signal/orphan-command assertions; kept start/status, stop result, screencast IPC, relocation roots, and force-stop result contracts. | Targeted app API cluster green; surrounding process/route proof green; live child-process validation green on 2026-03-24. | Kept with the internal-only assertions removed. |
| `src/app/api/tests/apiCategoryAliasWiring.test.js` | KEEP | Category alias normalization is a direct routing/config contract with minimal brittleness. | No replacement required. | Targeted app API cluster green on 2026-03-24. | Kept unchanged. |
| `src/app/api/tests/apiCatalogHelpersWiring.test.js` | KEEP | Catalog row enrichment and compiled component-db patching protect user-visible output contracts. | Centralized repeated fixture payloads with shared builders. | Targeted app API cluster green on 2026-03-24. | Kept as contract coverage with shared factories. |

## Shared Builders Added

- `src/app/api/tests/helpers/appApiTestBuilders.js`

Centralized builders added for:

- response capture
- websocket/runtime harness payloads
- fake child processes
- catalog input/summary/component payloads

## Proof Stack

### Targeted proof

- `node --test src/app/api/tests/guiStaticFileServerWiring.test.js src/app/api/tests/guiServerRouteRegistryWiring.test.js src/app/api/tests/apiSpecDbRuntimeWiring.test.js src/app/api/tests/apiRealtimeBridgeWiring.test.js src/app/api/tests/apiProcessRuntimeWiring.test.js src/app/api/tests/apiCategoryAliasWiring.test.js src/app/api/tests/apiCatalogHelpersWiring.test.js`
- Result: green, 25/25 passing.

### Surrounding proof

- `node --test src/app/api/tests/commandCapture.test.js src/app/api/tests/processOrphanOps.test.js src/app/api/tests/processLifecycleState.test.js src/app/api/tests/searxngRuntime.test.js src/api/tests/guiServerHttpAssembly.test.js src/app/api/routes/tests/infraRoutesContract.test.js src/app/api/routes/tests/processStartRunIdContract.test.js`
- Result: green, 80/80 passing.

### Live validation

- Real websocket validation with `createRealtimeBridge.attachWebSocketUpgrade(...)` plus an actual `ws` client.
- Real child-process validation with `createProcessRuntime.startProcess(...)`, `forwardScreencastControl(...)`, and `stopProcess(...)`.
- Result: `LIVE_VALIDATION_OK`.

### Full suite

- `npm test`
- Result: green, 7092/7092 passing on 2026-03-24.

## Final Proof State

- Targeted tests: green
- Surrounding integration proof: green
- Full suite: green
- Live validation: green

This audit pass is **complete**.

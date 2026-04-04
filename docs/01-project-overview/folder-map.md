# Folder Map

> **Purpose:** Provide an annotated repo tree so an arriving LLM knows where to look before scanning the entire codebase.
> **Prerequisites:** [scope.md](./scope.md)
> **Last validated:** 2026-03-31

## Root Tree

```text
.
|- .claude/                    # local assistant tooling/config
|- .git/                       # git metadata
|- .server-state/              # local runtime state files
|- .workspace/                 # default runtime workspace: db, runs, output, products, global settings
|- category_authority/         # authored category control-plane content and generated authority artifacts
|- data/                       # checked-in support data
|- debug/                      # manual debug captures and screenshots
|- docs/                       # maintained docs tree; implementation/data-structure are excluded from this pass
|- e2e/                        # Playwright E2E tests
|- fixtures/                   # checked-in fixture inputs for tests and helper flows
|- gui-dist/                   # packaged GUI asset copy produced by desktop build flows
|- node_modules/               # installed dependencies; never edit
|- scripts/                    # repo utility scripts
|- src/                        # backend runtime, CLI, persistence, features, and shared infra
|- test/                       # top-level Node test root
|- tools/                      # GUI package, packaging, sidecars, launcher, and utilities
|- .env.example                # partial env bootstrap template
|- AGENTS.md                   # repo-wide operating rules
|- AGENTS.testing.md           # testing-focused rules
|- AGENTS.testsCleanUp.md      # test-cleanup rules
|- CLAUDE.md                   # additional local repo guidance
|- Dockerfile                  # stale container path; not the verified runtime entrypoint
|- README.md                   # repo-root pointer to the maintained docs tree
|- package.json                # root scripts and backend dependencies
|- package-lock.json           # exact resolved backend dependency versions
`- playwright.config.ts        # Playwright config for e2e/
```

## Top-Level Directories

| Path | Purpose | Key files / notes |
|------|---------|-------------------|
| `.workspace/` | default runtime workspace root | `src/core/config/runtimeArtifactRoots.js` resolves `.workspace/output`, `.workspace/runs`, `.workspace/products`, `.workspace/db`, `.workspace/global`, and `.workspace/runtime/snapshots` as the live defaults |
| `category_authority/` | canonical control-plane content | live directories on disk include `keyboard/`, `monitor/`, `mouse/`, `_global/`, `_test_mouse/`, and `tests/`; the default categories API returns only `keyboard`, `monitor`, and `mouse` |
| `data/` | checked-in support data | currently includes learning/support payloads consumed by runtime helpers |
| `debug/` | ad hoc debug captures | not a canonical runtime or config source |
| `docs/` | maintained documentation tree | `docs/README.md` is the entrypoint; `docs/implementation/` and `docs/data-structure/` are excluded from this pass |
| `e2e/` | browser E2E tests | governed by `playwright.config.ts` |
| `fixtures/` | checked-in fixtures | used by tests and local validation helpers |
| `gui-dist/` | packaged GUI copy | refreshed by desktop packaging flows, not the source GUI |
| `scripts/` | repo utility scripts | one-off helpers outside the main runtime entrypoints |
| `src/` | live product code | server runtime, CLI, persistence, features, and shared infrastructure |
| `test/` | top-level Node test root | suite also includes `src/**/tests/` and `tools/gui-react/**/__tests__/` |
| `tools/` | GUI app, packaging, launcher, sidecars, and utilities | `gui-react/`, `searxng/`, `build-exe.mjs`, `specfactory-launcher.mjs`, `check-env-example-sync.mjs` |

## High-Signal `src/` Subtrees

| Path | Purpose | Key files |
|------|---------|-----------|
| `src/api/` | thin runtime assembly, bootstrap, and server wiring | `guiServer.js`, `guiServerRuntime.js`, `guiServerHttpAssembly.js` |
| `src/api/bootstrap/` | bootstrap phases for config, storage, DB, realtime, and process runtime | `createBootstrapEnvironment.js`, `createBootstrapSessionLayer.js`, `createBootstrapRealtimeLayer.js`, `createBootstrapProcessLayer.js` |
| `src/app/api/` | request dispatch, route registration, realtime bridge, and process lifecycle | `requestDispatch.js`, `routeRegistry.js`, `guiRouteRegistration.js`, `realtimeBridge.js`, `processRuntime.js` |
| `src/cli/` | operator CLI entrypoint | `spec.js` |
| `src/core/` | config manifest, runtime roots, LLM routing, and event contracts | `config/manifest/index.js`, `config/runtimeArtifactRoots.js`, `events/dataChangeContract.js`, `llm/` |
| `src/db/` | SQLite boundaries | `appDb.js`, `appDbSchema.js`, `specDb.js`, `specDbSchema.js`, `stores/` |
| `src/features/` | feature-first backend boundaries | `catalog/`, `crawl/`, `indexing/`, `review/`, `settings/`, `settings-authority/`, `studio/`, `category-authority/` |
| `src/indexlab/` | run-artifact readers and runtime bridge helpers | `runtimeBridgeEventHandlers.js`, `runtimeBridgePayloads.js` |
| `src/observability/` | local counters and telemetry helpers | `dataPropagationCounters.js`, `settingsPersistenceCounters.js` |
| `src/pipeline/` | crawl-first run orchestration and seams | `runProduct.js`, `seams/` |
| `src/shared/` | shared registry/defaults/accessors and generic helpers | `settingsRegistry.js` exports `143` live entries: `136` runtime, `3` bootstrap env, `4` UI |
| `src/core/storage/` | local filesystem storage adapter | `storage.js` provides key-based artifact I/O over the local filesystem |

## High-Signal `tools/` Subtrees

| Path | Purpose | Key files |
|------|---------|-----------|
| `tools/gui-react/` | React/Vite/TypeScript operator GUI | `package.json`, `vite.config.ts`, `src/App.tsx`, `src/registries/pageRegistry.ts` |
| `tools/gui-react/src/features/` | stateful GUI feature implementations | catalog, indexing, runtime-ops, review, studio, pipeline-settings, llm-config, storage-manager |
| `tools/gui-react/src/pages/` | route shells and page-local implementations | `layout/AppShell.tsx`, `storage/StoragePage.tsx`, `test-mode/TestModePage.tsx` |
| `tools/launchers/` | launcher-related assets and helpers | consumed by packaging/setup flows |
| `tools/searxng/` | optional local SearXNG sidecar | `docker-compose.yml` |
| `tools/structured-metadata-sidecar/` | sidecar package for structured-metadata helpers | separate utility boundary from the GUI server |
| `tools/build-exe.mjs` | packaged desktop build pipeline | rebuilds GUI and emits `SpecFactory.exe` |
| `tools/build-setup-exe.mjs` | packaged launcher build pipeline | emits `Launcher.exe` |
| `tools/specfactory-launcher.mjs` | setup/bootstrap helper runtime | separate helper server from `src/api/guiServer.js` |
| `tools/check-env-example-sync.mjs` | env-template drift checker | powers `npm run env:check` |

## Runtime-Created Or Default Paths

| Path / concept | Source of truth | Notes |
|----------------|-----------------|-------|
| global AppDb | `src/api/bootstrap/createBootstrapSessionLayer.js` | default path `.workspace/db/app.sqlite` |
| per-category SpecDb | `src/app/api/specDbRuntime.js`, `src/shared/settingsRegistry.js` | default path `.workspace/db/<category>/spec.sqlite` |
| local output root | `src/core/config/runtimeArtifactRoots.js` | default path `.workspace/output` |
| local IndexLab root | `src/core/config/runtimeArtifactRoots.js` | default path `.workspace/runs` |
| product rebuild files | `src/features/catalog/products/writeProductIdentity.js` | default path `.workspace/products/{productId}/product.json` |
| built GUI assets | `tools/gui-react/dist/` | produced by `npm run gui:build`, served by `src/api/guiServer.js` |

## Documentation Layout

| Path | Purpose | Notes |
|------|---------|-------|
| `docs/README.md` | master entrypoint | first file for new agents |
| `docs/01-project-overview/` -> `docs/07-patterns/` | current-state docs hierarchy | maintained authority set for this pass |
| `docs/05-operations/documentation-audit-ledger.md` | audit record | file-by-file disposition record for this refresh |
| `docs/implementation/` | excluded subtree | off-limits for this pass |
| `docs/data-structure/` | excluded subtree | off-limits for this pass |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServerRuntime.js` | runtime assembly, route context ownership, and metadata roots |
| source | `src/api/bootstrap/createBootstrapSessionLayer.js` | `app.sqlite` location and eager AppDb bootstrap |
| source | `src/core/config/runtimeArtifactRoots.js` | default `.workspace/output` and `.workspace/runs` roots |
| source | `src/shared/settingsRegistry.js` | exported registry counts |
| source | `src/app/api/routes/infra/categoryRoutes.js` | default categories API excludes harness and underscored directories |
| source | `src/features/catalog/products/writeProductIdentity.js` | `.workspace/products/{productId}/product.json` rebuild path |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route ownership |
| config | `package.json` | root tooling and top-level files |
| config | `playwright.config.ts` | E2E ownership |

## Related Documents

- [Conventions](./conventions.md) - Explains how these folders are expected to be used and extended.
- [System Map](../03-architecture/system-map.md) - Maps the folders onto runtime relationships.
- [Feature Index](../04-features/feature-index.md) - Maps folder ownership to feature docs.

# Folder Map

> **Purpose:** Give the LLM an implementation-backed repo tree before it starts scanning files.
> **Prerequisites:** [scope.md](./scope.md)
> **Last validated:** 2026-04-10

## Root Tree

```text
.
|- .claude/                    # local Claude/Codex helper config
|- .git/                       # git metadata
|- .server-state/              # local server state files
|- .tmp/                       # repo-local scratch root for throwaway tool/test artifacts
|- .workspace/                 # runtime data root: db, runs, output, products, global settings, snapshots
|- category_authority/         # authored category control-plane content
|- debug/                      # ad hoc debug captures
|- docs/                       # maintained current-state docs and retained audit artifacts
|- e2e/                        # Playwright browser tests
|- gui-dist/                   # copied GUI assets for packaging flows
|- node_modules/               # installed root dependencies
|- scripts/                    # repo utility scripts
|- src/                        # backend runtime, CLI, DB, features, shared infra
|- tools/                      # GUI package, launchers, sidecars, packaging, utilities
|- .env                        # observed local dotenv file
|- AGENTS.md                   # repo-wide operating rules
|- AGENTS.testing.md           # testing rules
|- AGENTS.testsCleanUp.md      # test-cleanup rules
|- CLAUDE.md                   # root LLM truth file
|- Dockerfile                  # CLI-oriented batch container definition
|- README.md                   # repo-root documentation entrypoint
|- package-lock.json           # exact resolved root dependencies
|- package.json                # root scripts + backend deps
|- playwright.config.ts        # Playwright config for `e2e/`
|- SpecFactory.bat             # Windows launcher wrapper
`- SpecFactory.exe             # generated desktop artifact when packaging runs
```

## Top-Level Boundaries

| Path | Purpose | Notes |
|------|---------|-------|
| `.workspace/` | runtime-created data root | default roots come from `src/core/config/runtimeArtifactRoots.js` |
| `.tmp/` | repo-local scratch root | throwaway tool/test artifacts only; not canonical runtime state |
| `category_authority/` | authored control-plane data | categories on disk include `_global/`, `_test_keyboard/`, `_tests/`, `keyboard/`, `monitor/`, `mouse/` |
| `docs/` | maintained current-state docs | start at `docs/README.md`; excluded locked trees are not part of the numbered reading order |
| `e2e/` | browser-level tests | controlled by `playwright.config.ts` |
| `src/` | live backend + CLI code | main entrypoints are under `src/app/api/` and `src/app/cli/` |
| `tools/` | GUI app and operational tooling | contains the only frontend package in `tools/gui-react/` |

## `src/` Tree (15 top-level subdirectories)

| Path | Purpose | Key files |
|------|---------|-----------|
| `src/app/api/` | server runtime, bootstrap, dispatch, realtime, and route registration | `guiServer.js`, `guiServerRuntime.js`, `serverBootstrap.js`, `guiServerHttpAssembly.js`, `requestDispatch.js`, `routeRegistry.js`, `routes/` |
| `src/app/cli/` | CLI entrypoint and command factories | `spec.js`, `args.js`, `commands/` |
| `src/billing/` | cost tracking and model pricing | `costLedger.js`, `modelPricingCatalog.js` |
| `src/build/` | build-time type generation tooling | `generate-types.js` |
| `src/categories/` | category loader and tests | `loader.js` |
| `src/core/` | config manifest, LLM client plumbing, storage, events, and other infra | `config/manifest/index.js`, `llm/`, `storage/`, `events/` |
| `src/db/` | SQLite schemas, migrations, composition roots, and stores | `appDb.js`, `appDbSchema.js`, `specDb.js`, `specDbSchema.js`, `specDbMigrations.js`, `stores/` |
| `src/engine/` | validation engine helpers | `fieldRulesEngine.js`, `runtimeGate.js`, `ruleAccessors.js` |
| `src/features/` | feature-first backend code (`14` feature directories) | `catalog/`, `category-authority/`, `color-edition/`, `color-registry/`, `crawl/`, `extraction/`, `indexing/`, `publisher/`, `review/`, `review-curation/`, `settings/`, `settings-authority/`, `studio/`, `unit-registry/` |
| `src/field-rules/` | field-rules compiler, cache, and consumer helpers | `compiler.js`, `loader.js`, `sessionCache.js`, `unitRegistry.js` |
| `src/indexlab/` | runtime bridge and run artifact helpers | `runtimeBridgeArtifacts.js`, `runtimeBridgeEventHandlers.js` |
| `src/ingest/` | category compilation and field inference | `categoryCompile.js`, `compileAssembler.js` |
| `src/pipeline/` | crawl/run orchestration | `runProduct.js`, `urlQualityGate.js`, `checkpoint/`, `seams/` |
| `src/shared/` | shared registries, defaults, and generic helpers | `settingsRegistry.js`, `tests/` |
| `src/tests/` | field contract test runner infrastructure | `fieldContractTestRunner.js`, `deriveFailureValues.js` |

## `tools/` Tree (7 top-level subdirectories)

| Path | Purpose | Key files |
|------|---------|-----------|
| `tools/gui-react/` | React/Vite/TypeScript operator GUI | `package.json`, `vite.config.ts`, `src/App.tsx`, `src/registries/pageRegistry.ts` |
| `tools/gui-react/src/features/` | stateful GUI feature implementations (`12` dirs) | `catalog/`, `color-edition-finder/`, `color-registry/`, `data-change/`, `indexing/`, `llm-config/`, `operations/`, `pipeline-settings/`, `review/`, `runtime-ops/`, `storage-manager/`, `studio/` |
| `tools/gui-react/src/pages/` | route shells and page-local modules (`12` dirs) | `billing/`, `component-review/`, `layout/`, `llm-settings/`, `overview/`, `product/`, `publisher/`, `runtime/`, `storage/`, `test-mode/`, `unit-registry/`, `__tests__/` |
| `tools/gui-react/src/stores/` | Zustand stores | `uiStore.ts`, `tabStore.ts`, `collapseStore.ts`, `runtimeSettingsValueStore.ts`, `llmSettingsAuthority.ts` |
| `tools/gui-react/src/api/` | shared REST, GraphQL, websocket, and teardown clients | `client.ts`, `graphql.ts`, `ws.ts`, `teardownFetch.ts` |
| `tools/searxng/` | optional local search sidecar | `docker-compose.yml` |
| `tools/` root scripts | packaging, setup, and validation utilities | `build-exe.mjs`, `build-setup-exe.mjs`, `specfactory-launcher.mjs`, `check-env-example-sync.mjs` |

## Runtime-Created Files And Directories

| Path | Source | Notes |
|------|--------|-------|
| `.workspace/db/app.sqlite` | `src/app/api/bootstrap/createBootstrapSessionLayer.js` | global AppDb |
| `.workspace/db/<category>/spec.sqlite` | `src/app/api/specDbRuntime.js` | per-category SpecDb |
| `.workspace/output/` | `src/core/config/runtimeArtifactRoots.js` | output root |
| `.workspace/runs/` | `src/core/config/runtimeArtifactRoots.js` | IndexLab run artifacts |
| `.workspace/products/` | `src/core/config/runtimeArtifactRoots.js` | product checkpoint root |
| `.workspace/global/` | `src/core/config/runtimeArtifactRoots.js` | user settings fallback root |
| `.workspace/runtime/snapshots/` | `src/core/config/runtimeArtifactRoots.js` | per-run settings snapshots |

## Fast Navigation Hints

| If you need to know... | Go here first |
|------------------------|---------------|
| Mounted backend route order | `src/app/api/guiServerRuntime.js` |
| Frontend routed pages | `tools/gui-react/src/registries/pageRegistry.ts` |
| API client call pattern | `tools/gui-react/src/api/client.ts` |
| Config/env key inventory | `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js` |
| DB schema + migrations | `src/db/specDbSchema.js`, `src/db/appDbSchema.js`, `src/db/specDbMigrations.js` |
| Storage API contract | `src/features/indexing/api/storageManagerRoutes.js` |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/guiServerRuntime.js` | runtime entrypoint location and route-assembly ownership |
| source | `src/app/api/bootstrap/createBootstrapSessionLayer.js` | AppDb bootstrap path |
| source | `src/app/api/specDbRuntime.js` | per-category SpecDb path |
| source | `src/core/config/runtimeArtifactRoots.js` | default `.workspace` runtime roots |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route inventory and page folders |
| config | `package.json` | root file list and scripts |
| config | `playwright.config.ts` | `e2e/` ownership |
| source | `tools/check-env-example-sync.mjs` | utility script location and actual purpose |
| filesystem | repo root | current top-level directories and files on disk |

## Related Documents

- [Scope](./scope.md) - defines which folders belong to the live product boundary.
- [Conventions](./conventions.md) - explains how these folders are expected to be extended.
- [System Map](../03-architecture/system-map.md) - maps these paths onto runtime relationships.
- [Feature Index](../04-features/feature-index.md) - links folder ownership to feature docs.

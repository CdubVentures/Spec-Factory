# Folder Map

> **Purpose:** Provide an annotated repo tree so an arriving LLM knows where to look before scanning the entire codebase.
> **Prerequisites:** [scope.md](./scope.md)
> **Last validated:** 2026-03-30

## Root Tree

```text
.
|- .claude/                    # local assistant tooling/config
|- .git/                       # git metadata
|- .server-state/              # local runtime state files
|- .specfactory_tmp/           # generated scratch/runtime artifacts; not source of truth
|- .workspace/                 # default runtime workspace root: db, runs, output, settings, snapshots
|- category_authority/         # authored category control-plane content (field rules, components, sources)
|- data/                       # checked-in learning/support data
|- debug/                      # ad hoc screenshots and manual debug artifacts
|- docs/                       # LLM-oriented docs tree; docs/implementation is excluded from this pass
|- e2e/                        # Playwright E2E tests
|- test/                       # golden test fixtures, benchmarks, and Node test root
|- gui-dist/                   # copied GUI assets used by packaging flows
|- node_modules/               # installed dependencies; never edit
|- scripts/                    # repo helper scripts
|- specs/                      # checked-in run/spec outputs and related snapshots
|- src/                        # backend runtime, CLI, persistence, domain logic, and shared infra
|- storage/                    # checked-in storage/output artifacts; not the default live output root
|- tools/                      # GUI package, packaging, launcher, sidecars, and utilities
|- .env.example                # partial env template, not a full manifest mirror
|- AGENTS.md                   # repo-wide operating rules
|- CLAUDE.md                   # additional local repo guidance
|- Dockerfile                  # stale container path; not the verified runtime entrypoint
|- package.json                # root scripts and backend dependencies
|- package-lock.json           # exact resolved backend dependency versions
`- playwright.config.ts        # Playwright config for e2e/
```

## Top-Level Directories

| Path | Purpose | Key files / notes |
|------|---------|-------------------|
| `.workspace/` | default runtime workspace root | `src/core/config/runtimeArtifactRoots.js` resolves `.workspace/output`, `.workspace/runs`, `.workspace/products`, `.workspace/db`, `.workspace/global`, and `.workspace/runtime/snapshots` as the live defaults |
| `category_authority/` | canonical control-plane content | authored categories: `keyboard`, `monitor`, `mouse`; meta dirs: `_global`; harness dir: `tests` is on disk but filtered from `/api/v1/categories` |
| `data/` | checked-in learning/support data | currently includes `learning/` |
| `debug/` | manual debug captures | current contents are screenshots, not canonical runtime data |
| `docs/` | maintained documentation tree | `README.md` is the entrypoint; `implementation/` is excluded from the reading order |
| `e2e/` | Playwright browser tests | governed by `playwright.config.ts` |
| `test/` | golden test fixtures + benchmarks | `test/golden/` for spec golden masters, `test/benchmarks/` for scale benchmarks |
| `gui-dist/` | packaged GUI copy | refreshed by packaging flows, not the source GUI |
| `scripts/` | repo utility scripts | one-off helpers outside the main runtime entrypoints |
| `specs/` | checked-in spec/run snapshots | current checkout contains `outputs/` |
| `src/` | live product code | server runtime, CLI, persistence, features, and shared infrastructure |
| `storage/` | checked-in artifact snapshots | present in repo, but not the default live output root |
| `test/` | top-level Node test root | suite also includes `src/**/tests/` and `tools/gui-react/**/__tests__/` |
| `tools/` | GUI app, packaging, launcher, sidecars, validation tools | `gui-react/`, `searxng/`, `build-exe.mjs`, `specfactory-launcher.mjs` |

## High-Signal `src/` Subtrees

| Path | Purpose | Key files |
|------|---------|-----------|
| `src/api/` | thin runtime assembly, bootstrap, and server wiring | `guiServer.js`, `guiServerRuntime.js`, `guiServerHttpAssembly.js`, `serverBootstrap.js` |
| `src/api/bootstrap/` | bootstrap phases for config, storage, DB, realtime, and process runtime | `createBootstrapEnvironment.js`, `createBootstrapSessionLayer.js`, `createBootstrapRealtimeLayer.js`, `createBootstrapProcessLayer.js` |
| `src/app/api/` | request dispatch, route registration, realtime bridge, and process lifecycle | `requestDispatch.js`, `routeRegistry.js`, `guiRouteRegistration.js`, `realtimeBridge.js`, `processRuntime.js` |
| `src/cli/` | operator CLI entrypoint | `spec.js` |
| `src/core/` | config manifest, runtime roots, LLM routing, event contracts | `config/manifest/index.js`, `config/runtimeArtifactRoots.js`, `events/dataChangeContract.js`, `llm/` |
| `src/db/` | SQLite boundaries | `appDb.js`, `appDbSchema.js`, `specDb.js`, `specDbSchema.js`, `stores/` |
| `src/features/` | feature-first backend boundaries | `catalog/`, `crawl/`, `indexing/`, `review/`, `settings/`, `settings-authority/`, `studio/`, `category-authority/` |
| `src/pipeline/` | crawl-first run orchestration and batch flows | `runProduct.js`, `runCrawlProcessingLifecycle.js` |
| `src/indexlab/` | run-artifact readers and runtime bridge helpers | `runtimeBridgeEventHandlers.js`, `runtimeBridgePayloads.js` |
| `src/shared/` | shared registry/defaults/accessors and generic helpers | `settingsRegistry.js` exports `145` live entries: `138` runtime, `3` bootstrap env, `4` UI; `settingsDefaults.js` contains no populated storage defaults |
| `src/s3/` | local/S3 storage adapter | `storage.js` selects `S3Storage` only when `config.outputMode === 's3'`; otherwise local storage is used |

## High-Signal `tools/` Subtrees

| Path | Purpose | Key files |
|------|---------|-----------|
| `tools/gui-react/` | React/Vite/TypeScript operator GUI | `package.json`, `vite.config.ts`, `src/App.tsx`, `src/registries/pageRegistry.ts` |
| `tools/gui-react/src/features/` | stateful GUI feature implementations | indexing, runtime-ops, review, studio, pipeline-settings, llm-config, storage-manager |
| `tools/gui-react/src/pages/` | route shells and page-local implementations | `layout/AppShell.tsx`, `storage/StoragePage.tsx`, `test-mode/TestModePage.tsx` |
| `tools/searxng/` | optional local SearXNG sidecar | `docker-compose.yml` |
| `tools/dist/` | generated packaging output | not source of truth for live docs or code edits |
| `tools/build-exe.mjs` | packaged desktop build pipeline | rebuilds GUI and emits `SpecFactory.exe` |
| `tools/build-setup-exe.mjs` | packaged launcher build pipeline | emits `Launcher.exe` |
| `tools/specfactory-launcher.mjs` | setup/bootstrap helper runtime | separate helper server from `src/api/guiServer.js` |
| `tools/check-env-example-sync.mjs` | env-template drift checker | powers `npm run env:check` |

## Runtime-Created Or Default Paths

| Path / concept | Source of truth | Notes |
|----------------|-----------------|-------|
| global app DB | `src/api/bootstrap/createBootstrapSessionLayer.js` | default path `.workspace/db/app.sqlite` |
| per-category SpecDb | `src/app/api/specDbRuntime.js`, `src/shared/settingsRegistry.js` | default path `.workspace/db/<category>/spec.sqlite` |
| local output root | `src/core/config/runtimeArtifactRoots.js` | default path `.workspace/output` |
| local IndexLab root | `src/core/config/runtimeArtifactRoots.js` | default path `.workspace/runs` |
| built GUI assets | `tools/gui-react/dist/` | produced by `npm run gui:build`, served by `src/api/guiServer.js` |

## Documentation Layout

| Path | Purpose | Notes |
|------|---------|-------|
| `docs/README.md` | master entrypoint | first file for new agents |
| `docs/01-project-overview/` -> `docs/07-patterns/` | current-state docs hierarchy | maintained authority set |
| `docs/03-architecture/*AUDIT*.md` | historical architecture audits | retained as snapshots, not primary current-state docs |
| `docs/test-audit/` | historical test-audit records | supplemental only |
| `docs/implementation/` | excluded subtree | off-limits for this pass |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServerRuntime.js` | runtime assembly, route context ownership, and metadata roots |
| source | `src/api/bootstrap/createBootstrapSessionLayer.js` | `app.sqlite` location and eager AppDb bootstrap |
| source | `src/core/config/runtimeArtifactRoots.js` | default `.workspace/output` and `.workspace/runs` roots |
| source | `src/shared/settingsRegistry.js` | exported registry counts and absence of a storage registry export |
| source | `src/app/api/routes/infra/categoryRoutes.js` | `tests` harness directory is excluded from the default categories API |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route ownership |
| config | `package.json` | root tooling and top-level files |
| config | `playwright.config.ts` | E2E ownership |

## Related Documents

- [Conventions](./conventions.md) - Explains how these folders are expected to be used and extended.
- [System Map](../03-architecture/system-map.md) - Maps the folders onto runtime relationships.
- [Feature Index](../04-features/feature-index.md) - Maps folder ownership to feature docs.

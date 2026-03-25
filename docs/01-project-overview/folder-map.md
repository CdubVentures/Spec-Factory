# Folder Map

> **Purpose:** Provide an annotated repo tree so an arriving LLM knows where to look before scanning the entire codebase.
> **Prerequisites:** [scope.md](./scope.md)
> **Last validated:** 2026-03-24

## Root Tree

```text
.
|- .claude/                     # local Claude config and statusline helpers
|- .git/                        # git metadata; never edit directly
|- .server-state/               # local server/runtime state files
|- .specfactory_tmp/            # default local SpecDb / scratch root
|- category_authority/          # canonical authored category content and persisted user settings
|- data/                        # checked-in support data and sample inputs
|- docs/                        # LLM-oriented documentation tree; numbered docs are the maintained current-state set
|- e2e/                         # Playwright end-to-end tests
|- fixtures/                    # checked-in fixture inputs used by tests and validation flows
|- gui-dist/                    # copied GUI assets for packaged desktop/runtime delivery
|- node_modules/                # installed dependencies; never edit
|- scripts/                     # auxiliary scripts and one-off helpers
|- src/                         # backend runtime, CLI, persistence, domain logic, and shared infra
|- storage/                     # checked-in storage-root artifacts and local output snapshots
|- test/                        # primary Node built-in test suite
|- tmp/                         # transient logs and scratch outputs
|- tools/                       # GUI package, packaging, setup, SearXNG, and validation helpers
|- .env                         # local operator env overrides
|- 00_StartGuiApi.bat           # Windows launcher for the local GUI/API server
|- 01_BuildGui.bat              # Windows launcher for GUI build
|- 02_RefreshGuiPage.bat        # Windows helper to refresh GUI assets
|- 03_RebuildSpecFactoryExe.bat # Windows helper to rebuild packaged executable
|- AGENTS.md                    # repo-wide operating rules
|- AGENTS.testing.md            # additional testing-focused repo rules
|- AGENTS.testsCleanUp.md       # additional test-cleanup repo rules
|- CLAUDE.md                    # additional local coding/repo guidance
|- Dockerfile                   # stale container artifact; not the verified deployment path
|- LauncherBuild.bat            # packaged launcher build wrapper
|- package.json                 # root scripts, Node engine, backend deps
|- package-lock.json            # exact resolved backend dependency versions
|- playwright.config.ts         # Playwright config for `e2e/`
|- RunDump.bat                  # local diagnostics wrapper
|- Spec Factory Process Manager.lnk # local Windows shortcut artifact
|- SpecFactoryBuild.bat         # packaged desktop build wrapper
|- Restart SearXNG.lnk          # local Windows shortcut artifact
`- .env.example                 # partial env template; not a full manifest mirror
```

## Top-Level Directories

| Path | Purpose | Key files / notes |
|------|---------|-------------------|
| `.claude/` | local Claude tooling and config | `.claude/settings.json` is local editor/runtime tooling, not product code |
| `.git/` | git metadata | repository control data only |
| `.server-state/` | local API/runtime state | written by local runs; not source of truth |
| `.specfactory_tmp/` | default temp SQLite / scratch root | default temp-root target derived through `src/core/config/runtimeArtifactRoots.js`, `src/shared/settingsRegistry.js`, and `src/config.js` |
| `category_authority/` | canonical authored control-plane content | `_runtime/user-settings.json`, per-category `_control_plane/`, `_generated/`, and category-local `sources.json` where present. Authored directories in the current checkout: `keyboard`, `monitor`, `mouse`, and `tests` (plus `_global` and `_runtime` meta-dirs); `tests/` is a harness category and does not currently include `sources.json` |
| `data/` | checked-in support data | auxiliary non-authority inputs |
| `docs/` | maintained LLM-first doc tree | `README.md` is the current entrypoint; `implementation/` is excluded from the reading order and this pass |
| `e2e/` | Playwright browser/API tests | current checked-in E2E specs live under `e2e/settings/` |
| `fixtures/` | deterministic fixtures | includes local S3-style inputs and test assets |
| `gui-dist/` | packaged GUI copy | created/updated by packaging flow |
| `node_modules/` | installed dependencies | generated; never edit |
| `scripts/` | helper scripts | repo utilities outside the main runtime entrypoints |
| `src/` | live backend/runtime code | server, CLI, persistence, features, and shared infra |
| `storage/` | checked-in storage-root artifacts | present in the checkout, but not the default runtime output root |
| `test/` | primary test suite | `node --test` entry surface |
| `tmp/` | transient local logs and scratch outputs | local-only |
| `tools/` | frontend package, setup, packaging, validation, and sidecars | `gui-react/`, `searxng/`, `specfactory-launcher.mjs`, packaging scripts |

## High-Signal `src/` Subtrees

| Path | Purpose | Key files |
|------|---------|-----------|
| `src/api/` | main HTTP server assembly and API-related helpers | `guiServer.js`, `serverBootstrap.js`, `guiServerHttpAssembly.js`, `intelGraphApi.js` |
| `src/api/bootstrap/` | phased server bootstrap helpers | `createBootstrapEnvironment.js`, `createBootstrapSessionLayer.js`, `createBootstrapDomainRuntimes.js` |
| `src/app/api/` | request dispatch, route registry, realtime bridge, and process runtime | `requestDispatch.js`, `routeRegistry.js`, `realtimeBridge.js`, `processRuntime.js` |
| `src/cli/` | main operator CLI surface | `spec.js` |
| `src/core/` | config manifest, event contracts, LLM routing, and shared infrastructure | `config/manifest.js`, `config/manifest/index.js`, `config/runtimeArtifactRoots.js`, `events/dataChangeContract.js`, `llm/` |
| `src/db/` | SQLite schema, migrations, and stores | `specDb.js`, `specDbSchema.js`, `specDbMigrations.js`, `stores/`, `DOMAIN.md` |
| `src/features/` | feature-first backend boundaries | `catalog/`, `crawl/` (browser automation with plugins), `indexing/`, `review/`, `settings/`, `settings-authority/`, `studio/`, `category-authority/`, `review-curation/`, `expansion-hardening/` |
| `src/pipeline/` | crawl-first run orchestration and batch review workers | `runProduct.js` (248 LOC, crawl-based), `runCrawlProcessingLifecycle.js`, `componentReviewBatch.js` |
| `src/indexlab/` | run-artifact readers and runtime bridge event handlers | `runtimeBridgeEventHandlers.js`, `runtimeBridgePayloads.js`, `README.md` |
| `src/field-rules/` | compiled rule/session helpers used by studio and review | `sessionCache.js`, consumer gates, compile-time support |
| `src/categories/` | category loader boundary | `loader.js` |
| `src/ingest/` | CSV/category ingest and compile helpers | compile/ingest support for authority updates |
| `src/queue/` | queue-state helpers | `queueState.js` |
| `src/s3/` | local/S3/dual storage abstraction | `src/s3/storage.js` |
| `src/shared/` | cross-runtime defaults, settings registry SSOT, and generic shared helpers | `settingsRegistry.js` (`122` live registry entries: `99` runtime, `8` bootstrap-env, `5` UI, `10` storage), `settingsDefaults.js`, `settingsAccessor.js`, `settingsClampingRanges.js`, `discoveryRankConstants.js`, `stableHash.js` |
| `src/testing/` | test-mode data-generation helpers | `testDataProvider.js` |

## High-Signal `tools/` Subtrees

| Path | Purpose | Key files |
|------|---------|-----------|
| `tools/gui-react/` | React/Vite/TypeScript GUI package | `tools/gui-react/package.json`, `tools/gui-react/vite.config.ts`, `tools/gui-react/src/App.tsx`, `tools/gui-react/src/registries/pageRegistry.ts` |
| `tools/gui-react/src/features/` | stateful GUI feature implementations | indexing, runtime-ops, review, studio, catalog, pipeline-settings, llm-config |
| `tools/gui-react/src/pages/` | route wrappers, shared layout shell, and legacy page-local implementations | `layout/AppShell.tsx`, page re-export shims, `StoragePage.tsx`, `TestModePage.tsx` |
| `tools/searxng/` | local SearXNG stack | `docker-compose.yml` |
| `tools/structured-metadata-sidecar/` | optional structured metadata sidecar support | sidecar README and helpers |
| `tools/architecture/` | architecture/rendering utilities | supplemental tooling, not current-state source of truth |
| `tools/validation-output/` | generated validation artifacts | local outputs from validation scripts |
| `tools/build-exe.mjs` | packaged desktop build pipeline | generates a repo-root `SpecFactory.exe` and refreshes `gui-dist/` when the packaging flow runs; the artifact was absent in the current checkout |
| `tools/build-setup-exe.mjs` | packaged launcher build pipeline | generates a repo-root `Launcher.exe` when the packaging flow runs; the artifact was absent in the current checkout |
| `tools/specfactory-launcher.mjs` | local setup/bootstrap launcher | serves setup state on its own port |
| `tools/check-env-example-sync.mjs` | env-template drift checker | backing script for `npm run env:check` |

## High-Signal `docs/` Subtrees

| Path | Purpose | Notes |
|------|---------|-------|
| `docs/README.md` | master entrypoint and reading order | first file an arriving LLM should read |
| `docs/01-project-overview/` -> `docs/07-patterns/` | maintained numbered current-state doc hierarchy | active LLM reading surface |
| `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-23.md` and `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-24.md` | historical architecture audit records | supplemental; not first-line current-state authority |
| `docs/test-audit/` | historical test-audit records | supplemental; not first-line architecture authority |
| `docs/implementation/` | excluded subtree | exists on disk but is off-limits for this pass and excluded from the current-state reading order |

## Runtime-Created Or Configured Paths Not Present In The Checkout

| Path / concept | Source of truth | Notes |
|----------------|-----------------|-------|
| configured imports root (default `imports/`) | `src/shared/settingsDefaults.js`, `src/config.js` | CSV ingest logic can read this path even though no top-level `imports/` directory is currently checked in |
| local output root | `src/core/config/runtimeArtifactRoots.js`, `src/shared/settingsRegistry.js`, `src/config.js` | defaults under the OS temp directory, not the checked-in `storage/` folder unless settings override it |
| local IndexLab root | `src/core/config/runtimeArtifactRoots.js` | defaults under the OS temp directory |
| GUI build output | `tools/gui-react/dist/` | created by `npm run gui:build`; served by `src/api/guiServer.js` |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | root scripts and key top-level files |
| config | `playwright.config.ts` | E2E test root and browser-test ownership |
| source | `src/api/guiServer.js` | top-level backend/runtime subtree ownership |
| source | `src/app/api/routeRegistry.js` | route-family ownership across feature directories |
| source | `src/core/config/runtimeArtifactRoots.js` | temp-root runtime artifact defaults |
| source | `src/shared/settingsRegistry.js` | path-root, provider, runtime, UI, and storage registry ownership |
| source | `src/core/config/manifest/index.js` | live emitted manifest assembly and declared group inventory |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route registry, tab metadata, and feature ownership |
| source | `tools/gui-react/src/App.tsx` | GUI lazy-route wrapper and standalone `test-mode` mount |
| config | `tools/gui-react/vite.config.ts` | GUI build and proxy boundary |

## Related Documents

- [Conventions](./conventions.md) - Explains how files are expected to be organized and edited.
- [System Map](../03-architecture/system-map.md) - Maps these folders onto runtime relationships.
- [Feature Index](../04-features/feature-index.md) - Maps folder ownership to user-facing features.

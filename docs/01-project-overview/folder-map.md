# Folder Map

> **Purpose:** Provide an annotated repo tree so an arriving LLM knows where to look before scanning the entire codebase.
> **Prerequisites:** [scope.md](./scope.md)
> **Last validated:** 2026-03-23

## Root Tree

```text
.
|- .claude/                     # local Claude config and statusline helpers
|- .git/                        # git metadata; never edit directly
|- .server-state/               # local server/runtime state files
|- .specfactory_tmp/            # default local SpecDb / scratch root
|- .tmp/                        # local transient temp files
|- category_authority/          # canonical authored category content and persisted user settings
|- data/                        # checked-in support data and sample inputs
|- debug/                       # local debugging output and ad hoc diagnostics
|- docs/                        # LLM-oriented documentation tree; numbered docs are the maintained current-state set
|- fixtures/                    # checked-in fixture inputs used by tests and validation flows
|- gui-dist/                    # copied GUI assets for packaged desktop/runtime delivery
|- node_modules/                # installed dependencies; never edit
|- scripts/                     # auxiliary scripts and one-off helpers
|- src/                         # backend runtime, CLI, persistence, domain logic, and shared infra
|- test/                        # primary Node built-in test suite
|- tests/                       # additional test helpers/assets
|- tmp/                         # transient logs and scratch outputs
|- tools/                       # GUI package, packaging, setup, SearXNG, and validation helpers
|- 00_StartGuiApi.bat           # Windows launcher for the local GUI/API server
|- 01_BuildGui.bat              # Windows launcher for GUI build
|- 02_RefreshGuiPage.bat        # Windows helper to refresh GUI assets
|- 03_RebuildSpecFactoryExe.bat # Windows helper to rebuild packaged executable
|- AGENTS.md                    # repo-wide operating rules
|- CLAUDE.md                    # additional local coding/repo guidance
|- Dockerfile                   # stale container artifact; not the verified deployment path
|- Launcher.exe                 # packaged setup launcher artifact
|- SpecFactory.exe              # packaged desktop runtime artifact
|- package.json                 # root scripts, Node engine, backend deps
|- package-lock.json            # exact resolved backend dependency versions
`- .env.example                 # partial env template; not a full manifest mirror
```

## Top-Level Directories

| Path | Purpose | Key files / notes |
|------|---------|-------------------|
| `.claude/` | local Claude tooling and config | `.claude/settings.json` is local editor/runtime tooling, not product code |
| `.git/` | git metadata | repository control data only |
| `.server-state/` | local API/runtime state | written by local runs; not source of truth |
| `.specfactory_tmp/` | default temp SQLite / scratch root | default `SPEC_DB_DIR` target from `src/core/config/manifest/pathsGroup.js` |
| `.tmp/` | transient local temp files | local-only scratch area |
| `category_authority/` | canonical authored control-plane content | `_runtime/user-settings.json`, per-category `_control_plane/`, `_generated/`, `sources.json`. Categories: `gaming_mice`, `keyboard`, `monitor`, `mouse` (plus `_global` and `_runtime` meta-dirs) |
| `data/` | checked-in support data | auxiliary non-authority inputs |
| `debug/` | debugging output | ad hoc local diagnostics |
| `docs/` | maintained LLM-first doc tree | `README.md` is the current entrypoint; `implementation/` is excluded from the reading order and this pass |
| `fixtures/` | deterministic fixtures | includes local S3-style inputs and test assets |
| `gui-dist/` | packaged GUI copy | created/updated by packaging flow |
| `node_modules/` | installed dependencies | generated; never edit |
| `scripts/` | helper scripts | repo utilities outside the main runtime entrypoints |
| `src/` | live backend/runtime code | server, CLI, persistence, features, and shared infra |
| `test/` | primary test suite | `node --test` entry surface |
| `tests/` | secondary helpers/assets | support files not all discovered as standalone tests |
| `tmp/` | transient local logs and scratch outputs | local-only |
| `tools/` | frontend package, setup, packaging, validation, and sidecars | `gui-react/`, `searxng/`, `specfactory-launcher.mjs`, packaging scripts |

## High-Signal `src/` Subtrees

| Path | Purpose | Key files |
|------|---------|-----------|
| `src/api/` | main HTTP server assembly and API-related helpers | `guiServer.js`, `serverBootstrap.js`, `guiServerHttpAssembly.js`, `intelGraphApi.js` |
| `src/api/bootstrap/` | phased server bootstrap helpers | `createBootstrapEnvironment.js`, `createBootstrapSessionLayer.js`, `createBootstrapDomainRuntimes.js` |
| `src/app/api/` | request dispatch, route registry, realtime bridge, and process runtime | `requestDispatch.js`, `routeRegistry.js`, `realtimeBridge.js`, `processRuntime.js` |
| `src/cli/` | main operator CLI surface | `spec.js` |
| `src/core/` | config manifest, LLM routing, and shared infrastructure | `config/manifest/index.js`, `config/runtimeArtifactRoots.js`, `llm/` |
| `src/db/` | SQLite schema, migrations, and stores | `specDb.js`, `specDbSchema.js`, `specDbMigrations.js`, `stores/`, `DOMAIN.md` |
| `src/features/` | feature-first backend boundaries | `catalog/`, `indexing/`, `review/`, `settings/`, `settings-authority/`, `studio/`, `category-authority/`, `review-curation/`, `expansion-hardening/` |
| `src/pipeline/` | run orchestration and batch review workers | `runProduct.js`, `componentReviewBatch.js` |
| `src/daemon/` | recurring watch/queue runner | `daemon.js` |
| `src/indexlab/` | run-artifact readers and packet validation helpers | `indexingSchemaPacketsValidator.js` and packet readers |
| `src/field-rules/` | compiled rule/session helpers used by studio and review | `sessionCache.js`, consumer gates, compile-time support |
| `src/categories/` | category loader boundary | `loader.js` |
| `src/ingest/` | CSV/category ingest and compile helpers | compile/ingest support for authority updates |
| `src/queue/` | queue-state helpers | `queueState.js` |
| `src/review/` | legacy review-domain implementation consumed by review feature routes | component-review and grid data builders |
| `src/s3/` | local/S3/dual storage abstraction | `storage.js` |
| `src/shared/` | cross-runtime defaults, settings registry SSOT, and generic shared helpers | `settingsRegistry.js` (430+ settings), `settingsDefaults.js`, `settingsAccessor.js`, `settingsClampingRanges.js`, `discoveryRankConstants.js`, `stableHash.js` |
| `src/testing/` | test-mode runtime helpers | `testDataProvider.js`, `testRunner.js` |

## High-Signal `tools/` Subtrees

| Path | Purpose | Key files |
|------|---------|-----------|
| `tools/gui-react/` | React/Vite/TypeScript GUI package | `package.json`, `vite.config.ts`, `src/App.tsx` |
| `tools/gui-react/src/features/` | stateful GUI feature implementations | indexing, runtime-ops, review, studio, catalog, pipeline-settings |
| `tools/gui-react/src/pages/` | route wrappers and legacy page-local implementations | `layout/AppShell.tsx`, page re-export shims, `StoragePage.tsx`, `TestModePage.tsx` |
| `tools/searxng/` | local SearXNG stack | `docker-compose.yml` |
| `tools/structured-metadata-sidecar/` | optional structured metadata sidecar support | sidecar README and helpers |
| `tools/architecture/` | architecture/rendering utilities | supplemental tooling, not current-state source of truth |
| `tools/validation-output/` | generated validation artifacts | local outputs from validation scripts |
| `tools/build-exe.mjs` | packaged desktop build pipeline | builds `SpecFactory.exe` and copies GUI assets |
| `tools/build-setup-exe.mjs` | packaged launcher build pipeline | builds `Launcher.exe` |
| `tools/specfactory-launcher.mjs` | local setup/bootstrap launcher | serves setup state on its own port |
| `tools/check-env-example-sync.mjs` | env-template drift checker | backing script for `npm run env:check` |

## High-Signal `docs/` Subtrees

| Path | Purpose | Notes |
|------|---------|-------|
| `docs/README.md` | master entrypoint and reading order | first file an arriving LLM should read |
| `docs/01-project-overview/` -> `docs/07-patterns/` | maintained numbered current-state doc hierarchy | active LLM reading surface |
| `docs/audits/` | historical and audit-pass records | supplemental; not first-line architecture authority |
| `docs/implementation/` | excluded subtree | exists on disk but is off-limits for this pass and excluded from the current-state reading order |

## Runtime-Created Or Configured Paths Not Present In The Checkout

| Path / concept | Source of truth | Notes |
|----------------|-----------------|-------|
| configured imports root (default `imports/`) | `src/shared/settingsDefaults.js`, `src/config.js`, `src/daemon/daemon.js` | daemon/watch-imports logic can read this path even though no top-level `imports/` directory is currently checked in |
| local output root | `src/core/config/runtimeArtifactRoots.js`, `src/core/config/manifest/pathsGroup.js` | defaults under the OS temp directory, not a checked-in `storage/` folder |
| local IndexLab root | `src/core/config/runtimeArtifactRoots.js` | defaults under the OS temp directory |
| GUI build output | `tools/gui-react/dist/` | created by `npm run gui:build`; served by `src/api/guiServer.js` |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | root scripts and key top-level files |
| source | `src/api/guiServer.js` | top-level backend/runtime subtree ownership |
| source | `src/app/api/routeRegistry.js` | route-family ownership across feature directories |
| source | `src/daemon/daemon.js` | configured imports-root behavior and daemon boundaries |
| source | `src/core/config/runtimeArtifactRoots.js` | temp-root runtime artifact defaults |
| config | `src/core/config/manifest/pathsGroup.js` | path-root defaults including `CATEGORY_AUTHORITY_ROOT` and `SPEC_DB_DIR` |
| source | `tools/gui-react/src/App.tsx` | GUI route wrapper and feature ownership |
| config | `tools/gui-react/vite.config.ts` | GUI build and proxy boundary |

## Related Documents

- [Conventions](./conventions.md) - Explains how files are expected to be organized and edited.
- [System Map](../03-architecture/system-map.md) - Maps these folders onto runtime relationships.
- [Feature Index](../04-features/feature-index.md) - Maps folder ownership to user-facing features.

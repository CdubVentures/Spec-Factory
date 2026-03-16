# Folder Map

> **Purpose:** Provide an annotated repo tree so an arriving LLM knows where to look before scanning the entire codebase.
> **Prerequisites:** [scope.md](./scope.md)
> **Last validated:** 2026-03-15

## Root Tree

```text
.
|- AGENTS.md                       # repo-wide operating rules
|- package.json                    # root scripts, Node engine, backend deps
|- package-lock.json               # exact resolved backend dependency versions
|- .env.example                    # partial env template; not a complete manifest mirror
|- Dockerfile                      # stale container artifact; references missing src/cli/run-batch.js
|- 00_StartGuiApi.bat              # Windows launcher for GUI API server
|- 01_BuildGui.bat                 # Windows launcher for GUI build
|- category_authority/             # canonical authored category content + runtime user settings
|  |- _runtime/                    # persisted user settings and authority state
|  |- mouse/                       # category-specific rule/content payloads
|  `- ...                          # other category authority directories
|- data/                           # checked-in data inputs and support payloads
|- debug/                          # debug output and ad hoc diagnostics
|- docs/                           # current LLM-first documentation tree
|- fixtures/                       # local fixture inputs used by tests and smoke flows
|- imports/                        # watched imports root for ingest/daemon flows
|- scripts/                        # auxiliary scripts, including external adapter helpers
|- src/                            # backend runtime, CLI, persistence, domain features
|  |- api/                         # GUI server assembly, helpers, review mutation routes
|  |- app/                         # API request pipeline, registries, CLI command wiring
|  |- cli/                         # main CLI entrypoint and command adapters
|  |- core/                        # config manifest, LLM routing, shared infra
|  |- db/                          # SQLite boundary, DDL, stores, migrations
|  |- features/                    # backend feature boundaries
|  |- indexlab/                    # packet readers and schema validators
|  |- s3/                          # S3/local storage abstraction
|  |- shared/                      # shared defaults and generic backend helpers
|  `- testing/                     # test-mode data providers and contract builders
|- storage/                        # runtime artifact storage root
|- test/                           # Node built-in test suite
|- tests/                          # additional test assets/helpers
|- tools/                          # GUI package, launcher, SearXNG, packaging, setup helpers
|  |- gui-react/                   # React/Vite/TypeScript GUI package
|  |- searxng/                     # local Docker Compose stack for SearXNG
|  |- structured-metadata-sidecar/ # optional sidecar service docs/scripts
|  `- specfactory-launcher.mjs     # bootstrap/setup launcher
|- gui-dist/                       # generated GUI output for packaging/runtime copies
|- node_modules/                   # installed dependencies; never edit
|- .server-state/                  # local runtime state
|- .specfactory_tmp/               # local SQLite/output scratch area
|- tmp/                            # transient logs and scratch artifacts
`- *.log / tmp-*.log               # audit and local test/build logs
```

## High-Signal Subtrees

### `src/`

| Path | Purpose | Key files |
|------|---------|-----------|
| `src/api/` | GUI server assembly and shared API helpers | `guiServer.js`, `guiServerRuntimeConfig.js`, `reviewItemRoutes.js` |
| `src/app/api/` | Request parsing, dispatch, route registry, static serving, realtime bridge | `requestDispatch.js`, `routeRegistry.js`, `realtimeBridge.js`, `processRuntime.js` |
| `src/db/` | SQLite SSOT and store composition | `specDb.js`, `specDbSchema.js`, `specDbMigrations.js` |
| `src/features/indexing/` | IndexLab APIs, runtime ops, queue, source strategy, orchestration | `api/indexlabRoutes.js`, `api/runtimeOpsRoutes.js`, `api/sourceStrategyRoutes.js` |
| `src/features/review/` | scalar review and component-review route family | `api/reviewRoutes.js` |
| `src/features/settings/` | runtime/storage/UI/LLM settings route family | `api/configRoutes.js` |
| `src/features/studio/` | Field Rules Studio route family | `api/studioRoutes.js` |

### `tools/gui-react/src/`

| Path | Purpose | Key files |
|------|---------|-----------|
| `tools/gui-react/src/App.tsx` | HashRouter route map | `App.tsx` |
| `tools/gui-react/src/api/` | GUI fetch and WebSocket boundary | `client.ts`, `ws.ts`, `graphql.ts` |
| `tools/gui-react/src/pages/` | top-level route wrappers and some legacy page implementations | `layout/AppShell.tsx`, `storage/StoragePage.tsx`, `test-mode/TestModePage.tsx` |
| `tools/gui-react/src/features/` | stateful GUI feature implementations | `indexing/components/IndexingPage.tsx`, `runtime-ops/components/RuntimeOpsPage.tsx`, `review/components/ReviewPage.tsx`, `studio/components/StudioPage.tsx` |
| `tools/gui-react/src/stores/` | persisted UI state stores | `uiStore.ts`, `tabStore.ts`, `collapseStore.ts` |

### `docs/implementation/`

| Path | Purpose | Current status |
|------|---------|----------------|
| `docs/implementation/ai-indexing-plans/schema/` | runtime-used JSON schemas consumed by `src/indexlab/indexingSchemaPacketsValidator.js` | retained |
| other `docs/implementation/**` assets | supplemental historical/reference assets | not part of the current reading order |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | root scripts and repo root files of interest |
| source | `src/api/guiServer.js` | top-level backend/runtime subtree ownership |
| source | `tools/gui-react/src/App.tsx` | route wrapper layout and GUI subtree ownership |
| source | `src/indexlab/indexingSchemaPacketsValidator.js` | runtime dependency on `docs/implementation/ai-indexing-plans/schema/*.json` |
| config | `tools/gui-react/vite.config.ts` | GUI build/dev-server boundary and proxy behavior |

## Related Documents

- [Conventions](./conventions.md) - Explains how files are expected to be organized and edited.
- [System Map](../03-architecture/system-map.md) - Maps these folders onto runtime relationships.
- [Feature Index](../04-features/feature-index.md) - Maps folder ownership to user-facing features.

# Folder Map

> **Purpose:** Give the LLM an annotated repo tree before it starts scanning files.
> **Prerequisites:** [scope.md](./scope.md)
> **Last validated:** 2026-04-07

## Root Tree

```text
.
|- .claude/                    # local Claude/Codex helper config
|- .git/                       # git metadata
|- .server-state/              # local runtime state files
|- .tmp/                       # repo-local scratch root for throwaway test/tool artifacts
|- .workspace/                 # live workspace root: db, runs, output, products, global settings, snapshots
|- category_authority/         # authored category control-plane content
|- debug/                      # ad hoc debug captures
|- docs/                       # maintained documentation set
|- e2e/                        # Playwright end-to-end tests
|- gui-dist/                   # packaged GUI copy used by desktop packaging flows
|- node_modules/               # installed dependencies
|- scripts/                    # repo utility scripts
|- src/                        # backend runtime, CLI, DB, features, shared infra
|- test/                       # repo-level tests and helpers
|- tools/                      # GUI package, launchers, sidecars, packaging, utilities
|- .env                        # observed local dotenv file
|- AGENTS.md                   # repo-wide operating rules
|- AGENTS.testing.md           # testing rules
|- AGENTS.testsCleanUp.md      # test-cleanup rules
|- CLAUDE.md                   # LLM-first repo truth entrypoint
|- Dockerfile                  # stale container path; not validated as the live runtime path
|- README.md                   # repo-root docs pointer
|- package-lock.json           # exact resolved root dependencies
|- package.json                # root scripts + backend deps
|- playwright.config.ts        # Playwright config
|- SpecFactory.bat             # Windows launcher
`- SpecFactory.exe             # packaged desktop artifact
```

## Top-Level Boundaries

| Path | Purpose | Notes |
|------|---------|-------|
| `.workspace/` | Runtime-created data root | Default roots come from `src/core/config/runtimeArtifactRoots.js`. |
| `.tmp/` | Repo-local scratch root | Throwaway test/tool artifacts only; not runtime data. |
| `category_authority/` | Authored control-plane data | Categories on disk include `_global/`, `_test_mouse/`, `keyboard/`, `monitor/`, `mouse/`, and `tests/`. |
| `docs/` | Maintained current-state docs | Start at `docs/README.md`. |
| `e2e/` | Browser-level tests | Controlled by `playwright.config.ts`. |
| `src/` | Live backend + CLI code | Main entrypoints are under `src/app/api/` and `src/app/cli/`. |
| `test/` | Shared repo test surface | Separate from feature-local `src/**/tests/`. |
| `tools/` | GUI app and operational tooling | Contains the only frontend package in `tools/gui-react/`. |

## `src/` Tree

| Path | Purpose | Key files |
|------|---------|-----------|
| `src/app/api/` | Server runtime, bootstrap, dispatch, and route registration | `guiServer.js`, `guiServerRuntime.js`, `guiServerHttpAssembly.js`, `routeRegistry.js`, `routes/infraRoutes.js`, `routes/testModeRoutes.js` |
| `src/app/cli/` | Command factories used by `src/app/cli/spec.js` | `commands/` |
| `src/core/` | Config manifest, LLM client plumbing, runtime roots, cross-cutting utilities | `config/manifest.js`, `config/runtimeArtifactRoots.js`, `llm/` |
| `src/db/` | SQLite schemas, migrations, and stores | `appDb.js`, `specDb.js`, `specDbMigrations.js`, `stores/` |
| `src/features/` | Feature-first backend code | `catalog/`, `category-authority/`, `color-edition/`, `color-registry/`, `crawl/`, `extraction/`, `indexing/`, `publisher/`, `review/`, `review-curation/`, `settings/`, `settings-authority/`, `studio/` |
| `src/indexlab/` | Runtime bridge and run artifact helpers | `runtimeBridge.js`, `runtimeBridgeEventHandlers.js` |
| `src/pipeline/` | Crawl/run orchestration | `runProduct.js` |
| `src/shared/` | Shared registries, defaults, generic helpers, tests | `settingsRegistry.js`, `tests/` |
| `src/tests/` | Field contract test runner and test value derivation | `fieldContractTestRunner.js`, `deriveFailureValues.js` |

## `tools/` Tree

| Path | Purpose | Key files |
|------|---------|-----------|
| `tools/gui-react/` | React/Vite/TypeScript operator GUI | `package.json`, `vite.config.ts`, `src/App.tsx`, `src/registries/pageRegistry.ts` |
| `tools/gui-react/src/features/` | Stateful GUI feature implementations | catalog, color-registry, indexing, llm-config, pipeline-settings, review, runtime-ops, studio, storage-manager |
| `tools/gui-react/src/pages/` | Route shells and page-local modules | `layout/AppShell.tsx`, `overview/OverviewPage.tsx`, `storage/StoragePage.tsx`, `test-mode/TestModePage.tsx` |
| `tools/searxng/` | Optional local search sidecar | `docker-compose.yml` |
| `tools/build-exe.mjs` | Windows packaging flow | Rebuilds GUI and emits `SpecFactory.exe`. |
| `tools/specfactory-launcher.mjs` | Setup/bootstrap helper | Used by `npm run setup:gui`. |
| `tools/check-env-example-sync.mjs` | Manifest coverage audit | Scans referenced env keys against `CONFIG_MANIFEST_KEYS`; it does not compare `.env` to `.env.example`. |

## Runtime-Created Files And Directories

| Path | Source | Notes |
|------|--------|-------|
| `.workspace/db/app.sqlite` | `src/app/api/bootstrap/createBootstrapSessionLayer.js` | Global AppDb. |
| `.workspace/db/<category>/spec.sqlite` | `src/app/api/specDbRuntime.js` | Per-category SpecDb. |
| `.workspace/output/` | `src/core/config/runtimeArtifactRoots.js` | Output root. |
| `.workspace/runs/` | `src/core/config/runtimeArtifactRoots.js` | IndexLab run artifacts. |
| `.workspace/products/` | `src/core/config/runtimeArtifactRoots.js` | Product checkpoint root. |
| `.workspace/global/` | `src/core/config/runtimeArtifactRoots.js` | Boot-time user settings fallback root. |
| `.workspace/runtime/snapshots/` | `src/core/config/runtimeArtifactRoots.js` | GUI-written per-run settings snapshots. |

## Fast Navigation Hints

| If you need to know... | Go here first |
|------------------------|---------------|
| Mounted backend route order | `src/app/api/guiServerRuntime.js` |
| Frontend routed pages | `tools/gui-react/src/registries/pageRegistry.ts` |
| API client call pattern | `tools/gui-react/src/api/client.ts` |
| Config/env key inventory | `src/shared/settingsRegistry.js`, `src/core/config/manifest.js` |
| DB schema + migrations | `src/db/specDbSchema.js`, `src/db/appDbSchema.js`, `src/db/specDbMigrations.js` |
| Storage API contract | `src/features/indexing/api/storageManagerRoutes.js` |

## Read Next

- [Conventions](./conventions.md)
- [System Map](../03-architecture/system-map.md)
- [Feature Index](../04-features/feature-index.md)

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/guiServerRuntime.js` | runtime entrypoint location and route-assembly ownership |
| source | `src/app/api/bootstrap/createBootstrapSessionLayer.js` | AppDb bootstrap path |
| source | `src/app/api/specDbRuntime.js` | per-category SpecDb path |
| source | `src/core/config/runtimeArtifactRoots.js` | default `.workspace` runtime roots |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route inventory and feature folders |
| config | `package.json` | root file list and scripts |
| config | `playwright.config.ts` | `e2e/` ownership |
| source | `tools/check-env-example-sync.mjs` | utility script location and actual purpose |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage API contract location |
| filesystem | repo root | current top-level directories and files on disk |

## Related Documents

- [Scope](./scope.md) - defines which folders belong to the live product boundary.
- [Conventions](./conventions.md) - explains how these folders are expected to be extended.
- [System Map](../03-architecture/system-map.md) - maps these paths onto runtime relationships.
- [Feature Index](../04-features/feature-index.md) - links folder ownership to feature docs.

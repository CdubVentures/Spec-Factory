# Conventions

> **Purpose:** Capture the repo rules, extension points, and anti-assumptions an LLM needs before editing.
> **Prerequisites:** [scope.md](./scope.md), [folder-map.md](./folder-map.md)
> **Last validated:** 2026-04-07

## Hard Rules

- Rule files: `AGENTS.md`, `AGENTS.testing.md`, `AGENTS.testsCleanUp.md`, `CLAUDE.md`.
- Backend source under `src/**/*.js` is JavaScript ESM. Do not introduce TypeScript syntax there.
- GUI source under `tools/gui-react/` is TypeScript + React. Do not add `@ts-ignore`, `@ts-nocheck`, or broad `any` escapes.
- New feature logic belongs in an existing feature boundary under `src/features/` or `tools/gui-react/src/features/`, not in new generic `utils` or `services` dumping grounds.
- Current test runner is Node's built-in runner from `package.json`:

```json
"test": "node --test --test-force-exit"
```

- Repo-local scratch for tests and one-off tooling should default to `.tmp/`. Do not create temp trees under `test/`.

## Canonical Ownership

| Concern | Source of truth | Do not assume |
|---------|-----------------|---------------|
| Mounted backend route order | `src/app/api/guiServerRuntime.js` `routeDefinitions` (15 route families: infra, config, indexlab, runtimeOps, catalog, brand, color, colorEditionFinder, studio, dataAuthority, queueBillingLearning, review, sourceStrategy, specSeeds, testMode) | `src/app/api/routeRegistry.js` is only the registry builder, not the mounted-order authority |
| GUI routed pages | `tools/gui-react/src/registries/pageRegistry.ts` | `tools/gui-react/src/App.tsx` alone is not the page inventory |
| GUI shell | `tools/gui-react/src/pages/layout/AppShell.tsx` | Page components should not reimplement app shell framing |
| API calls from GUI | `tools/gui-react/src/api/client.ts` and feature hooks built on top of it | Raw `fetch` scattered through page components |
| Runtime/config key inventory | `src/shared/settingsRegistry.js` and `src/core/config/manifest.js` | Ad hoc env parsing outside the registry/manifest flow |
| Storage API surface | `src/features/indexing/api/storageManagerRoutes.js` mounted through `src/features/indexing/api/indexlabRoutes.js` | A separate top-level storage registrar in `routeDefinitions` |

## Placement Rules

| When adding... | Put it here | Pattern source |
|----------------|------------|----------------|
| Backend route family | `src/features/<feature>/api/` or `src/app/api/routes/` | `src/features/color-registry/api/colorRoutes.js`, `src/app/api/routes/infraRoutes.js` |
| Route-context construction | `src/features/<feature>/api/*RouteContext.js` or `src/app/api/*RouteContext.js` | `src/features/color-registry/api/colorRouteContext.js`, `src/features/indexing/api/runtimeOpsRouteContext.js` |
| CLI command | `src/app/cli/commands/` plus loader wiring in `src/app/cli/spec.js` | `src/app/cli/commands/pipelineCommands.js` |
| GUI page | `tools/gui-react/src/features/**` or `tools/gui-react/src/pages/**` with registry entry in `tools/gui-react/src/registries/pageRegistry.ts` | `tools/gui-react/src/features/color-registry/components/ColorRegistryPage.tsx` |
| Shared backend persistence | `src/db/` or authored files under `category_authority/` | New mutable JSON stores outside established roots |
| Doc update | `CLAUDE.md` or `docs/01-` through `docs/07-` | Reintroducing unnumbered current-state doc trees |

## Dependency Direction

- `src/app/api/` composes feature registrars and route contexts; it should stay thin.
- Feature modules in `src/features/` may depend on `src/core/`, `src/db/`, and `src/shared/`.
- GUI pages should depend on feature modules, shared UI, stores, and API helpers; they should not embed unrelated backend knowledge directly.
- Route-context creators are the place to bind infra dependencies like `appDb`, `getSpecDb`, `broadcastWs`, config accessors, and storage adapters.

## Config And Env Rules

- Default dotenv path is `.env`, loaded by `loadDotEnvFile(args.env || '.env')` in `src/app/cli/spec.js`.
- `npm run env:check` executes `tools/check-env-example-sync.mjs`, which scans a fixed file list for referenced env keys and compares them with `CONFIG_MANIFEST_KEYS`.
- The env/config inventory is maintained through:
  - `src/shared/settingsRegistry.js`
  - `src/core/config/manifest.js`
  - `src/features/settings-authority/`
- `PORT` is currently referenced but missing from the manifest coverage script baseline; `npm run env:check` fails on that mismatch as of 2026-04-07.

## Runtime And Storage Rules

- `/api/v1/storage/*` is handled inside `registerIndexlabRoutes()` in `src/features/indexing/api/indexlabRoutes.js`.
- Storage deletion flows use `createDeletionStore()` from `src/db/stores/deletionStore.js` when a category-specific SpecDb is available.
- Current validated storage backend is local filesystem storage. `src/features/indexing/api/storageManagerRoutes.js` returns `storage_backend: "local"` from `resolveBackend()`.
- Runtime artifact roots come from `src/core/config/runtimeArtifactRoots.js`; do not hardcode alternate workspace roots unless you are intentionally adding a config boundary.
- `.workspace/` remains the sole runtime data directory. `.tmp/` is allowed only for repo-local throwaway test/tool scratch and must not hold runtime state.
- Root `tmp/` remains banned.
- Use `os.tmpdir()` only when a subsystem intentionally depends on OS temp semantics or system-native temp behavior.

## Frontend Routing Rules

- `tools/gui-react/src/App.tsx` derives routed pages from `ROUTE_ENTRIES` in `tools/gui-react/src/registries/pageRegistry.ts`.
- Tab groups are `global`, `catalog`, `ops`, and `settings`.
- `test-mode` is intentionally outside the tab registry and is mounted separately in `tools/gui-react/src/App.tsx`.
- New routable pages require both:
  - a component module
  - a registry entry in `tools/gui-react/src/registries/pageRegistry.ts`

## Validation Baseline

| Command / proof | Result | Date |
|-----------------|--------|------|
| `npm run gui:build` | pass | 2026-04-07 |
| `npm test` | pass | 2026-04-07 |
| `npm run env:check` | fail (`Missing keys in config manifest: PORT`) | 2026-04-07 |
| Runtime smoke against `createGuiServerRuntime()` | pass for `/health`, `/api/v1/categories`, `/api/v1/process/status`, `/api/v1/storage/overview` | 2026-04-07 |

## Read Next

- [Canonical Examples](../07-patterns/canonical-examples.md)
- [Anti-Patterns](../07-patterns/anti-patterns.md)
- [Environment and Config](../02-dependencies/environment-and-config.md)

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `AGENTS.md` | test audit and retirement agent rules |
| source | `AGENTS.testing.md` | testing rules |
| source | `AGENTS.testsCleanUp.md` | test-cleanup rules |
| source | `CLAUDE.md` | LLM-first repo guidance |
| source | `src/app/api/guiServerRuntime.js` | mounted route-order authority |
| source | `src/features/indexing/api/indexlabRoutes.js` | delegated `/storage/*` routing pattern |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | frontend route registry convention |
| source | `tools/gui-react/src/App.tsx` | registry-driven `HashRouter` assembly |
| source | `package.json` | Node test runner convention |
| command | `npm run gui:build` | GUI build validation result on 2026-04-07 |
| command | `npm run env:check` | env-check failure baseline on 2026-04-07 |
| command | `npm test` | test-suite validation result on 2026-04-07 |

## Related Documents

- [Scope](./scope.md) - sets the project boundary these conventions apply to.
- [Folder Map](./folder-map.md) - shows where each convention applies on disk.
- [Canonical Examples](../07-patterns/canonical-examples.md) - concrete examples of the approved patterns.
- [Anti-Patterns](../07-patterns/anti-patterns.md) - explicit examples of what the repo expects you to avoid.

# Conventions

> **Purpose:** Capture the repo rules, extension points, and anti-assumptions an LLM needs before editing.
> **Prerequisites:** [scope.md](./scope.md), [folder-map.md](./folder-map.md)
> **Last validated:** 2026-04-10

## Hard Rules

- Rule files:
  - `AGENTS.md`
  - `AGENTS.testing.md`
  - `AGENTS.testsCleanUp.md`
  - `CLAUDE.md`
- Backend source under `src/**/*.js` is JavaScript ESM. Do not introduce TypeScript syntax there.
- GUI source under `tools/gui-react/` is TypeScript + React. Do not add `@ts-ignore`, `@ts-nocheck`, or broad `any` escapes.
- New feature logic belongs in an existing feature boundary under `src/features/` or `tools/gui-react/src/features/`, not in new generic dumping grounds.
- Current test runner is Node's built-in runner from `package.json`:

```json
"test": "node --test --test-force-exit"
```

- Repo-local scratch for tests and one-off tooling should default to `.tmp/`. Do not create runtime state outside `.workspace/`.

## Canonical Ownership

| Concern | Source of truth | Do not assume |
|---------|-----------------|---------------|
| Mounted backend route order | `src/app/api/guiServerRuntime.js` `routeDefinitions` (`17` route families: infra, config, indexlab, runtimeOps, catalog, brand, color, unitRegistry, colorEditionFinder, studio, dataAuthority, queueBillingLearning, review, publisher, sourceStrategy, specSeeds, testMode) | `src/app/api/routeRegistry.js` is the registry builder, not the mounted-order authority |
| GUI routed pages | `tools/gui-react/src/registries/pageRegistry.ts` | `tools/gui-react/src/App.tsx` alone is not the page inventory |
| GUI shell | `tools/gui-react/src/pages/layout/AppShell.tsx` | page components should not reimplement shell framing |
| API calls from GUI | `tools/gui-react/src/api/client.ts` and feature hooks built on top of it | raw `fetch` scattered through page components |
| Runtime/config key inventory | `src/shared/settingsRegistry.js` and `src/core/config/manifest/index.js` | ad hoc env parsing outside the registry/manifest flow |
| Storage API surface | `src/features/indexing/api/storageManagerRoutes.js` mounted through `src/features/indexing/api/indexlabRoutes.js` | a separate top-level storage registrar in `routeDefinitions` |

## Placement Rules

| When adding... | Put it here | Pattern source |
|----------------|------------|----------------|
| Backend route family | `src/features/<feature>/api/` or `src/app/api/routes/` | `src/features/color-registry/api/colorRoutes.js`, `src/features/unit-registry/api/unitRegistryRoutes.js`, `src/app/api/routes/infraRoutes.js` |
| Route-context construction | `src/features/<feature>/api/*RouteContext.js` or `src/app/api/*RouteContext.js` | `src/features/color-registry/api/colorRouteContext.js`, `src/features/publisher/api/publisherRouteContext.js`, `src/features/indexing/api/runtimeOpsRouteContext.js` |
| CLI command | `src/app/cli/commands/` plus loader wiring in `src/app/cli/spec.js` | `src/app/cli/commands/pipelineCommands.js` |
| GUI page | `tools/gui-react/src/features/**` or `tools/gui-react/src/pages/**` with registry entry in `tools/gui-react/src/registries/pageRegistry.ts` | `tools/gui-react/src/features/color-registry/components/ColorRegistryPage.tsx`, `tools/gui-react/src/pages/unit-registry/UnitRegistryPage.tsx`, `tools/gui-react/src/pages/publisher/PublisherPage.tsx` |
| Shared backend persistence | `src/db/` or authored files under `category_authority/` | new mutable JSON stores outside established roots |
| Doc update | `CLAUDE.md` or `docs/01-` through `docs/07-` | reintroducing unnumbered current-state doc trees |

## Dependency Direction

- `src/app/api/` composes feature registrars and route contexts; it should stay thin.
- Feature modules in `src/features/` may depend on `src/core/`, `src/db/`, and `src/shared/`.
- GUI pages should depend on feature modules, shared UI, stores, and API helpers; they should not embed unrelated backend knowledge directly.
- Route-context creators are where infra dependencies like `appDb`, `getSpecDb`, `broadcastWs`, config accessors, and storage adapters are bound.

## Config And Env Rules

- Default dotenv path is `.env`, loaded by `loadDotEnvFile(args.env || '.env')` in `src/app/cli/spec.js`.
- `npm run env:check` executes `tools/check-env-example-sync.mjs`, which scans a fixed file list for referenced env keys and compares them with `CONFIG_MANIFEST_KEYS`.
- The env/config inventory is maintained through:
  - `src/shared/settingsRegistry.js`
  - `src/core/config/manifest/index.js`
  - `src/features/settings-authority/`
- `PORT` is currently referenced but missing from the manifest coverage baseline; `npm run env:check` fails on that mismatch as of 2026-04-10.

## Frontend Routing Rules

- `tools/gui-react/src/App.tsx` derives routed pages from `ROUTE_ENTRIES` in `tools/gui-react/src/registries/pageRegistry.ts`.
- Tab groups are `global`, `catalog`, `ops`, and `settings`.
- `/test-mode` is intentionally outside `PAGE_REGISTRY` and is mounted separately in `App.tsx`.
- New routable pages require both:
  - a component module
  - a registry entry in `tools/gui-react/src/registries/pageRegistry.ts`

## Validation Baseline

| Command / proof | Result | Date |
|-----------------|--------|------|
| `npm run gui:build` | pass | 2026-04-10 |
| `npm test` | fail (`7778` passed / `10` failed / `7788` total) | 2026-04-10 |
| `npm run env:check` | fail (`Missing keys in config manifest: PORT`) | 2026-04-10 |
| Runtime smoke against `createGuiServerRuntime()` | pass for `/health`, `/api/v1/categories`, `/api/v1/process/status`, `/api/v1/storage/overview` | 2026-04-10 |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `AGENTS.md` | repo-wide operating rules |
| source | `AGENTS.testing.md` | testing rules |
| source | `AGENTS.testsCleanUp.md` | test-cleanup rules |
| source | `CLAUDE.md` | root LLM-first repo guidance |
| source | `src/app/api/guiServerRuntime.js` | mounted route-order authority |
| source | `src/app/api/routeRegistry.js` | stale `GUI_API_ROUTE_ORDER` vs live runtime |
| source | `src/features/indexing/api/indexlabRoutes.js` | delegated `/storage/*` routing pattern |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | frontend route registry convention |
| source | `tools/gui-react/src/App.tsx` | registry-driven `HashRouter` assembly |
| source | `package.json` | Node test runner convention |
| command | `npm run gui:build` | GUI build validation result on 2026-04-10 |
| command | `npm run env:check` | env-check failure baseline on 2026-04-10 |
| command | `npm test` | test-suite validation result on 2026-04-10 |

## Related Documents

- [Scope](./scope.md) - sets the project boundary these conventions apply to.
- [Folder Map](./folder-map.md) - shows where each convention applies on disk.
- [Canonical Examples](../07-patterns/canonical-examples.md) - concrete examples of the approved patterns.
- [Anti-Patterns](../07-patterns/anti-patterns.md) - explicit examples of what the repo expects you to avoid.

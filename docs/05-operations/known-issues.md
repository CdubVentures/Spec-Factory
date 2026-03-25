# Known Issues

> **Purpose:** Record verified bugs, drift, and operator gotchas so arriving agents do not mistake them for newly introduced regressions.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/auth-and-sessions.md](../03-architecture/auth-and-sessions.md)
> **Last validated:** 2026-03-25

## Current Issues

| Issue | Impact | Workaround | Tracked in |
|-------|--------|------------|------------|
| `Dockerfile` launches `src/cli/run-batch.js`, which does not exist | container build is not a valid deployment path as written | use `npm run gui:start` for the local runtime or `node src/cli/spec.js run-batch ...` for CLI batching | `Dockerfile`, `src/cli/spec.js` |
| `ReviewPage` still posts `POST /api/v1/review/:category/finalize`, but no audited HTTP handler serves that route | Ctrl+S/finalize actions on the scalar review page can hit a stale client path instead of a live mutation | use the live scalar review mutations (`override`, `manual-override`, `key-review-confirm`, `key-review-accept`) and treat `finalize` as a client drift bug until code changes are commissioned | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `src/features/review/api/reviewRoutes.js`, `src/features/review/api/itemMutationRoutes.js` |
| `src/app/api/routeRegistry.js` still exports `GUI_API_ROUTE_ORDER`, but the constant omits the live `specSeeds` route and is not the mounted route authority | agents or maintainers who extend docs/tools from the stale constant can miss `/api/v1/spec-seeds` and drift from the real server surface | treat `src/api/guiServerRuntime.js` `routeDefinitions` as the server-route SSOT; use `GUI_API_ROUTE_ORDER` only as historical/stale implementation residue until code changes are commissioned | `src/app/api/routeRegistry.js`, `src/api/guiServerRuntime.js`, `src/features/indexing/api/specSeedsRoutes.js` |
| `npm run env:check` currently fails because `.env.example` does not define `PORT`, and the checker still only scans a narrow fixed file list | the env-parity check is both failing and easy to over-read as broader coverage than it provides | add `PORT` to `.env.example` if env parity is meant to be complete, but still treat `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, and `src/config.js` as the SSOT | `tools/check-env-example-sync.mjs`, `.env.example`, `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, `src/config.js` |
| `POST /api/v1/test-mode/run` remains effectively non-functional because `runTestProduct` is stubbed in `src/app/api/routes/testModeRouteContext.js` | test-mode can create/generate/validate categories, but the run step returns per-product error rows until the runner is rebuilt | use create/generate/validate flows only, and treat the run step as intentionally broken pending new crawl-first runner work | `src/app/api/routes/testModeRouteContext.js`, `src/app/api/routes/testModeRoutes.js` |
| Many review, studio, and runtime-ops endpoints return `503 specdb_not_ready` until a category has been compiled and seeded into SQLite | fresh categories can look broken until authority artifacts are compiled and synced | compile the category, seed/sync SpecDb, or use a pre-seeded category before using these surfaces | `src/features/studio/api/studioRoutes.js`, `src/features/review/api/routeSharedHelpers.js`, `src/features/indexing/api/runtimeOpsRoutes.js` |
| `/api/v1/categories` returns `tests`, but `category_authority/tests/` does not include `sources.json` like the authored product categories | any audit or automation that assumes every category has file-backed source strategy definitions will mis-handle the harness category | special-case `tests` when reading per-category source policy, or ignore it for source-strategy inventory | `category_authority/tests/`, `src/app/api/routes/infra/categoryRoutes.js` |

## Notes

- Current proof snapshot on 2026-03-25:
  - `npm run env:check` fails with `Missing keys in config manifest: PORT`.
  - `npm run gui:build` passes and writes the current `tools/gui-react/dist/` bundle.
  - `http://127.0.0.1:8788/api/v1/health` responds with `{ ok: true, service: "gui-server", dist_root, cwd, isPkg: false }`.
  - `http://127.0.0.1:8788/api/v1/categories` currently returns `["keyboard","monitor","mouse","tests"]`.
  - `npm test` passed on the audited worktree with `5827` passing tests.
- No verified login/session middleware protects the live GUI/API server. Treat the runtime as a trusted-network local tool unless that architecture changes.
- Removed modules from the pipeline rework should be treated as deleted unless a current file path in this doc set says otherwise.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `Dockerfile` | stale CLI entrypoint mismatch |
| source | `src/cli/spec.js` | supported CLI batch entrypoint |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | stale client `finalize` mutation path |
| source | `src/features/review/api/reviewRoutes.js` | review route families do not expose a live `finalize` HTTP mutation |
| source | `src/features/review/api/itemMutationRoutes.js` | live scalar review mutation actions stop at override/manual/key-review paths |
| source | `src/app/api/routeRegistry.js` | stale exported route-order constant omits `specSeeds` |
| source | `src/api/guiServerRuntime.js` | live mounted route list includes `specSeeds` |
| source | `src/app/api/routes/testModeRouteContext.js` | stubbed test-mode run path |
| source | `src/app/api/routes/infra/categoryRoutes.js` | categories endpoint includes `tests` in the current inventory |
| source | `src/features/studio/api/studioRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/review/api/routeSharedHelpers.js` | review routes emit `503 specdb_not_ready` before SpecDb is ready |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | runtime-ops endpoints depend on seeded runtime/SpecDb state |
| source | `tools/check-env-example-sync.mjs` | fixed-scope env-check behavior and stale scan list |
| command | `npm run env:check` | current env-check output fails with `Missing keys in config manifest: PORT` |
| command | `npm run gui:build` | current GUI build baseline is green on the audited worktree |
| command | `npm test` | current full-suite baseline is green on the audited worktree (`5827` passing tests) |
| runtime | `http://127.0.0.1:8788/api/v1/health` | live health endpoint responded during the audit |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory includes `tests` |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Full config surface behind the `.env.example` drift.
- [Deployment](./deployment.md) - Explains why Docker is not the verified runtime path.
- [API Surface](../06-references/api-surface.md) - Shows which endpoints are affected by `specdb_not_ready`.

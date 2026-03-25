# Known Issues

> **Purpose:** Record verified bugs, drift, and operator gotchas so arriving agents do not mistake them for newly introduced regressions.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/auth-and-sessions.md](../03-architecture/auth-and-sessions.md)
> **Last validated:** 2026-03-24

## Current Issues

| Issue | Impact | Workaround | Tracked in |
|-------|--------|------------|------------|
| `Dockerfile` launches `src/cli/run-batch.js`, which does not exist | container build is not a valid deployment path as written | use `npm run gui:start` for the local runtime or `node src/cli/spec.js run-batch ...` for CLI batching | `Dockerfile`, `src/cli/spec.js` |
| `ReviewPage` still posts `POST /api/v1/review/:category/finalize`, but no audited HTTP handler serves that route | Ctrl+S/finalize actions on the scalar review page can hit a stale client path instead of a live mutation | use the live scalar review mutations (`override`, `manual-override`, `key-review-confirm`, `key-review-accept`) and treat `finalize` as a client drift bug until code changes are commissioned | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `src/features/review/api/reviewRoutes.js` |
| Many review, studio, runtime-ops, and test harness flows fail because `src/features/indexing/pipeline/shared/queryPlan.js` imports a missing `normalizeHost` export from `discoveryIdentity.js` | API/GUI harnesses that boot the server exit early, and multiple review/runtime tests fail before assertions run | treat this as an active module-boundary regression and avoid using those red suites as a clean baseline until the export contract is fixed | `src/features/indexing/pipeline/shared/queryPlan.js`, `src/features/indexing/pipeline/shared/discoveryIdentity.js` |
| Brand-resolver tests still import a missing module path, `src/features/indexing/search/index.js` | `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js` fails before exercising brand-resolution logic | do not use the current brand-resolver test result as proof until the missing module contract is restored or the test is updated | `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js` |
| Catalog type-alignment contract expects a `QueueProduct` interface that is not present in the generated types source | `src/features/catalog/contracts/tests/productShapeAlignment.test.js` fails even if runtime code is otherwise unchanged | treat the generated-type alignment suite as drifted until the interface contract and generated types are reconciled | `src/features/catalog/contracts/tests/productShapeAlignment.test.js`, `tools/gui-react/src/features/catalog/contracts/types.generated.ts` |
| Several API harness suites time out waiting for health on ephemeral ports | server-boot contract tests can sit for 25 seconds and then fail with readiness timeouts | use direct runtime checks (`/api/v1/health`, `gui:build`) as the current proof path until the harness boot path is repaired | `src/shared/tests/runtimeSettingsApi.test.js`, `src/api/tests/helpers/guiServerHttpHarness.js` |
| `npm run env:check` passes, but it only scans the fixed `FILES_TO_SCAN` list in `tools/check-env-example-sync.mjs`, including two paths that no longer exist | a passing env-check is easy to over-read as full manifest coverage when it is only a narrow reference scan | treat `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, and `src/config.js` as the SSOT; treat `env:check` as a small guardrail only | `tools/check-env-example-sync.mjs`, `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, `src/config.js` |
| `POST /api/v1/test-mode/run` remains effectively non-functional because `runTestProduct` is stubbed in `src/app/api/routes/testModeRouteContext.js` | test-mode can create/generate/validate categories, but the run step returns per-product error rows until the runner is rebuilt | use create/generate/validate flows only, and treat the run step as intentionally broken pending new crawl-first runner work | `src/app/api/routes/testModeRouteContext.js`, `src/app/api/routes/testModeRoutes.js` |
| Many review, studio, and runtime-ops endpoints return `503 specdb_not_ready` until a category has been compiled/seeded into SQLite | fresh categories can look broken until authority artifacts are compiled and synced | compile the category, seed/sync SpecDb, or use a pre-seeded category before using these surfaces | `src/features/studio/api/studioRoutes.js`, `src/features/review/api/reviewRoutes.js`, `src/features/indexing/api/runtimeOpsRoutes.js` |

## Notes

- Current proof snapshot on 2026-03-24:
  - `npm run env:check` passes with `OK (3 referenced keys covered)`.
  - `npm run gui:build` passes.
  - `http://127.0.0.1:8788/api/v1/health` responds with `{ ok: true, service: "gui-server", dist_root, cwd, isPkg: false }`.
  - `http://127.0.0.1:8788/api/v1/categories` currently returns `["gaming_mice","keyboard","monitor","mouse","tests"]`.
  - `npm test` is red on the active worktree with the failure clusters listed above; the older 2026-03-23 failure count is no longer the authoritative baseline.
- Auth-related environment variables exist, but no verified login/session middleware protects the live GUI/API server. Treat the runtime as a trusted-network local tool unless that architecture changes.
- Removed modules from the pipeline rework should be treated as deleted unless a current file path in this doc set says otherwise.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `Dockerfile` | stale CLI entrypoint mismatch |
| source | `src/cli/spec.js` | supported CLI batch entrypoint |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | stale client `finalize` mutation path |
| source | `src/features/review/api/reviewRoutes.js` | no live `finalize` endpoint |
| source | `src/features/indexing/pipeline/shared/queryPlan.js` | missing `normalizeHost` export import site |
| source | `src/features/indexing/pipeline/shared/discoveryIdentity.js` | export surface currently does not satisfy `queryPlan.js` import |
| source | `src/features/indexing/pipeline/brandResolver/tests/brandResolver.test.js` | missing `src/features/indexing/search/index.js` import path |
| source | `src/features/catalog/contracts/tests/productShapeAlignment.test.js` | `QueueProduct` type-alignment failure site |
| source | `src/shared/tests/runtimeSettingsApi.test.js` | harness timeout failure site |
| source | `src/api/tests/helpers/guiServerHttpHarness.js` | health-readiness timeout behavior |
| source | `src/app/api/routes/testModeRouteContext.js` | stubbed test-mode run path |
| source | `src/features/studio/api/studioRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | seeded-runtime expectations for runtime panels |
| source | `tools/check-env-example-sync.mjs` | fixed-scope env-check behavior and stale scan list |
| command | `npm run env:check` | current env-check output is `OK (3 referenced keys covered)` |
| command | `npm run gui:build` | GUI build succeeds on the current worktree |
| command | `npm test` | current full-suite baseline is red on the active worktree |
| runtime | `http://127.0.0.1:8788/api/v1/health` | live health endpoint responded during the audit |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory includes `tests` |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Full config surface behind the `.env.example` drift.
- [Deployment](./deployment.md) - Explains why Docker is not the verified runtime path.
- [API Surface](../06-references/api-surface.md) - Shows which endpoints are affected by `specdb_not_ready`.

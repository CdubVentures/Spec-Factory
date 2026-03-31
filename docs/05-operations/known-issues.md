# Known Issues

> **Purpose:** Record verified bugs, drift, and operator gotchas so arriving agents do not mistake them for newly introduced regressions.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/auth-and-sessions.md](../03-architecture/auth-and-sessions.md)
> **Last validated:** 2026-03-30

## Current Issues

| Issue | Impact | Workaround | Tracked in |
|-------|--------|------------|------------|
| `GET /api/v1/llm-policy` and `GET /api/v1/indexing/llm-config` are unauthenticated and can return secret-bearing fields when configured | trusted-network assumption is currently part of the runtime contract; exposing the server outside that boundary leaks configuration secrets | keep the server on a trusted local network only until auth hardening is explicitly commissioned | `src/features/settings-authority/llmPolicyHandler.js`, `src/features/settings/api/configIndexingMetricsHandler.js` |
| `npm test` failed on 2026-03-30 | there is no green full-suite baseline for the current worktree | treat failing suites as existing repo state unless your change clearly affects them; re-run targeted suites around touched areas | `src/indexlab/tests/searchPlanBuilder.payload.test.js`, `tools/gui-react/src/features/review/__tests__/reviewLaneGuiContracts.test.js`, `tools/gui-react/src/features/runtime-ops/**`, `tools/gui-react/src/pages/layout/__tests__/tabNavContract.test.js` |
| `npm run env:check` currently fails because `.env.example` does not define `PORT`, and the checker still only scans a narrow fixed file list | the env-parity check is both failing and easy to over-read as broader coverage than it provides | use `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, and `src/config.js` as the config SSOT chain | `tools/check-env-example-sync.mjs`, `.env.example`, `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, `src/config.js` |
| `Dockerfile` launches `src/cli/run-batch.js`, which does not exist | container build is not a valid deployment path as written | use `npm run gui:start` for the local runtime or `node src/cli/spec.js run-batch ...` for CLI batching | `Dockerfile`, `src/cli/spec.js` |
| `ReviewPage` still posts `POST /api/v1/review/:category/finalize`, but no audited handler serves that route | Ctrl+S/finalize actions on the scalar review page can hit a stale client path instead of a live mutation | use the live scalar review mutations (`override`, `manual-override`, `key-review-confirm`, `key-review-accept`) and treat `finalize` as client drift | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `src/features/review/api/reviewRoutes.js`, `src/features/review/api/itemMutationRoutes.js` |
| `src/app/api/routeRegistry.js` still exports `GUI_API_ROUTE_ORDER`, but the constant omits the live `specSeeds` route and is not the mounted route authority | tools or docs derived from the stale constant drift from the real server surface | treat `src/api/guiServerRuntime.js` `routeDefinitions` as the route-order SSOT | `src/app/api/routeRegistry.js`, `src/api/guiServerRuntime.js`, `src/features/indexing/api/specSeedsRoutes.js` |
| The current source tree mounts no `/api/v1/storage-settings` route, but older tests and assumptions still reference that surface | docs or tests that assume a storage-settings API will drift from the live server | treat `/api/v1/storage/*` as the active storage surface and `src/features/settings/api/configRoutes.js` as the route authority | `src/features/settings/api/configRoutes.js`, `src/features/settings/api/tests/settingsEnvelopeContract.test.js`, `tools/gui-react/src/stores/__tests__/settingsUnloadGuardContracts.test.js` |
| (RESOLVED) `POST /api/v1/test-mode/run` was non-functional because `runTestProduct` was stubbed | Rebuilt in `src/testing/testRunner.js` — consensus + normalization + validation pipeline now runs synthetic products | all four test-mode workflow steps (create, generate, run, validate) are functional | `src/testing/testRunner.js`, `src/app/api/routes/testModeRouteContext.js` |
| Many review, studio, and runtime-ops endpoints return `503 specdb_not_ready` until a category has been compiled and seeded into SQLite | fresh categories can look broken until authority artifacts are compiled and synced | compile the category, seed/sync SpecDb, or use a pre-seeded category before using these surfaces | `src/features/studio/api/studioRoutes.js`, `src/features/review/api/routeSharedHelpers.js`, `src/features/indexing/api/runtimeOpsRoutes.js` |
| `category_authority/tests/` exists on disk, but the default categories API intentionally filters it out | scripts or docs that infer live categories from the filesystem can drift from the HTTP contract | use `GET /api/v1/categories` for the live category list; treat `tests/` as harness-only repo content | `category_authority/tests/`, `src/app/api/routes/infra/categoryRoutes.js` |

## Notes

- Validation snapshot collected on 2026-03-30:
  - `npm run gui:build` passed.
  - `npm run env:check` failed with `Missing keys in config manifest: PORT`.
  - `npm test` failed.
  - `GET http://127.0.0.1:8788/api/v1/health` responded successfully.
  - `GET http://127.0.0.1:8788/api/v1/categories` returned `["keyboard","monitor","mouse"]`.
  - `GET http://127.0.0.1:8788/api/v1/process/status` returned `running: false` while retaining the last failed run metadata.
  - `GET http://127.0.0.1:8788/api/v1/storage/overview` returned a live payload with `storage_backend: "disabled"`.
- No verified login/session middleware protects the live GUI/API server.
- Removed modules from the older storage-settings and relocation path should be treated as deleted unless a current file path in this doc set says otherwise.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/features/settings-authority/llmPolicyHandler.js` | unauthenticated `/llm-policy` response surface |
| source | `src/features/settings/api/configIndexingMetricsHandler.js` | unauthenticated `/indexing/llm-config` resolved-key exposure |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | stale client `finalize` mutation path |
| source | `src/features/review/api/reviewRoutes.js` | review route families do not expose a live `finalize` HTTP mutation |
| source | `src/features/review/api/itemMutationRoutes.js` | live scalar review mutation actions |
| source | `src/app/api/routeRegistry.js` | stale exported route-order constant omits `specSeeds` |
| source | `src/api/guiServerRuntime.js` | live mounted route list includes `specSeeds` |
| source | `src/features/settings/api/configRoutes.js` | no live `storage-settings` route is mounted |
| source | `src/app/api/routes/testModeRouteContext.js` | stubbed test-mode run path |
| source | `src/app/api/routes/infra/categoryRoutes.js` | default categories API excludes `tests` |
| source | `src/features/studio/api/studioRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/review/api/routeSharedHelpers.js` | review routes emit `503 specdb_not_ready` before SpecDb is ready |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | runtime-ops endpoints depend on seeded SpecDb state |
| source | `tools/check-env-example-sync.mjs` | fixed-scope env-check behavior |
| command | `npm run env:check` | failing March 30 env-check result |
| command | `npm run gui:build` | successful March 30 GUI build result |
| command | `npm test` | failing March 30 suite result |
| runtime | `http://127.0.0.1:8788/api/v1/health` | live health endpoint responded |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory excludes the harness directory |
| runtime | `http://127.0.0.1:8788/api/v1/process/status` | live idle process-status payload retained last-run metadata |
| runtime | `http://127.0.0.1:8788/api/v1/storage/overview` | live storage overview payload responded |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Config surface behind the env and LLM issues.
- [Deployment](./deployment.md) - Explains why Docker is not the verified runtime path.
- [API Surface](../06-references/api-surface.md) - Endpoint contract details for the affected surfaces.

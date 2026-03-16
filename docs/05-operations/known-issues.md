# Known Issues

> **Purpose:** Record verified bugs, gaps, and operator gotchas so arriving agents do not mistake them for newly introduced regressions.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/auth-and-sessions.md](../03-architecture/auth-and-sessions.md)
> **Last validated:** 2026-03-15

## Current Issues

| Issue | Impact | Workaround | Tracked in |
|-------|--------|------------|------------|
| `Dockerfile` launches `src/cli/run-batch.js`, which does not exist | container build is not a valid deployment path as written | use `npm run gui:start` for the local runtime or `node src/cli/spec.js run-batch ...` for CLI batching | `Dockerfile`, `src/cli/spec.js` |
| `.env.example` is missing config-manifest keys; `npm run env:check` fails as of 2026-03-15 | setup docs and copied env templates can omit live knobs such as request-rate and feature-enable flags | run `npm run env:check` after env changes and add the missing keys before relying on `.env.example` as a mirror | `.env.example`, `tools/check-env-example-sync.mjs`, `src/core/config/manifest.js` |
| `npm test` audit rerun observed 21 baseline failures on 2026-03-15 | full green-suite validation is not currently available from a clean run; failures span GUI waits, missing GUI modules, type generation, field-rules compiler contracts, and IndexLab endpoint coverage | use `npm run gui:build` as the current smoke check and review the representative failing suites before treating unrelated changes as regressions | `test/convergenceCrossSurfaceGuiPersistencePropagation.test.js`, `test/indexingRuntimeOpsImmediateRunSyncGui.test.js`, `test/runtimeOpsWorkerContractsGui.test.js`, `test/generateTypes.test.js`, `test/guiEndpoints.test.js` |
| `ReviewPage` still posts `POST /api/v1/review/:category/finalize`, but no audited HTTP handler serves that route | Ctrl+S/finalize actions on the scalar review page can hit a stale client path instead of a live mutation | use the live scalar review mutations (`override`, `manual-override`, `key-review-confirm`, `key-review-accept`) and treat `finalize` as a client drift bug until code changes are commissioned | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `src/features/review/api/reviewRoutes.js` |
| Many review, studio, and runtime-ops endpoints return `503 specdb_not_ready` until a category has been compiled/seeded into SQLite | fresh categories can look broken until authority artifacts are compiled and synced | compile the category, seed/sync SpecDb, or use test mode to generate a seeded category before using these surfaces | `src/features/studio/api/studioRoutes.js`, `src/features/review/api/reviewRoutes.js`, `src/features/indexing/api/runtimeOpsRoutes.js` |

## Notes

- Auth-related environment variables exist, but no verified login/session middleware protects the live GUI/API server. Treat the runtime as a trusted-network local tool unless that architecture changes.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `Dockerfile` | stale CLI entrypoint mismatch |
| source | `src/cli/spec.js` | supported CLI batch entrypoint |
| source | `tools/check-env-example-sync.mjs` | env drift check used by `npm run env:check` |
| config | `.env.example` | partial env surface |
| test | `test/convergenceCrossSurfaceGuiPersistencePropagation.test.js` | representative GUI contract baseline failure |
| test | `test/indexingRuntimeOpsImmediateRunSyncGui.test.js` | representative runtime-ops GUI baseline failure |
| test | `test/runtimeOpsWorkerContractsGui.test.js` | representative runtime-ops GUI baseline failure |
| test | `test/generateTypes.test.js` | representative type-generation baseline failure |
| test | `test/guiEndpoints.test.js` | representative GUI IndexLab endpoint baseline failure |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | stale client `finalize` mutation path |
| source | `src/features/studio/api/studioRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/review/api/reviewRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | seeded-runtime expectations for runtime panels |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Full config surface behind the `.env.example` drift.
- [Deployment](./deployment.md) - Explains why Docker is not the verified runtime path.
- [API Surface](../06-references/api-surface.md) - Shows which endpoints are affected by `specdb_not_ready`.

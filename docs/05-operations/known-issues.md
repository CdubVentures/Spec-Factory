# Known Issues

> **Purpose:** Record verified bugs, gaps, and operator gotchas so arriving agents do not mistake them for newly introduced regressions.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/auth-and-sessions.md](../03-architecture/auth-and-sessions.md)
> **Last validated:** 2026-03-16

## Current Issues

| Issue | Impact | Workaround | Tracked in |
|-------|--------|------------|------------|
| `Dockerfile` launches `src/cli/run-batch.js`, which does not exist | container build is not a valid deployment path as written | use `npm run gui:start` for the local runtime or `node src/cli/spec.js run-batch ...` for CLI batching | `Dockerfile`, `src/cli/spec.js` |
| `npm run env:check` still fails because the config manifest is missing 19 referenced keys | the env-sync guard is not a trustworthy completeness proof yet; copied env templates can still omit live knobs such as request throttling and feature-enable flags | use `src/core/config/manifest/*.js` and `src/config.js` as the SSOT, and treat `env:check` as a drift detector that still needs its manifest gaps closed | `.env.example`, `tools/check-env-example-sync.mjs`, `src/config.js`, `src/core/config/manifest/*.js` |
| `ReviewPage` still posts `POST /api/v1/review/:category/finalize`, but no audited HTTP handler serves that route | Ctrl+S/finalize actions on the scalar review page can hit a stale client path instead of a live mutation | use the live scalar review mutations (`override`, `manual-override`, `key-review-confirm`, `key-review-accept`) and treat `finalize` as a client drift bug until code changes are commissioned | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `src/features/review/api/reviewRoutes.js` |
| Many review, studio, and runtime-ops endpoints return `503 specdb_not_ready` until a category has been compiled/seeded into SQLite | fresh categories can look broken until authority artifacts are compiled and synced | compile the category, seed/sync SpecDb, or use test mode to generate a seeded category before using these surfaces | `src/features/studio/api/studioRoutes.js`, `src/features/review/api/reviewRoutes.js`, `src/features/indexing/api/runtimeOpsRoutes.js` |
| `src/indexlab/indexingSchemaPacketsValidator.js` defaults its schema root into the excluded `docs/implementation/ai-indexing-plans/schema/` subtree | moving or deleting those schema JSON files breaks packet validation even though the subtree is outside the maintained reading order | leave the schema files in place or pass an explicit `schemaRoot` when changing that dependency boundary | `src/indexlab/indexingSchemaPacketsValidator.js` |

## Current `env:check` Missing Keys

Observed on 2026-03-16:

- `DOMAIN_REQUEST_BURST`
- `DOMAIN_REQUEST_RPS`
- `ENABLE_CORE_DEEP_GATES`
- `ENABLE_DOMAIN_HINT_RESOLVER_V2`
- `ENABLE_QUERY_COMPILER`
- `ENABLE_QUERY_INDEX`
- `ENABLE_SOURCE_REGISTRY`
- `ENABLE_URL_INDEX`
- `FETCH_BUDGET_MS`
- `FETCH_PER_HOST_CONCURRENCY_CAP`
- `FIELD_RULES_ENGINE_ENFORCE_EVIDENCE`
- `GLOBAL_REQUEST_BURST`
- `GLOBAL_REQUEST_RPS`
- `LLM_FORCE_ROLE_MODEL_PROVIDER`
- `MANUFACTURER_AUTO_PROMOTE`
- `SEARCH_GLOBAL_BURST`
- `SEARCH_GLOBAL_RPS`
- `SEARCH_PER_HOST_BURST`
- `SEARCH_PER_HOST_RPS`

## Notes

- `npm test` is no longer a known issue. The 2026-03-16 audit run passed `5552/5552`.
- Auth-related environment variables exist, but no verified login/session middleware protects the live GUI/API server. Treat the runtime as a trusted-network local tool unless that architecture changes.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `Dockerfile` | stale CLI entrypoint mismatch |
| source | `src/cli/spec.js` | supported CLI batch entrypoint |
| source | `tools/check-env-example-sync.mjs` | env drift check used by `npm run env:check` |
| config | `.env.example` | partial env surface |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | stale client `finalize` mutation path |
| source | `src/features/studio/api/studioRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/review/api/reviewRoutes.js` | `specdb_not_ready` route behavior |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | seeded-runtime expectations for runtime panels |
| source | `src/indexlab/indexingSchemaPacketsValidator.js` | runtime dependency on excluded schema assets |
| command | `npm test` | current full-suite baseline is green |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Full config surface behind the `.env.example` drift.
- [Deployment](./deployment.md) - Explains why Docker is not the verified runtime path.
- [API Surface](../06-references/api-surface.md) - Shows which endpoints are affected by `specdb_not_ready`.

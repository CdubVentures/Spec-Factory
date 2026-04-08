# Known Issues

> **Purpose:** Record verified bugs, drift, and operator gotchas so arriving agents do not mistake them for newly introduced regressions.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/auth-and-sessions.md](../03-architecture/auth-and-sessions.md)
> **Last validated:** 2026-04-07

## Current Issues

| Issue | Impact | Workaround | Tracked in |
|-------|--------|------------|------------|
| `GET /api/v1/runtime-settings`, `GET /api/v1/llm-policy`, and `GET /api/v1/indexing/llm-config` are unauthenticated and can return secret-bearing fields when configured | trusted-network placement is currently part of the runtime contract; exposing the server outside that boundary leaks configuration secrets | keep the server on a trusted local network only until auth hardening is explicitly commissioned | `src/features/settings/api/configRuntimeSettingsHandler.js`, `src/features/settings-authority/llmPolicyHandler.js`, `src/features/settings/api/configIndexingMetricsHandler.js`, `src/core/config/settingsKeyMap.js` |
| `npm run env:check` still fails with `Missing keys in config manifest: PORT`, and `tools/check-env-example-sync.mjs` is narrower than its name suggests | easy to misread the command as a full env-parity audit when it is a manifest-coverage check over a fixed file set | use `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, and `src/config.js` as the config SSOT chain; treat `npm run env:check` as partial proof only until the manifest gap is fixed | `tools/check-env-example-sync.mjs`, `.env`, `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, `src/config.js` |
| `ReviewPage` still posts `POST /api/v1/review/:category/finalize`, but no audited handler serves that route | Ctrl+S / finalize actions on the scalar review page can hit a stale client path instead of a live mutation | use the live scalar review mutations (`override`, `manual-override`, `key-review-confirm`, `key-review-accept`) and treat `finalize` as client drift | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `src/features/review/api/reviewRoutes.js`, `src/features/review/api/itemMutationRoutes.js` |
| `src/app/api/routeRegistry.js` `GUI_API_ROUTE_ORDER` lists 13 entries but `guiServerRuntime.js` `routeDefinitions` defines 15 route families; `testMode` and `specSeeds` are missing from the constant | tools or docs derived from the stale constant drift from the real server surface; the two missing families are live and mounted but invisible to anything consuming `GUI_API_ROUTE_ORDER` | treat `src/app/api/guiServerRuntime.js` `routeDefinitions` as the route-order SSOT | `src/app/api/routeRegistry.js`, `src/app/api/guiServerRuntime.js` |
| Auto-seed can log `field_studio_map re-seed failed: NOT NULL constraint failed: list_values.list_id` during startup | fresh boots can emit warning noise even while the API still comes up and serves requests | treat the warning as a known startup defect; validate the runtime via `/health`, `/categories`, and `/storage/overview` before assuming boot failure | `src/app/api/specDbRuntime.js` |
| Many review, studio, color-edition-finder, and runtime-ops endpoints return `503 specdb_not_ready` until a category has been compiled and seeded into SQLite | fresh categories can look broken until authority artifacts are compiled and synced | compile the category, let auto-seed/sync complete, or use a pre-seeded category before using these surfaces | `src/features/studio/api/studioRoutes.js`, `src/features/review/api/routeSharedHelpers.js`, `src/features/color-edition/api/colorEditionFinderRoutes.js`, `src/features/indexing/api/runtimeOpsRoutes.js` |
| `src/app/api/routes/infra/graphqlRoutes.js` is orphaned — upstream `intelGraphApi.js` has been deleted, so `POST /api/v1/graphql` always returns `502 graphql_proxy_failed` | the route is still mounted via `infraRoutes.js` and accepts POST requests but can never succeed since the helper server at `localhost:8787` no longer exists | do not call `/api/v1/graphql`; treat it as dead surface until explicitly removed | `src/app/api/routes/infra/graphqlRoutes.js`, `src/app/api/routes/infraRoutes.js` |
| `category_authority/_tests/` exists on disk, but the default categories API intentionally filters it out (directories starting with `_` are excluded) | scripts or docs that infer live categories from the filesystem can drift from the HTTP contract | use `GET /api/v1/categories` for the live category list; treat `_tests/` as harness-only repo content | `category_authority/_tests/`, `src/app/api/routes/infra/categoryRoutes.js` |
| Review override functions no longer perform direct DB sync of `item_field_state`; overrides write to JSON SSOT and rely on the publisher pipeline to project into SQLite | `item_field_state` rows may be stale until the publisher pipeline runs for the affected product | run the publisher pipeline after applying overrides to ensure DB state is current | `src/features/review/domain/overrideWorkflow.js`, `src/features/publisher/index.js` |
| Deleted infrastructure: `intelGraphApi.js`, `batchCommand.js`, `dataUtilityCommands.js`, `publishingCommands.js`, `intelGraphApiCommand.js`, `banditScheduler.js`, `runUntilComplete.js` have been removed | any docs, scripts, or comments referencing these files are stale | treat references to `run-batch`, `intel:api`, Intel Graph helper server, or bandit scheduler as deleted; the Dockerfile now runs `indexlab` directly | git status shows these files as deleted |

## Notes

- Validation snapshot collected on 2026-04-04 (re-validated 2026-04-07):
  - `npm run gui:build` passed.
  - `npm test` passed.
  - `npm run env:check` failed with `Missing keys in config manifest: PORT`.
  - `GET http://127.0.0.1:8788/health` responded successfully.
  - `GET http://127.0.0.1:8788/api/v1/categories` returned `["keyboard","monitor","mouse"]`.
  - `GET http://127.0.0.1:8788/api/v1/process/status` returned `running: false`.
  - `GET http://127.0.0.1:8788/api/v1/storage/overview` returned a live payload with `storage_backend: "local"` and `total_runs: 15`.
  - Startup emitted warning lines of the form `[auto-seed] <category> field_studio_map re-seed failed: NOT NULL constraint failed: list_values.list_id`.
- No verified login/session middleware protects the live GUI/API server.
- `Dockerfile` now runs `indexlab --category mouse` (previously `run-batch`). It is not itself a current runtime defect, but it also was not executed during this audit.
- 2026-04-07 audit confirmed deletion of: `intelGraphApi.js`, `batchCommand.js`, `dataUtilityCommands.js`, `publishingCommands.js`, `intelGraphApiCommand.js`, `banditScheduler.js`, `runUntilComplete.js`. The `intel:api` npm script has been removed from `package.json`.
- 2026-04-07 audit confirmed additions: test-mode route family (`testModeRoutes.js`, `testModeRouteContext.js`), discovery enum support in publisher, `field_audit_cache` DB table in `specDbSchema.js`, field contract audit infrastructure (`src/tests/`).
- Review override functions no longer perform direct DB sync; overrides flow through JSON SSOT and rely on the publisher pipeline for DB projection.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/core/config/settingsKeyMap.js` | runtime-settings GET map includes provider credential keys |
| source | `src/features/settings/api/configRuntimeSettingsHandler.js` | unauthenticated `/runtime-settings` response surface |
| source | `src/features/settings-authority/llmPolicyHandler.js` | unauthenticated `/llm-policy` response surface |
| source | `src/features/settings/api/configIndexingMetricsHandler.js` | unauthenticated `/indexing/llm-config` resolved-key exposure |
| source | `tools/check-env-example-sync.mjs` | env-check script scope and current manifest comparison behavior |
| source | `.env` | repo keeps a checked-in env file; no `.env.example` was verified in the current checkout |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | stale client `finalize` mutation path |
| source | `src/features/review/api/reviewRoutes.js` | review route families do not expose a live `finalize` HTTP mutation |
| source | `src/features/review/api/itemMutationRoutes.js` | live scalar review mutation actions |
| source | `src/app/api/routeRegistry.js` | stale exported route-order constant persists |
| source | `src/app/api/guiServerRuntime.js` | live mounted route list is driven by `routeDefinitions` |
| source | `src/app/api/specDbRuntime.js` | auto-seed warning logging path |
| source | `src/app/api/routes/infra/categoryRoutes.js` | default categories API excludes `tests` |
| source | `src/features/studio/api/studioRoutes.js` | `specdb_not_ready` route behavior for studio surfaces |
| source | `src/features/review/api/routeSharedHelpers.js` | review routes emit `503 specdb_not_ready` before SpecDb is ready |
| source | `src/features/color-edition/api/colorEditionFinderRoutes.js` | color-edition-finder requires ready SpecDb and returns `503` when unavailable |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | runtime-ops endpoints depend on seeded SpecDb state |
| source | `src/app/api/routes/infra/graphqlRoutes.js` | orphaned GraphQL proxy route always returns `502` since upstream helper server deleted |
| source | `src/app/api/routes/infraRoutes.js` | still imports and mounts the orphaned `graphqlRoutes.js` handler |
| command | `npm run env:check` | failing April 4 env-check result |
| command | `npm run gui:build` | successful April 4 GUI build result |
| command | `npm test` | successful April 4 suite result |
| runtime | `http://127.0.0.1:8788/health` | live health endpoint responded |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory excludes the harness directory |
| runtime | `http://127.0.0.1:8788/api/v1/process/status` | live idle process-status payload |
| runtime | `http://127.0.0.1:8788/api/v1/storage/overview` | live storage overview payload responded with local backend state |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Config surface behind the env and LLM-policy issues.
- [Deployment](./deployment.md) - Explains the verified local runtime and the non-primary Docker path.
- [API Surface](../06-references/api-surface.md) - Endpoint contract details for the affected surfaces.

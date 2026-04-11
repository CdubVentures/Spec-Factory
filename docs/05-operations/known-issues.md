# Known Issues

> **Purpose:** Record verified bugs, drift, and operator gotchas so arriving agents do not mistake them for newly introduced regressions.
> **Prerequisites:** [deployment.md](./deployment.md), [../03-architecture/auth-and-sessions.md](../03-architecture/auth-and-sessions.md)
> **Last validated:** 2026-04-10

## Current Issues

| Issue | Impact | Workaround | Tracked in |
|-------|--------|------------|------------|
| `GET /api/v1/runtime-settings`, `GET /api/v1/llm-policy`, and `GET /api/v1/indexing/llm-config` are unauthenticated and can return secret-bearing fields when configured | exposing the server outside a trusted workstation or network leaks configuration secrets | keep the server on a trusted local network only until auth hardening is explicitly commissioned | `src/features/settings/api/configRuntimeSettingsHandler.js`, `src/features/settings-authority/llmPolicyHandler.js`, `src/features/settings/api/configIndexingMetricsHandler.js` |
| `npm run env:check` fails with `Missing keys in config manifest: PORT` | easy to misread the command as a full env-parity audit when it is only a manifest-coverage check over a fixed file set | treat `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, and `src/config.js` as the config SSOT chain; treat `npm run env:check` as partial proof only | `tools/check-env-example-sync.mjs`, `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, `src/config.js` |
| `npm test` is currently red on 2026-04-10 (`7788` total, `7778` passed, `10` failed) | any documentation or workflow that assumes a green full suite is stale | use the failing-file list below as the current baseline before diagnosing new failures | `category_authority/mouse/tests/mouse.contract.test.js`, `scripts/generateSchemaReference.test.js`, `src/core/llm/client/tests/*`, `src/features/review/tests/*`, `src/features/studio/api/tests/*`, `tools/gui-react/src/features/**/__tests__/*`, `tools/test-image-finder.js` |
| `src/app/api/routeRegistry.js` `GUI_API_ROUTE_ORDER` lists 14 entries but `guiServerRuntime.js` `routeDefinitions` defines 17 route families; `unitRegistry`, `specSeeds`, and `testMode` are missing from the constant | tools or docs derived from the stale constant drift from the real server surface | treat `src/app/api/guiServerRuntime.js` `routeDefinitions` as the route-order SSOT | `src/app/api/routeRegistry.js`, `src/app/api/guiServerRuntime.js` |
| `tools/gui-react/src/features/review/components/ReviewPage.tsx` still posts `POST /api/v1/review/:category/finalize`, but no audited handler serves that route | Ctrl+S or finalize actions on the scalar review page can hit a dead client path instead of a live mutation | use the live scalar review mutations (`override`, `manual-override`, `key-review-confirm`, `key-review-accept`) and treat `finalize` as client drift | `tools/gui-react/src/features/review/components/ReviewPage.tsx`, `src/features/review/api/reviewRoutes.js`, `src/features/review/api/itemMutationRoutes.js` |
| `src/app/api/routes/infra/graphqlRoutes.js` is orphaned; upstream `intelGraphApi.js` has been deleted, so `POST /api/v1/graphql` always returns `502 graphql_proxy_failed` | callers can misinterpret the mounted route as a live GraphQL surface | do not call `/api/v1/graphql`; treat it as dead surface until explicitly removed | `src/app/api/routes/infra/graphqlRoutes.js`, `src/app/api/routes/infraRoutes.js` |
| Auto-seed can emit warning noise during startup even while the API still comes up and serves requests | fresh boots can look broken if logs are treated as hard failure proof | validate the runtime with `/health`, `/categories`, and `/storage/overview` before assuming boot failure | `src/app/api/specDbRuntime.js` |
| Review, studio, color-edition-finder, publisher, and runtime-ops surfaces depend on a ready category SpecDb | fresh or uncompiled categories can return `404 no db for category` or `503 specdb_not_ready` | compile the category, let auto-seed/sync complete, or use a pre-seeded category before exercising these surfaces | `src/features/studio/api/studioRoutes.js`, `src/features/review/api/routeSharedHelpers.js`, `src/features/color-edition/api/colorEditionFinderRoutes.js`, `src/features/publisher/api/publisherRoutes.js`, `src/features/indexing/api/runtimeOpsRoutes.js` |

## Current Failing Test Baseline

- `category_authority/mouse/tests/mouse.contract.test.js`
- `scripts/generateSchemaReference.test.js`
- `src/core/llm/client/tests/llmRoutingFallbackDisableLimits.test.js`
- `src/core/llm/client/tests/llmRoutingOnModelResolved.test.js`
- `src/features/review/tests/reviewEcosystem.component.test.js`
- `src/features/studio/api/tests/studioFieldStudioMapContracts.test.js`
- `tools/gui-react/src/features/pipeline-settings/state/__tests__/settingsSurfaceContracts.test.js`
- `tools/gui-react/src/features/runtime-ops/panels/workers/__tests__/llmDashboardHelpers.test.ts`
- `tools/test-image-finder.js`

## Notes

- Validation snapshot collected on 2026-04-10:
  - `npm run gui:build` passed.
  - `npm test` failed with `10` failures.
  - `npm run env:check` failed with `Missing keys in config manifest: PORT`.
  - `GET /health`, `GET /api/v1/categories`, `GET /api/v1/process/status`, and `GET /api/v1/storage/overview` all responded successfully.
- No verified login/session middleware protects the live GUI/API server.
- `Dockerfile` runs `node src/app/cli/spec.js indexlab --category mouse`; it is a CLI-oriented container path, not the primary GUI deployment model.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/core/config/settingsKeyMap.js` | runtime-settings GET map includes provider credential keys |
| source | `src/features/settings/api/configRuntimeSettingsHandler.js` | unauthenticated `/runtime-settings` response surface |
| source | `src/features/settings-authority/llmPolicyHandler.js` | unauthenticated `/llm-policy` response surface |
| source | `src/features/settings/api/configIndexingMetricsHandler.js` | unauthenticated `/indexing/llm-config` resolved-key exposure |
| source | `tools/check-env-example-sync.mjs` | env-check script scope and current manifest comparison behavior |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | stale client `finalize` mutation path |
| source | `src/features/review/api/reviewRoutes.js` | review route families do not expose a live `finalize` HTTP mutation |
| source | `src/features/review/api/itemMutationRoutes.js` | live scalar review mutation actions |
| source | `src/app/api/routeRegistry.js` | stale exported route-order constant persists |
| source | `src/app/api/guiServerRuntime.js` | live mounted route list is driven by `routeDefinitions` |
| source | `src/app/api/specDbRuntime.js` | auto-seed warning logging path |
| source | `src/app/api/routes/infra/graphqlRoutes.js` | orphaned GraphQL proxy route always returns `502` |
| source | `src/features/publisher/api/publisherRoutes.js` | publisher requires ready SpecDb for category reads |
| command | `npm run env:check` | failing env-check result on 2026-04-10 |
| command | `npm run gui:build` | successful GUI build on 2026-04-10 |
| command | `npm test` | failing full-suite result on 2026-04-10 |
| runtime | `GET /health` | live health endpoint responded on 2026-04-10 |
| runtime | `GET /api/v1/storage/overview` | live storage overview payload responded with local backend state on 2026-04-10 |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - config surface behind the env and LLM-policy issues.
- [Deployment](./deployment.md) - explains the verified local runtime and packaging model.
- [API Surface](../06-references/api-surface.md) - endpoint contract details for the affected surfaces.
